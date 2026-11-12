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
  console.log("Inbox CSV review and mapping validation passed.");
}

async function validateInboxCsvReview(cdp) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  const mappingDialog = await validateCsvMappingDialog(cdp);

  const fixture = await evaluate(
    cdp,
    `(() => fetch('/api/accounts')
      .then(async (response) => ({ ok: response.ok, status: response.status, body: await response.json() }))
      .then(async (accountsResponse) => {
        if (!accountsResponse.ok) return accountsResponse;
        const account = (accountsResponse.body.accounts || []).find((item) => item.status === 'active');
        if (!account) return { ok: false, status: 0, body: { error: 'No active account available' } };
        const suffix = Date.now().toString(36);
        const otherResponse = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Conta transferência visual ' + suffix,
            kind: 'checking',
            openingBalanceMinor: 0,
            currency: account.currency
          })
        });
        const otherBody = await otherResponse.json();
        if (!otherResponse.ok) return { ok: false, status: otherResponse.status, body: otherBody };
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
        return { ok: createResponse.ok, status: createResponse.status, body: await createResponse.json(), accountId: account.id, otherAccountId: otherBody.account.id };
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
    "Transferências",
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
  const transferInteraction = await evaluate(
    cdp,
    `(() => {
    const form = document.getElementById('csv-line-edit-form');
    const otherField = document.getElementById('csv-line-other-account-field');
    const direction = document.getElementById('csv-line-transfer-direction');
    form.elements.kind.value = 'transfer';
    form.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
    const optionExists = [...form.elements.otherAccountId.options].some((option) => option.value === '${fixture.otherAccountId}');
    form.elements.otherAccountId.value = '${fixture.otherAccountId}';
    form.elements.otherAccountId.dispatchEvent(new Event('change', { bubbles: true }));
    const explicitDirection = direction.textContent || '';
    const visibleAndRequired = !otherField.hidden && form.elements.otherAccountId.required;
    form.elements.accountId.value = '${fixture.otherAccountId}';
    form.elements.accountId.dispatchEvent(new Event('change', { bubbles: true }));
    const invalidated = form.elements.otherAccountId.value === '';
    const warning = document.getElementById('csv-line-edit-status').textContent || '';
    form.elements.accountId.value = '${fixture.accountId}';
    form.elements.accountId.dispatchEvent(new Event('change', { bubbles: true }));
    form.elements.kind.value = 'expense';
    form.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      optionExists,
      visibleAndRequired,
      explicitDirection,
      invalidated,
      warning,
      hiddenAfterLeavingTransfer: otherField.hidden,
      clearedAfterLeavingTransfer: form.elements.otherAccountId.value === '',
      descriptionPreserved: form.elements.description.value === '${opened.originalDescription}',
      amountPreserved: form.elements.amount.value === '${opened.originalAmount}'
    };
  })()`,
  );
  check(
    transferInteraction.optionExists,
    "Eligible transfer account was not offered",
    transferInteraction,
  );
  check(
    transferInteraction.visibleAndRequired,
    "Transfer account field was not visible and required",
    transferInteraction,
  );
  check(
    transferInteraction.explicitDirection.includes("Origem:") &&
      transferInteraction.explicitDirection.includes("Destino:"),
    "Transfer origin and destination were not explicit",
    transferInteraction,
  );
  check(
    transferInteraction.invalidated,
    "Changing the reference account did not invalidate the other account",
    transferInteraction,
  );
  check(
    transferInteraction.warning.includes("outra conta foi removida"),
    "Reference account change did not show a warning",
    transferInteraction,
  );
  check(
    transferInteraction.hiddenAfterLeavingTransfer &&
      transferInteraction.clearedAfterLeavingTransfer,
    "Leaving transfer did not hide and clear the other account",
    transferInteraction,
  );
  check(
    transferInteraction.descriptionPreserved && transferInteraction.amountPreserved,
    "Transfer edits did not preserve the remaining fields",
    transferInteraction,
  );

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
    mappingDialog,
    initial,
    opened,
    transferInteraction,
    failedSave,
    closed,
    screenshot: "issue-494-inbox-csv-mobile-edit-error.png",
  };
}

async function validateCsvMappingDialog(cdp) {
  await navigate(cdp, `${baseUrl}/inbox`);
  await waitFor(cdp, `Boolean(document.querySelector('[data-open-dialog="csv-import-dialog"]'))`);

  const setup = await evaluate(
    cdp,
    `(() => {
      document.querySelector('[data-open-dialog="csv-import-dialog"]').click();
      const dialog = document.getElementById('csv-import-dialog');
      const form = document.getElementById('csv-import-form');
      const activeAccount = [...form.elements.accountId.options].find((option) => option.value);
      if (!activeAccount) return { ok: false, error: 'No active account option' };
      form.elements.accountId.value = activeAccount.value;
      form.elements.consentAccepted.checked = true;
      const transfer = new DataTransfer();
      transfer.items.add(new File([
        'Data Lançamento;Data Contábil;Título;Descrição;Entrada(R$);Saída(R$);Saldo do Dia(R$)\\n' +
        '20/07/2026;19/07/2026;PIX;Receita visual;100,00;0;100,00\\n' +
        '21/07/2026;20/07/2026;Compra;Despesa visual;0;-25,50;74,50'
      ], 'c6-issue-513.csv', { type: 'text/csv' }));
      form.elements.file.files = transfer.files;
      document.getElementById('preview-csv-import').click();
      return {
        ok: true,
        dialogOpen: dialog.open,
        hasKindControl: Boolean(form.elements.mappingKind),
        hasExternalIdControl: Boolean(form.elements.mappingExternalId)
      };
    })()`,
  );
  check(setup.ok, "CSV mapping dialog could not be prepared", setup);
  check(setup.dialogOpen, "CSV mapping dialog did not open", setup);
  check(!setup.hasKindControl, "CSV mapping still exposes kind", setup);
  check(!setup.hasExternalIdControl, "CSV mapping still exposes external ID", setup);

  await waitFor(
    cdp,
    `document.getElementById('create-csv-import')?.disabled === false && document.getElementById('csv-import-form')?.elements.mappingStrategy?.value === 'split'`,
  );
  const c6 = await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      const options = (name) => [...form.elements[name].options].map((option) => option.textContent || '');
      return {
        strategy: form.elements.mappingStrategy.value,
        date: form.elements.mappingDate.value,
        description: form.elements.mappingDescription.value,
        income: form.elements.mappingIncomeAmount.value,
        expense: form.elements.mappingExpenseAmount.value,
        amountOptions: options('mappingAmount'),
        incomeOptions: options('mappingIncomeAmount'),
        expenseOptions: options('mappingExpenseAmount'),
        interpretation: document.getElementById('csv-preview-result').textContent || '',
        createDisabled: document.getElementById('create-csv-import').disabled
      };
    })()`,
  );
  check(c6.strategy === "split", "C6 strategy was not detected as split", c6);
  check(c6.date === "Data Lançamento", "C6 posting date was not prioritized", c6);
  check(c6.description === "Descrição", "C6 description was not prioritized", c6);
  check(c6.income === "Entrada(R$)", "C6 income column was not selected", c6);
  check(c6.expense === "Saída(R$)", "C6 expense column was not selected", c6);
  check(
    ![...c6.amountOptions, ...c6.incomeOptions, ...c6.expenseOptions].some((item) =>
      item.includes("Saldo do Dia"),
    ),
    "Balance column remains selectable as a transaction value",
    c6,
  );
  for (const label of ["Interpretação aplicada", "Receita", "Despesa", "Ignorado"]) {
    check(c6.interpretation.includes(label), `CSV interpretation is missing ${label}`, c6);
  }
  check(!c6.createDisabled, "Create review button is disabled for valid C6 rows", c6);
  await screenshot(cdp, join(outputDir, "issue-513-csv-mapping-c6.png"));

  await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      for (const name of ['mappingDate', 'mappingDescription', 'mappingStrategy', 'mappingAmount', 'mappingIncomeAmount', 'mappingExpenseAmount']) {
        form.elements[name].value = '';
      }
      const transfer = new DataTransfer();
      transfer.items.add(new File([
        'Data,Descrição,Valor,Entrada\\n20/07/2026,Assinada,-10,10'
      ], 'signed-partial-split-issue-513.csv', { type: 'text/csv' }));
      form.elements.file.files = transfer.files;
      document.getElementById('preview-csv-import').click();
      return true;
    })()`,
  );
  await waitFor(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      return form?.elements.mappingStrategy?.value === 'signed' &&
        form?.elements.mappingAmount?.value === 'Valor' &&
        document.getElementById('create-csv-import')?.disabled === false &&
        document.getElementById('csv-import-status')?.textContent.includes('Preview pronto');
    })()`,
  );
  const partialSplit = await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      return {
        strategy: form.elements.mappingStrategy.value,
        amount: form.elements.mappingAmount.value,
        income: form.elements.mappingIncomeAmount.value,
        createDisabled: document.getElementById('create-csv-import').disabled,
        preview: document.getElementById('csv-preview-result').textContent || ''
      };
    })()`,
  );
  check(
    partialSplit.strategy === "signed",
    "Partial split incorrectly forced a strategy choice",
    partialSplit,
  );
  check(
    partialSplit.amount === "Valor",
    "Signed amount was not selected with partial split",
    partialSplit,
  );
  check(
    !partialSplit.createDisabled,
    "Complete signed mapping stayed blocked by partial split",
    partialSplit,
  );
  check(
    partialSplit.preview.includes("Despesa"),
    "Signed preview did not infer the negative amount",
    partialSplit,
  );

  await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      for (const name of ['mappingDate', 'mappingDescription', 'mappingStrategy', 'mappingAmount', 'mappingIncomeAmount', 'mappingExpenseAmount']) {
        form.elements[name].value = '';
      }
      const transfer = new DataTransfer();
      transfer.items.add(new File([
        'Data,Descrição,Valor,Entrada,Saída\\n20/07/2026,Ambígua,10,10,0'
      ], 'ambiguous-issue-513.csv', { type: 'text/csv' }));
      form.elements.file.files = transfer.files;
      document.getElementById('preview-csv-import').click();
      return true;
    })()`,
  );
  await waitFor(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      return form?.elements.mappingStrategy?.value === '' &&
        form?.elements.mappingAmount?.value === 'Valor' &&
        form?.elements.mappingIncomeAmount?.value === 'Entrada' &&
        form?.elements.mappingExpenseAmount?.value === 'Saída' &&
        document.getElementById('create-csv-import')?.disabled === true &&
        document.getElementById('csv-import-status')?.textContent.includes('Ajuste');
    })()`,
  );
  const ambiguous = await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      return {
        strategy: form.elements.mappingStrategy.value,
        amount: form.elements.mappingAmount.value,
        income: form.elements.mappingIncomeAmount.value,
        expense: form.elements.mappingExpenseAmount.value,
        createDisabled: document.getElementById('create-csv-import').disabled,
        interpretation: document.getElementById('csv-preview-result').textContent || ''
      };
    })()`,
  );
  check(ambiguous.strategy === "", "Ambiguous strategy was preselected", ambiguous);
  check(ambiguous.amount === "Valor", "Signed candidate was not preserved", ambiguous);
  check(ambiguous.income === "Entrada", "Income candidate was not preserved", ambiguous);
  check(ambiguous.expense === "Saída", "Expense candidate was not preserved", ambiguous);
  check(
    !ambiguous.interpretation.includes("Valor com sinal"),
    "Ambiguous strategy exposed a provisional signed interpretation as applied",
    ambiguous,
  );
  check(
    ambiguous.createDisabled,
    "Create review button enabled before resolving ambiguity",
    ambiguous,
  );

  await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      form.elements.mappingStrategy.value = 'split';
      form.elements.mappingStrategy.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('preview-csv-import').click();
      return true;
    })()`,
  );
  await waitFor(cdp, `document.getElementById('create-csv-import')?.disabled === false`);
  const resolved = await evaluate(
    cdp,
    `(() => {
      const form = document.getElementById('csv-import-form');
      const result = {
        strategy: form.elements.mappingStrategy.value,
        createDisabled: document.getElementById('create-csv-import').disabled,
        preview: document.getElementById('csv-preview-result').textContent || ''
      };
      document.getElementById('csv-import-dialog').close();
      return result;
    })()`,
  );
  check(resolved.strategy === "split", "Selected split strategy was not retained", resolved);
  check(!resolved.createDisabled, "Resolved mapping did not enable review creation", resolved);
  check(resolved.preview.includes("válidas"), "Resolved mapping has no valid rows", resolved);

  return {
    setup,
    c6,
    partialSplit,
    ambiguous,
    resolved,
    screenshot: "issue-513-csv-mapping-c6.png",
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
