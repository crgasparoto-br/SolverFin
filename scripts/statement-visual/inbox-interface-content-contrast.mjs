import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for Inbox content and contrast validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateInboxContentAndContrast(browser.cdp);
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
  join(outputDir, "issue-525-inbox-content-contrast.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Inbox full-content visibility, access and disabled contrast validation passed.");
}

async function validateInboxContentAndContrast(cdp) {
  await setViewport(cdp, 1366, 768);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await createFixture(cdp);
  await navigate(cdp, `${baseUrl}/inbox?importBatchId=${encodeURIComponent(fixture.batchId)}`);
  await waitFor(
    cdp,
    `document.querySelectorAll('.row-summary dd[data-full-value-enhanced="true"]').length >= 5`,
  );

  const desktop = await inspectViewport(cdp, {
    width: 1366,
    height: 768,
    fullDescription: fixture.fullDescription,
    screenshotName: "issue-525-inbox-content-contrast-desktop-1366x768.png",
  });
  validateMetrics(desktop, { requireFiveRows: true });

  const mobile = await inspectViewport(cdp, {
    width: 390,
    height: 844,
    fullDescription: fixture.fullDescription,
    screenshotName: "issue-525-inbox-content-contrast-mobile-390x844.png",
  });
  validateMetrics(mobile, { requireFiveRows: false });

  return { batchId: fixture.batchId, desktop, mobile };
}

async function createFixture(cdp) {
  const fixture = await evaluate(
    cdp,
    `(async () => {
      const readJson = async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({}))
      });
      const accountsResponse = await readJson(await fetch('/api/accounts'));
      if (!accountsResponse.ok) return accountsResponse;
      const account = (accountsResponse.body.accounts || []).find((item) => item.status === 'active');
      if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };

      const suffix = Date.now().toString(36);
      const fullDescription = 'Descrição financeira extensa usada para validar acesso integral por teclado foco e ponteiro sem aumentar permanentemente a altura da linha ' + suffix + ' complemento operacional para distinguir lançamentos semelhantes durante a revisão';
      const rows = Array.from({ length: 10 }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        const description = index === 0 ? fullDescription : 'Linha de contraste ' + String(index + 1) + ' ' + suffix;
        const amount = index === 0
          ? '1234567.89'
          : index % 3 === 0
            ? String(100 + index) + '.50'
            : '-' + String(20 + index) + '.75';
        return '2026-07-' + day + ',' + description + ',' + amount;
      });
      const created = await readJson(await fetch('/api/import-batches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileName: 'issue-525-content-contrast-' + suffix + '.csv',
          content: ['date,description,amount', ...rows].join('\\n'),
          accountId: account.id,
          consentAccepted: true
        })
      }));
      if (!created.ok) return created;
      return {
        ok: true,
        status: 200,
        body: {
          batchId: created.body.importBatch.id,
          fullDescription
        }
      };
    })()`,
  );

  assert.equal(
    fixture.ok,
    true,
    `Issue 525 content fixture failed: ${fixture.status} ${JSON.stringify(fixture.body)}`,
  );
  return fixture.body;
}

function validateMetrics(metrics, { requireFiveRows }) {
  check(metrics.bodyFitsViewport, `Inbox overflows horizontally at ${metrics.viewport}`, metrics);
  check(
    metrics.descriptionPreviewOverflows,
    `Long description did not exercise the truncation boundary at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.dateAndAmountAreFullyVisible,
    `Date or amount is clipped at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.financialFieldsAreFullyAccessible,
    `One or more financial fields lack full-content access at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.descriptionIsFullyAccessible,
    `Full description is not accessible by focus at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.accountIsFullyAccessible,
    `Account value is not exposed through the same accessible pattern at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.tooltipIsVisible,
    `Full-value popover is not visible at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.tooltipFitsViewport,
    `Full-value popover overflows at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.disabledButtonContrast >= 4.5,
    `Disabled action contrast is ${metrics.disabledButtonContrast} at ${metrics.viewport}`,
    metrics,
  );
  check(
    metrics.disabledButtonOpacity === 1,
    `Disabled action still relies on reduced opacity at ${metrics.viewport}`,
    metrics,
  );
  if (requireFiveRows) {
    check(
      metrics.completeRows >= 5,
      `Expected at least 5 complete rows at ${metrics.viewport}, found ${metrics.completeRows}`,
      metrics,
    );
  }
}

async function inspectViewport(cdp, { width, height, fullDescription, screenshotName }) {
  await setViewport(cdp, width, height);
  await evaluate(cdp, `(() => { window.scrollTo(0, 0); return true; })()`);
  await sleep(250);

  const metrics = await evaluate(
    cdp,
    `(() => {
      const expectedDescription = ${JSON.stringify(fullDescription)};
      const financialLabels = ['Data', 'Tipo', 'Valor', 'Descrição', 'Conta de referência'];
      const fullyVisibleLabels = ['Data', 'Valor'];
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const withinViewport = (element) => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      };
      const findValue = (label, root = document) => [...root.querySelectorAll('.row-summary > div')]
        .find((group) => group.querySelector('dt')?.textContent?.trim() === label)
        ?.querySelector('dd');
      const readField = (label, root) => {
        const value = findValue(label, root);
        const preview = value?.querySelector('.row-summary-value-preview');
        const popover = value?.querySelector('.row-summary-full-value');
        const fullValue = value?.dataset.fullValue || '';
        return {
          label,
          fullValue,
          previewOverflows: Boolean(preview && preview.scrollWidth > preview.clientWidth),
          fullyAccessible: Boolean(
            value &&
            value.dataset.fullValueEnhanced === 'true' &&
            value.tabIndex === 0 &&
            value.getAttribute('aria-label') === label + ': ' + fullValue &&
            value.getAttribute('title') === fullValue &&
            popover?.textContent?.trim() === fullValue
          )
        };
      };
      const parseRgb = (value) => {
        const parts = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) || [];
        return parts.length === 3 ? parts : [0, 0, 0];
      };
      const luminance = (rgb) => {
        const values = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
      };
      const contrast = (foreground, background) => {
        const left = luminance(parseRgb(foreground));
        const right = luminance(parseRgb(background));
        return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
      };

      const description = [...document.querySelectorAll('.row-summary > div')]
        .map((group) => group.querySelector('dd'))
        .find((value) => value?.dataset.fullValue === expectedDescription);
      const targetRow = description?.closest('.import-row');
      const financialFields = targetRow
        ? financialLabels.map((label) => readField(label, targetRow))
        : [];
      const account = targetRow ? findValue('Conta de referência', targetRow) : null;
      const preview = description?.querySelector('.row-summary-value-preview');
      const popover = description?.querySelector('.row-summary-full-value');
      description?.scrollIntoView({ block: "center", inline: "nearest" });
      description?.focus();
      const popoverStyle = popover ? getComputedStyle(popover) : null;
      const popoverRect = popover?.getBoundingClientRect();
      const disabledButton = document.getElementById('approve-selected-import-lines');
      const disabledStyle = disabledButton ? getComputedStyle(disabledButton) : null;
      const rows = [...document.querySelectorAll('.import-row')];

      return {
        viewport: window.innerWidth + 'x' + window.innerHeight,
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        completeRows: rows.filter(withinViewport).length,
        descriptionPreviewOverflows: Boolean(preview && preview.scrollWidth > preview.clientWidth),
        dateAndAmountAreFullyVisible: fullyVisibleLabels.every(
          (label) => !financialFields.find((field) => field.label === label)?.previewOverflows
        ),
        financialFieldsAreFullyAccessible:
          financialFields.length === financialLabels.length &&
          financialFields.every((field) => field.fullyAccessible),
        financialFields,
        descriptionIsFullyAccessible: Boolean(
          description &&
          description.tabIndex === 0 &&
          description.getAttribute('aria-label') === 'Descrição: ' + expectedDescription &&
          description.getAttribute('title') === expectedDescription &&
          popover?.textContent?.trim() === expectedDescription
        ),
        accountIsFullyAccessible: Boolean(
          account &&
          account.dataset.fullValueEnhanced === 'true' &&
          account.tabIndex === 0 &&
          account.getAttribute('aria-label')?.startsWith('Conta de referência: ')
        ),
        tooltipIsVisible: Boolean(popoverStyle && popoverStyle.display !== 'none' && visible(popover)),
        tooltipFitsViewport: Boolean(
          popoverRect &&
          popoverRect.left >= 0 &&
          popoverRect.right <= window.innerWidth &&
          popoverRect.top >= 0 &&
          popoverRect.bottom <= window.innerHeight
        ),
        disabledButtonContrast: disabledStyle
          ? Math.round(contrast(disabledStyle.color, disabledStyle.backgroundColor) * 100) / 100
          : 0,
        disabledButtonOpacity: disabledStyle ? Number(disabledStyle.opacity) : 0,
        disabledButtonColors: disabledStyle
          ? { color: disabledStyle.color, backgroundColor: disabledStyle.backgroundColor }
          : null,
        descriptionDimensions: description
          ? {
              width: Math.round(description.getBoundingClientRect().width),
              previewClientWidth: preview?.clientWidth || 0,
              previewScrollWidth: preview?.scrollWidth || 0,
            }
          : null,
      };
    })()`,
  );

  await screenshot(cdp, join(outputDir, screenshotName));
  return { ...metrics, screenshot: screenshotName };
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

async function waitFor(cdp, expression, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // The page can briefly replace its execution context while loading.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}
