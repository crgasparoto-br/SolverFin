import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const route = process.env.STATEMENT_VISUAL_ROUTE;
const scenarioId = process.env.STATEMENT_VISUAL_SCENARIO_ID ?? "operational-attachments";

if (!chromePath) throw new Error("CHROME_BIN is required for operational attachment validation.");
if (!route) {
  throw new Error("STATEMENT_VISUAL_ROUTE is required for operational attachment validation.");
}

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let evidence;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  if (route === "/lancamentos") evidence = await validateTransactionJourney();
  else if (route === "/cartoes") evidence = await validateInvoiceJourney();
  else if (route === "/inbox") evidence = await validateImportBatchJourney();
  else throw new Error(`Unsupported attachment visual route: ${route}`);
} finally {
  await browser.close(outputDir);
}

await writeFile(
  join(outputDir, `${scenarioId.replace(/[^a-zA-Z0-9_.-]+/g, "-")}.json`),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      commit: process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local",
      scenarioId,
      route,
      evidence,
    },
    null,
    2,
  )}\n`,
);

console.log(`Operational attachment lifecycle passed for ${route}.`);

// prettier-ignore
async function validateTransactionJourney() {
  const fixture = await evaluate(browser.cdp, transactionFixtureExpression());
  const journeyRoute = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-10`;
  await navigate(browser.cdp, `${baseUrl}${journeyRoute}`);
  await waitFor(`[data-edit="${fixture.transactionId}"]`);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit="${fixture.transactionId}"]')?.click()`,
  );
  await waitFor(
    `dialog[open] [data-attachment-workspace][data-entity-kind="transaction"][data-entity-id="${fixture.transactionId}"]`,
  );
  return exerciseWorkspace({
    entityKind: "transaction",
    entityId: fixture.transactionId,
    fileName: `transaction-attachment-${fixture.suffix}.txt`,
    content: `transaction attachment ${fixture.suffix}`,
    journeyRoute,
  });
}

// prettier-ignore
async function validateInvoiceJourney() {
  const fixture = await evaluate(browser.cdp, invoiceFixtureExpression());
  const journeyRoute = `/cartoes?cardId=${encodeURIComponent(fixture.cardId)}&invoiceId=${encodeURIComponent(fixture.invoiceId)}`;
  await navigate(browser.cdp, `${baseUrl}${journeyRoute}`);
  await waitFor(
    `[data-attachment-workspace][data-entity-kind="invoice"][data-entity-id="${fixture.invoiceId}"]`,
  );
  return exerciseWorkspace({
    entityKind: "invoice",
    entityId: fixture.invoiceId,
    fileName: `invoice-attachment-${fixture.suffix}.txt`,
    content: `invoice attachment ${fixture.suffix}`,
    journeyRoute,
  });
}

// prettier-ignore
async function validateImportBatchJourney() {
  const fixture = await evaluate(browser.cdp, importBatchFixtureExpression());
  const journeyRoute = `/inbox?importBatchId=${encodeURIComponent(fixture.importBatchId)}`;
  await navigate(browser.cdp, `${baseUrl}${journeyRoute}`);
  await waitFor(
    `[data-attachment-workspace][data-entity-kind="import_batch"][data-entity-id="${fixture.importBatchId}"]`,
  );
  return exerciseWorkspace({
    entityKind: "import_batch",
    entityId: fixture.importBatchId,
    fileName: `import-attachment-${fixture.suffix}.txt`,
    content: `import attachment ${fixture.suffix}`,
    journeyRoute,
  });
}

// prettier-ignore
async function exerciseWorkspace({ entityKind, entityId, fileName, content, journeyRoute }) {
  const prepared = await evaluate(
    browser.cdp,
    `(() => {
      const workspace = document.querySelector('[data-attachment-workspace][data-entity-kind="${entityKind}"][data-entity-id="${entityId}"]');
      if (!workspace) return { ok: false, reason: "workspace-missing" };
      const form = workspace.querySelector('[data-attachment-form]');
      const input = form?.elements.file;
      if (!form || !input) return { ok: false, reason: "form-missing" };
      const transfer = new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(fileName)}, { type: "text/plain" }));
      input.files = transfer.files;
      form.elements.kind.value = "other";
      window.confirm = () => true;
      form.requestSubmit();
      return { ok: true, hidden: workspace.hidden, entityId: workspace.dataset.entityId };
    })()`,
  );
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.hidden, false);
  assert.equal(prepared.entityId, entityId);

  await waitForAttachment(fileName, true);
  const opened = await evaluate(
    browser.cdp,
    `(async () => {
      const workspace = document.querySelector('[data-attachment-workspace][data-entity-kind="${entityKind}"][data-entity-id="${entityId}"]');
      const item = [...workspace.querySelectorAll('.attachment-item')].find((node) => node.textContent.includes(${JSON.stringify(fileName)}));
      const link = item?.querySelector('a[href*="/api/attachments/"][href$="/content"], a[href*="/api/attachments/"][href*="/content?"]');
      if (!link) return { ok: false, reason: "open-link-missing" };
      const response = await fetch(link.getAttribute('href'));
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
        href: link.getAttribute('href'),
        listText: workspace.querySelector('[data-attachment-list]')?.textContent || ""
      };
    })()`,
  );
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(opened.status, 200);
  assert.equal(opened.body, content);
  assert.equal(opened.listText.includes(fileName), true);
  assert.match(opened.href, /\/api\/attachments\/[^/]+\/content/);

  const filename = `${scenarioId.replace(/[^a-zA-Z0-9_.-]+/g, "-")}.png`;
  await screenshot(browser.cdp, join(outputDir, filename));

  const deleteStarted = await evaluate(
    browser.cdp,
    `(() => {
      const workspace = document.querySelector('[data-attachment-workspace][data-entity-kind="${entityKind}"][data-entity-id="${entityId}"]');
      const item = [...workspace.querySelectorAll('.attachment-item')].find((node) => node.textContent.includes(${JSON.stringify(fileName)}));
      const button = item?.querySelector('[data-delete-attachment]');
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(deleteStarted, true);
  await waitForAttachment(fileName, false);

  const afterDelete = await evaluate(
    browser.cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(opened.href)});
      const workspace = document.querySelector('[data-attachment-workspace][data-entity-kind="${entityKind}"][data-entity-id="${entityId}"]');
      return {
        status: response.status,
        listed: (workspace.querySelector('[data-attachment-list]')?.textContent || "").includes(${JSON.stringify(fileName)})
      };
    })()`,
  );
  assert.equal(afterDelete.status, 404);
  assert.equal(afterDelete.listed, false);

  return {
    journeyRoute,
    entityKind,
    entityId,
    fileName,
    uploadListed: true,
    openStatus: opened.status,
    deleteStatus: afterDelete.status,
    screenshot: filename,
  };
}

// prettier-ignore
async function waitForAttachment(fileName, present) {
  const expression = `(() => {
    const workspace = document.querySelector('[data-attachment-workspace]');
    if (!workspace) return false;
    const found = [...workspace.querySelectorAll('.attachment-item')].some((node) => node.textContent.includes(${JSON.stringify(fileName)}));
    return found === ${present};
  })()`;
  await waitForExpression(expression);
}

// prettier-ignore
async function waitFor(selector) {
  await waitForExpression(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
}

// prettier-ignore
async function waitForExpression(expression, timeout = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      if (await evaluate(browser.cdp, expression)) return;
    } catch {
      // Navigation and async workspace refresh can briefly replace the execution context.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

// prettier-ignore
function transactionFixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      return payload;
    }
    const suffix = Date.now().toString(36);
    const account = (await request("/api/accounts", "POST", {
      name: "QA attachment transaction " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const transaction = (await request("/api/transactions", "POST", {
      accountId: account.id,
      kind: "expense",
      amountMinor: 4321,
      occurredOn: "2026-10-03",
      plannedOn: "2026-10-03",
      effectiveOn: "2026-10-03",
      status: "posted",
      description: "QA attachment transaction " + suffix
    })).transaction;
    return { suffix, accountId: account.id, transactionId: transaction.id };
  })()`;
}

// prettier-ignore
function invoiceFixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      return payload;
    }
    const suffix = Date.now().toString(36);
    const card = (await request("/api/credit-card-accounts", "POST", {
      name: "QA attachment card " + suffix,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 120000,
      currency: "BRL",
      instruments: [{
        type: "physical",
        holder: "primary",
        name: "Attachment QA",
        maskedIdentifier: "**** 6910"
      }]
    })).creditCardAccount;
    const purchase = await request(
      "/api/credit-card-accounts/" + card.id + "/purchases",
      "POST",
      {
        occurredOn: "2026-10-03",
        amountMinor: 15000,
        currency: "BRL",
        description: "QA attachment invoice " + suffix,
        cardInstrumentId: card.instruments[0].id,
        totalInstallments: 2,
        installmentStart: 1
      }
    );
    const installments = (await request(
      "/api/installments?transactionId=" + purchase.transaction.id + "&status=all"
    )).installments;
    const occurrence = installments.find((item) => item.invoice?.id);
    if (!occurrence?.invoice?.id) throw new Error("Attachment fixture did not create an invoice");
    return { suffix, cardId: card.id, invoiceId: occurrence.invoice.id };
  })()`;
}

// prettier-ignore
function importBatchFixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      return payload;
    }
    const suffix = Date.now().toString(36);
    const account = (await request("/api/accounts", "POST", {
      name: "QA attachment import " + suffix,
      kind: "checking",
      openingBalanceMinor: 0,
      currency: "BRL"
    })).account;
    const csv = [
      "data,descricao,valor",
      "03/10/2026,QA attachment import " + suffix + ",-10.25"
    ].join("\\n");
    const created = await request("/api/import-batches/csv", "POST", {
      originalFileName: "attachment-import-" + suffix + ".csv",
      content: csv,
      accountId: account.id,
      consentAccepted: true
    });
    return { suffix, importBatchId: created.importBatch.id };
  })()`;
}
