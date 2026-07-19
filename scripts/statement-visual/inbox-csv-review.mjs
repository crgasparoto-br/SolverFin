import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for Inbox CSV review validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateInboxCsvReview(browser.cdp);
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
  join(outputDir, "issue-494-inbox-csv-review.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue #494 Inbox CSV review keyboard and mobile validation passed.");
}

async function validateInboxCsvReview(cdp) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await evaluate(
    cdp,
    `(() => fetch('/api/accounts')
      .then(async (response) => ({ ok: response.ok, status: response.status, body: await response.json() }))
      .then(async (accountsResponse) => {
        if (!accountsResponse.ok) return accountsResponse;
        const account = (accountsResponse.body.accounts || []).find((item) => item.status === 'active');
        if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };
        const suffix = Date.now().toString(36);
        const createResponse = await fetch('/api/import-batches/csv', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            originalFileName: 'validacao-inbox-' + suffix + '.csv',
            content: 'date,description,amount\\n2026-07-18,Validação móvel ' + suffix + ',-12.34',
            accountId: account.id,
            consentAccepted: true
          })
        });
        return { ok: createResponse.ok, status: createResponse.status, body: await createResponse.json(), accountId: account.id };
      }))()`,
  );
  assert.equal(
    fixture.ok,
    true,
    `CSV fixture creation failed: ${fixture.status} ${JSON.stringify(fixture.body)}`,
  );
  const batchId = fixture.body.importBatch.id;

  await navigate(cdp, `${baseUrl}/inbox?importBatchId=${encodeURIComponent(batchId)}`);
  try {
    await waitFor(cdp, `Boolean(document.querySelector('[data-line-action="edit"]'))`);
  } catch (error) {
    const pageDiagnostic = await evaluate(
      cdp,
      `(async () => {
        const readJson = async (path) => {
          const response = await fetch(path);
          return { status: response.status, body: await response.json().catch(() => ({})) };
        };
        const list = await readJson('/api/import-batches?sourceKind=csv&status=all');
        const detailResponse = await readJson('/api/import-batches/${batchId}');
        return {
          href: window.location.href,
          workspaceStatus: document.getElementById('import-workspace-status')?.textContent || '',
          workspaceClass: document.getElementById('import-workspace-status')?.className || '',
          batchListText: document.getElementById('import-batch-list')?.textContent || '',
          detailText: document.getElementById('import-batch-detail')?.textContent || '',
          detailHtml: (document.getElementById('import-batch-detail')?.innerHTML || '').slice(0, 4000),
          bodyText: (document.body?.innerText || '').slice(0, 4000),
          editActions: document.querySelectorAll('[data-line-action="edit"]').length,
          list,
          detailResponse
        };
      })()`,
    );
    await screenshot(cdp, join(outputDir, "issue-494-inbox-csv-timeout.png"));
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; page=${JSON.stringify(pageDiagnostic)}`,
    );
  }

  const initial = await evaluate(
    cdp,
    `(() => {
      const edit = document.querySelector('[data-line-action="edit"]');
      const heading = document.getElementById('import-detail-heading');
      return {
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        editVisible: Boolean(edit && edit.getBoundingClientRect().width > 0),
        headingFocused: document.activeElement === heading,
        summaryText: document.querySelector('.import-summary')?.textContent || ''
      };
    })()`,
  );
  check(initial.bodyFitsViewport, "Inbox CSV detail overflows the mobile viewport", initial);
  check(initial.editVisible, "CSV edit action is not visible on mobile", initial);
  check(initial.headingFocused, "Deep-linked CSV detail did not receive initial focus", initial);
  for (const label of [
    "Válidas",
    "Pendentes",
    "Bloqueadas",
    "Aprovadas",
    "Conciliadas",
    "Ignoradas como duplicadas",
    "Rejeitadas",
    "Lançamentos vinculados",
    "Problemas",
  ]) {
    check(
      initial.summaryText.includes(label),
      `CSV summary is missing the label: ${label}`,
      initial,
    );
  }

  await evaluate(
    cdp,
    `(() => {
      const edit = document.querySelector('[data-line-action="edit"]');
      edit.focus();
      return document.activeElement === edit;
    })()`,
  );
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitFor(cdp, `document.getElementById('csv-line-edit-dialog')?.open === true`);

  const opened = await evaluate(
    cdp,
    `(() => {
      const dialog = document.getElementById('csv-line-edit-dialog');
      const form = document.getElementById('csv-line-edit-form');
      return {
        open: dialog.open,
        labelledBy: dialog.getAttribute('aria-labelledby'),
        activeName: document.activeElement?.getAttribute('name') || '',
        originalDescription: form.elements.description.value,
        originalAmount: form.elements.amount.value
      };
    })()`,
  );
  check(opened.open, "CSV line edit dialog did not open", opened);
  check(
    opened.labelledBy === "csv-line-edit-title",
    "CSV line edit dialog is not labelled",
    opened,
  );
  check(opened.activeName === "occurredOn", "CSV edit focus did not move into the dialog", opened);

  await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-line-edit-form');
      form.elements.description.value = 'Valor preservado após erro';
      form.elements.amount.value = '0';
      form.requestSubmit();
      return true;
    })()`,
  );
  await waitFor(
    cdp,
    `document.getElementById('csv-line-edit-status')?.classList.contains('error') === true`,
  );
  const failedSave = await evaluate(
    cdp,
    `(() => {
      const dialog = document.getElementById('csv-line-edit-dialog');
      const form = document.getElementById('csv-line-edit-form');
      const status = document.getElementById('csv-line-edit-status');
      return {
        open: dialog.open,
        description: form.elements.description.value,
        amount: form.elements.amount.value,
        status: status.textContent || ''
      };
    })()`,
  );
  check(failedSave.open, "Validation failure closed the CSV edit dialog", failedSave);
  check(
    failedSave.description === "Valor preservado após erro" && failedSave.amount === "0",
    "CSV edit values were not preserved after validation failure",
    failedSave,
  );
  await screenshot(cdp, join(outputDir, "issue-494-inbox-csv-mobile-edit-error.png"));

  await pressKey(cdp, "Escape", "Escape", 27);
  await waitFor(cdp, `document.getElementById('csv-line-edit-dialog')?.open === false`);
  const closed = await evaluate(
    cdp,
    `(() => ({
      returnedToEdit: document.activeElement?.matches('[data-line-action="edit"]') === true,
      bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    }))()`,
  );
  check(closed.returnedToEdit, "Closing the CSV edit dialog did not restore focus", closed);
  check(closed.bodyFitsViewport, "Inbox overflowed after closing the CSV dialog", closed);

  return {
    viewport: "390x844",
    batchId,
    initial,
    opened,
    failedSave,
    closed,
    screenshot: "issue-494-inbox-csv-mobile-edit-error.png",
  };
}

async function waitFor(cdp, expression, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // The execution context can be replaced while navigation settles.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function pressKey(cdp, key, code, keyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    text: key === "Enter" ? "\r" : key.length === 1 ? key : "",
    unmodifiedText: key === "Enter" ? "\r" : key.length === 1 ? key : "",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await sleep(100);
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
