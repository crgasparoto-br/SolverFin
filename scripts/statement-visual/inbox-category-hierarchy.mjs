import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for Inbox category hierarchy validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let report;
let fatalError;

try {
  report = await validateCategoryHierarchy(browser.cdp);
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
  join(outputDir, "issue-514-inbox-category-hierarchy.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Inbox category hierarchy validation passed.");
}

async function validateCategoryHierarchy(cdp) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const fixture = await evaluate(
    cdp,
    `(async () => {
      const request = async (path, options) => {
        const response = await fetch(path, options);
        return {
          ok: response.ok,
          status: response.status,
          body: await response.json().catch(() => ({}))
        };
      };
      const accounts = await request('/api/accounts');
      if (!accounts.ok) return accounts;
      const account = (accounts.body.accounts || []).find((item) => item.status === 'active');
      if (!account) return { ok: false, status: 0, body: { error: 'No active account' } };
      const suffix = Date.now().toString(36);
      const createCategory = async (payload) => {
        const result = await request('/api/categories', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!result.ok) throw new Error('Category fixture failed: ' + result.status + ' ' + JSON.stringify(result.body));
        return result.body.category;
      };
      const expenseRoot = await createCategory({ name: 'Auditoria despesa ' + suffix, kind: 'expense' });
      const expenseChild = await createCategory({
        name: 'Categoria visual ' + suffix,
        kind: 'expense',
        parentCategoryId: expenseRoot.id
      });
      const incomeRoot = await createCategory({ name: 'Auditoria receita ' + suffix, kind: 'income' });
      const incomeChild = await createCategory({
        name: 'Categoria visual ' + suffix,
        kind: 'income',
        parentCategoryId: incomeRoot.id
      });
      const imported = await request('/api/import-batches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileName: 'hierarquia-' + suffix + '.csv',
          content: 'date,description,amount\\n2026-07-21,Hierarquia visual ' + suffix + ',-12.34',
          accountId: account.id,
          consentAccepted: true
        })
      });
      return {
        ...imported,
        expenseChildId: expenseChild.id,
        incomeChildId: incomeChild.id,
        expensePath: expenseRoot.name + ' › ' + expenseChild.name,
        incomePath: incomeRoot.name + ' › ' + incomeChild.name
      };
    })()`,
  );
  assert.equal(
    fixture.ok,
    true,
    `Fixture failed: ${fixture.status} ${JSON.stringify(fixture.body)}`,
  );
  const batchId = fixture.body.importBatch.id;

  await navigate(cdp, `${baseUrl}/inbox?importBatchId=${encodeURIComponent(batchId)}`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-line-action="edit"]'))`);
  await evaluate(cdp, `document.querySelector('[data-line-action="edit"]').focus()`);
  await pressKey(cdp, "Enter", "Enter", 13);
  await waitFor(cdp, `document.getElementById('csv-line-edit-dialog')?.open === true`);

  const visitedFields = [];
  for (let index = 0; index < 12; index += 1) {
    const activeName = await evaluate(cdp, `document.activeElement?.getAttribute('name') || ''`);
    visitedFields.push(activeName);
    if (activeName === "categoryId") break;
    await pressKey(cdp, "Tab", "Tab", 9);
  }
  const keyboard = {
    activeName: visitedFields.at(-1) || "",
    visitedFields,
  };
  check(
    keyboard.activeName === "categoryId",
    "Keyboard navigation did not reach category",
    keyboard,
  );

  const hierarchy = await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-line-edit-form');
      const select = form.elements.categoryId;
      const originalSelect = select;
      const description = form.elements.description.value;
      const amount = form.elements.amount.value;
      const initialOptions = [...select.options].map((option) => ({
        value: option.value,
        text: option.textContent || ''
      }));
      const expenseId = ${JSON.stringify(fixture.expenseChildId)};
      const incomeId = ${JSON.stringify(fixture.incomeChildId)};
      select.value = expenseId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.focus();
      form.elements.kind.value = 'income';
      form.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
      const status = document.getElementById('csv-line-edit-status');
      const afterKindChange = {
        selectionCleared: select.value === '',
        selectPreserved: select === originalSelect,
        focusPreserved: document.activeElement === select,
        warning: status?.classList.contains('warning') === true &&
          (status.textContent || '').includes('categoria foi removida'),
        otherFieldsPreserved: form.elements.description.value === description &&
          form.elements.amount.value === amount
      };
      const incomeOptions = [...select.options].map((option) => ({
        value: option.value,
        text: option.textContent || ''
      }));
      select.value = incomeId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        firstOption: initialOptions[0],
        expenseOption: initialOptions.find((option) => option.value === expenseId),
        incomeOption: incomeOptions.find((option) => option.value === incomeId),
        transferVisible: [...initialOptions, ...incomeOptions].some((option) => /transfer/i.test(option.text)),
        afterKindChange,
        selectedIncomeId: select.value
      };
    })()`,
  );

  check(
    hierarchy.firstOption?.value === "" && hierarchy.firstOption?.text === "Sem categoria",
    "Sem categoria is not the first option",
    hierarchy,
  );
  check(
    hierarchy.expenseOption?.text === fixture.expensePath,
    "Expense option does not contain the complete path",
    hierarchy,
  );
  check(
    hierarchy.incomeOption?.text === fixture.incomePath,
    "Income option does not contain the complete path",
    hierarchy,
  );
  check(!hierarchy.transferVisible, "Transfer category appears in CSV correction", hierarchy);
  check(
    hierarchy.afterKindChange.selectionCleared,
    "Incompatible selection was not cleared",
    hierarchy,
  );
  check(hierarchy.afterKindChange.selectPreserved, "Category select was replaced", hierarchy);
  check(hierarchy.afterKindChange.focusPreserved, "Category focus was not preserved", hierarchy);
  check(hierarchy.afterKindChange.warning, "Incompatibility warning was not announced", hierarchy);
  check(
    hierarchy.afterKindChange.otherFieldsPreserved,
    "Changing kind modified other fields",
    hierarchy,
  );
  check(
    hierarchy.selectedIncomeId === fixture.incomeChildId,
    "Compatible income category could not be selected",
    hierarchy,
  );

  await evaluate(cdp, `document.getElementById('csv-line-edit-form').requestSubmit()`);
  await waitFor(cdp, `document.getElementById('csv-line-edit-dialog')?.open === false`);
  await openLineEditDialogByClick(cdp);

  const reopened = await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-line-edit-form');
      return {
        kind: form.elements.kind.value,
        categoryId: form.elements.categoryId.value,
        selectedText: form.elements.categoryId.selectedOptions[0]?.textContent || '',
        bodyFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth
      };
    })()`,
  );
  check(reopened.kind === "income", "Saved kind was not preserved", reopened);
  check(
    reopened.categoryId === fixture.incomeChildId,
    "Saved category ID was not preserved",
    reopened,
  );
  check(
    reopened.selectedText === fixture.incomePath,
    "Reopened option lost the complete path",
    reopened,
  );
  check(reopened.bodyFitsViewport, "Category selector overflowed the mobile viewport", reopened);

  await screenshot(cdp, join(outputDir, "issue-514-inbox-category-hierarchy.png"));
  await pressKey(cdp, "Escape", "Escape", 27);

  return {
    viewport: "390x844",
    batchId,
    keyboard,
    hierarchy,
    reopened,
    screenshot: "issue-514-inbox-category-hierarchy.png",
  };
}

async function openLineEditDialogByClick(cdp, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const opened = await evaluate(
      cdp,
      `(() => {
        const dialog = document.getElementById('csv-line-edit-dialog');
        if (!dialog?.open) document.querySelector('[data-line-action="edit"]')?.click();
        return dialog?.open === true;
      })()`,
    ).catch(() => false);
    if (opened) return;
    await sleep(250);
  }
  throw new Error("Timed out reopening the CSV line edit dialog");
}

async function waitFor(cdp, expression, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // The execution context can be replaced while navigation settles.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function pressKey(cdp, key, code, keyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: key === "Tab" ? "rawKeyDown" : "keyDown",
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

function check(condition, message, context) {
  if (!condition) failures.push({ message, context });
}
