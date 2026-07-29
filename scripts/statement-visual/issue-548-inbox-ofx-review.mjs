import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 548 OFX validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateInboxOfxReview(browser.cdp);
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  failures.push({ message: fatalError.message, details: fatalError });
} finally {
  await browser.close(outputDir);
}

const evidence = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  fatalError,
  ...report,
};
await writeFile(
  join(outputDir, "issue-548-inbox-ofx-review.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 548 Inbox OFX review validation passed.");
}

async function validateInboxOfxReview(cdp) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await navigate(cdp, `${baseUrl}/inbox`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-open-dialog="csv-import-dialog"]'))`);

  const suffix = Date.now().toString(36);
  const normalFileName = `issue-548-ofx-${suffix}.ofx`;
  const normalDescription = `Compra OFX visual ${suffix}`;
  const setup = await selectOfxFile(cdp, {
    fileName: normalFileName,
    description: normalDescription,
    fitId: `fit-${suffix}`,
  });
  check(setup.dialogOpen, "OFX import dialog did not open", setup);
  check(setup.fileAccepted, "OFX file was not attached to the import input", setup);
  check(setup.delimiterHidden, "CSV delimiter stayed visible for OFX", setup);
  check(setup.mappingHidden, "CSV mapping stayed visible for OFX", setup);

  await evaluate(cdp, `document.getElementById('preview-csv-import').click()`);
  await waitFor(
    cdp,
    `document.getElementById('csv-import-status')?.textContent.includes('Preview pronto') === true`,
  );
  const preview = await evaluate(
    cdp,
    `(() => ({
      bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      previewText: document.getElementById('csv-preview-result')?.textContent || '',
      createEnabled: document.getElementById('create-csv-import')?.disabled === false,
      delimiterHidden: document.getElementById('csv-delimiter-field')?.hidden === true,
      mappingHidden: document.getElementById('csv-mapping-fields')?.hidden === true
    }))()`,
  );
  check(preview.bodyFitsViewport, "OFX preview overflows the mobile viewport", preview);
  check(
    preview.previewText.includes(normalDescription),
    "OFX preview did not show normalized row",
    preview,
  );
  check(preview.createEnabled, "OFX creation was not enabled after ready preview", preview);
  check(
    preview.delimiterHidden && preview.mappingHidden,
    "CSV controls reappeared after OFX preview",
    preview,
  );

  await evaluate(cdp, `document.getElementById('csv-import-form').requestSubmit()`);
  await waitFor(cdp, `new URL(window.location.href).searchParams.has('importBatchId')`);
  await waitFor(
    cdp,
    `document.getElementById('import-batch-detail')?.textContent.includes('${escapeJs(normalFileName)}') === true`,
  );
  const created = await evaluate(
    cdp,
    `(() => ({
      href: window.location.href,
      listText: document.getElementById('import-batch-list')?.textContent || '',
      detailText: document.getElementById('import-batch-detail')?.textContent || '',
      bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    }))()`,
  );
  check(created.listText.includes("OFX"), "Mixed history did not label the OFX origin", created);
  check(
    created.detailText.includes(normalFileName),
    "Created OFX batch detail was not opened",
    created,
  );
  check(created.bodyFitsViewport, "Created OFX detail overflows the mobile viewport", created);

  await navigate(cdp, created.href);
  await waitFor(
    cdp,
    `document.getElementById('import-batch-detail')?.textContent.includes('${escapeJs(normalFileName)}') === true`,
  );
  const restored = await evaluate(
    cdp,
    `(() => ({
      headingFocused: document.activeElement === document.getElementById('import-detail-heading'),
      detailText: document.getElementById('import-batch-detail')?.textContent || ''
    }))()`,
  );
  check(restored.headingFocused, "Deep-linked OFX detail did not receive focus", restored);
  check(
    restored.detailText.includes(normalDescription),
    "Deep-linked OFX detail lost its normalized row",
    restored,
  );

  const ambiguousFileName = `issue-548-timeout-${suffix}.ofx`;
  const ambiguousDescription = `OFX timeout recuperado ${suffix}`;
  await selectOfxFile(cdp, {
    fileName: ambiguousFileName,
    description: ambiguousDescription,
    fitId: `timeout-${suffix}`,
  });
  await evaluate(cdp, `document.getElementById('preview-csv-import').click()`);
  await waitFor(
    cdp,
    `document.getElementById('csv-import-status')?.textContent.includes('Preview pronto') === true`,
  );
  await evaluate(
    cdp,
    `(() => {
      const originalFetch = window.fetch.bind(window);
      let injected = false;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!injected && url === '/api/import-batches/ofx' && init?.method === 'POST') {
          injected = true;
          await originalFetch(input, init);
          window.fetch = originalFetch;
          throw new DOMException('Injected ambiguous failure', 'AbortError');
        }
        return originalFetch(input, init);
      };
      document.getElementById('csv-import-form').requestSubmit();
      return true;
    })()`,
  );
  await waitFor(
    cdp,
    `document.getElementById('create-csv-import')?.disabled === false && document.getElementById('import-batch-list')?.textContent.includes('${escapeJs(ambiguousFileName)}') === true`,
    20_000,
  );
  const recovered = await evaluate(
    cdp,
    `(() => ({
      dialogOpen: document.getElementById('csv-import-dialog')?.open === true,
      retryEnabled: document.getElementById('create-csv-import')?.disabled === false,
      listText: document.getElementById('import-batch-list')?.textContent || '',
      previewStatus: document.getElementById('csv-import-status')?.textContent || ''
    }))()`,
  );
  check(recovered.dialogOpen, "Ambiguous failure unexpectedly closed the dialog", recovered);
  check(recovered.retryEnabled, "Retry was not re-enabled after state reload", recovered);
  check(
    recovered.listText.includes(ambiguousFileName),
    "Ambiguous failure did not reload the persisted batch before retry",
    recovered,
  );
  check(
    recovered.previewStatus.includes("demorou demais"),
    "Timeout feedback was not preserved",
    recovered,
  );

  const mobileScreenshot = "issue-548-inbox-ofx-mobile-390x844.png";
  await screenshot(cdp, join(outputDir, mobileScreenshot));

  await setViewport(cdp, 1440, 900);
  await navigate(cdp, created.href);
  await waitFor(
    cdp,
    `document.getElementById('import-batch-detail')?.textContent.includes('${escapeJs(normalFileName)}') === true`,
  );
  const desktop = await evaluate(
    cdp,
    `(() => ({
      bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      listText: document.getElementById('import-batch-list')?.textContent || '',
      detailText: document.getElementById('import-batch-detail')?.textContent || '',
      headingVisible: Boolean(document.getElementById('import-detail-heading')?.offsetParent)
    }))()`,
  );
  check(desktop.bodyFitsViewport, "OFX detail overflows the desktop viewport", desktop);
  check(desktop.listText.includes("OFX"), "Desktop history did not label the OFX origin", desktop);
  check(
    desktop.detailText.includes(normalFileName) && desktop.detailText.includes(normalDescription),
    "Desktop OFX detail did not preserve the selected batch",
    desktop,
  );
  check(desktop.headingVisible, "Desktop OFX detail heading is not visible", desktop);
  const desktopScreenshot = "issue-548-inbox-ofx-desktop-1440x900.png";
  await screenshot(cdp, join(outputDir, desktopScreenshot));

  return {
    viewport: "390x844",
    desktopViewport: "1440x900",
    normalFileName,
    ambiguousFileName,
    setup,
    preview,
    created,
    restored,
    recovered,
    desktop,
    screenshot: mobileScreenshot,
    desktopScreenshot,
  };
}

async function selectOfxFile(cdp, { fileName, description, fitId }) {
  await evaluate(
    cdp,
    `(() => {
      const trigger = document.querySelector('[data-open-dialog="csv-import-dialog"]');
      if (!document.getElementById('csv-import-dialog')?.open) trigger.click();
      const form = document.getElementById('csv-import-form');
      const account = [...form.elements.accountId.options].find((option) => option.value);
      if (!account) return { dialogOpen: false, fileAccepted: false, error: 'No active account option' };
      const content = 'OFXHEADER:100\\nDATA:OFXSGML\\n<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260720<TRNAMT>-43.21<FITID>${escapeJs(fitId)}<NAME>${escapeJs(description)}</BANKTRANLIST></STMTRS></OFX>';
      const file = new File([content], '${escapeJs(fileName)}', { type: 'application/x-ofx' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById('csv-import-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      form.elements.accountId.value = account.value;
      form.elements.accountId.dispatchEvent(new Event('change', { bubbles: true }));
      form.elements.consentAccepted.checked = true;
      form.elements.consentAccepted.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        dialogOpen: document.getElementById('csv-import-dialog')?.open === true,
        fileAccepted: input.files?.[0]?.name === '${escapeJs(fileName)}',
        delimiterHidden: document.getElementById('csv-delimiter-field')?.hidden === true,
        mappingHidden: document.getElementById('csv-mapping-fields')?.hidden === true
      };
    })()`,
  );
  return evaluate(
    cdp,
    `(() => ({
      dialogOpen: document.getElementById('csv-import-dialog')?.open === true,
      fileAccepted: document.getElementById('csv-import-file')?.files?.[0]?.name === '${escapeJs(fileName)}',
      delimiterHidden: document.getElementById('csv-delimiter-field')?.hidden === true,
      mappingHidden: document.getElementById('csv-mapping-fields')?.hidden === true
    }))()`,
  );
}

async function waitFor(cdp, expression, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}

function escapeJs(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}
