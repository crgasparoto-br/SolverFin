import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const scenarios = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 662 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, fixtureExpression());

  await validateCreateDefault(fixture, "desktop", 1366, 768);
  await validateInstallmentEdit(fixture, "desktop", 1366, 768);
  await validateCreateDefault(fixture, "mobile", 390, 844);
  await validateInstallmentEdit(fixture, "mobile", 390, 844);
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  issue: 662,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-662-card-installment-purchase.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 662 card installment purchase visual validation passed.");
}

async function validateCreateDefault(fixture, label, width, height) {
  await setViewport(browser.cdp, width, height);
  await openInvoice(fixture);
  await evaluate(browser.cdp, `document.querySelector('[data-open-modal="purchase"]')?.click()`);
  await waitFor('dialog[data-modal="purchase"][open]');
  await evaluate(
    browser.cdp,
    `(() => {
      const repeatMode = document.querySelector('[data-purchase-form] [name="repeatMode"]');
      repeatMode.value = "installment";
      repeatMode.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
  );
  await sleep(120);

  const state = await evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      const form = dialog?.querySelector('[data-purchase-form]');
      const valueMode = form?.querySelector('[name="installmentValueMode"]');
      const help = form?.querySelector('[data-installment-value-help]');
      const totalLabel = form?.querySelector('[data-purchase-field="totalInstallments"]');
      const modeLabel = form?.querySelector('[data-purchase-field="installmentValueMode"]');
      const rect = dialog?.getBoundingClientRect();
      return {
        open: Boolean(dialog?.open),
        repeatMode: form?.querySelector('[name="repeatMode"]')?.value || "",
        installmentValueMode: valueMode?.value || "",
        valueModeVisible: Boolean(modeLabel && !modeLabel.hidden),
        totalInstallmentsVisible: Boolean(totalLabel && !totalLabel.hidden),
        helpText: help?.textContent?.trim() || "",
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        dialogWithinViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      };
    })()`,
  );

  check(state.open, `${label}: purchase modal did not open`, state);
  check(state.repeatMode === "installment", `${label}: installment mode was not selected`, state);
  check(
    state.installmentValueMode === "total",
    `${label}: total purchase value is not the default installment interpretation`,
    state,
  );
  check(state.valueModeVisible, `${label}: installment interpretation control is hidden`, state);
  check(state.totalInstallmentsVisible, `${label}: installment count is hidden`, state);
  check(
    state.helpText.toLowerCase().includes("dividido"),
    `${label}: default total-value help does not explain division`,
    state,
  );
  check(state.noHorizontalOverflow, `${label}: create modal causes horizontal overflow`, state);
  check(state.dialogWithinViewport, `${label}: create modal escapes the viewport`, state);

  const filename = `issue-662-create-installment-${label}-${width}x${height}.png`;
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route: invoiceRoute(fixture),
    viewport: `${width}x${height}`,
    state: "create-installment-default-total",
    interaction: "open-modal-select-installment",
    screenshot: filename,
    observed: state,
  });

  await evaluate(
    browser.cdp,
    `document.querySelector('dialog[data-modal="purchase"] [data-close-modal]')?.click()`,
  );
  await sleep(80);
}

async function validateInstallmentEdit(fixture, label, width, height) {
  await setViewport(browser.cdp, width, height);
  await openInvoice(fixture);
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-edit-purchase="${fixture.transactionId}"]')?.click()`,
  );
  await waitFor('dialog[data-modal="purchase"][open]');
  await sleep(120);

  const state = await evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      const form = dialog?.querySelector('[data-purchase-form]');
      const rect = dialog?.getBoundingClientRect();
      const installmentAmountField = form?.querySelector('[data-purchase-field="installmentAmountMinor"]');
      const context = form?.querySelector('[data-purchase-field="installmentContext"]');
      const row = document.querySelector('[data-edit-purchase="${fixture.transactionId}"]')?.closest('[data-purchase-item]');
      return {
        open: Boolean(dialog?.open),
        datasetInstallmentPurchase: form?.dataset.installmentPurchase || "",
        repeatMode: form?.querySelector('[name="repeatMode"]')?.value || "",
        repeatModeDisabled: Boolean(form?.querySelector('[name="repeatMode"]')?.disabled),
        totalAmountReadonly: Boolean(form?.querySelector('[name="amountMinor"]')?.readOnly),
        occurredOnReadonly: Boolean(form?.querySelector('[name="occurredOn"]')?.readOnly),
        totalInstallmentsReadonly: Boolean(form?.querySelector('[name="totalInstallments"]')?.readOnly),
        totalInstallments: form?.querySelector('[name="totalInstallments"]')?.value || "",
        installmentStartReadonly: Boolean(form?.querySelector('[name="installmentStart"]')?.readOnly),
        installmentStart: form?.querySelector('[name="installmentStart"]')?.value || "",
        installmentAmountVisible: Boolean(installmentAmountField && !installmentAmountField.hidden),
        installmentAmountReadonly: Boolean(form?.querySelector('[name="installmentAmountMinor"]')?.readOnly),
        installmentAmount: form?.querySelector('[name="installmentAmountMinor"]')?.value || "",
        totalAmount: form?.querySelector('[name="amountMinor"]')?.value || "",
        contextVisible: Boolean(context && !context.hidden),
        contextText: context?.textContent?.trim() || "",
        descriptionReadonly: Boolean(form?.querySelector('[name="description"]')?.readOnly),
        instrumentDisabled: Boolean(form?.querySelector('[name="cardInstrumentId"]')?.disabled),
        rowText: row?.textContent?.replace(/\\s+/g, " ").trim() || "",
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        dialogWithinViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      };
    })()`,
  );

  check(state.open, `${label}: installment edit modal did not open`, state);
  check(
    state.datasetInstallmentPurchase === "true",
    `${label}: canonical installment context was not recognized`,
    state,
  );
  check(
    state.rowText.includes(`Parcela ${fixture.sequenceNumber} de ${fixture.totalInstallments}`),
    `${label}: future invoice row does not identify the installment occurrence`,
    state,
  );
  check(
    state.rowText.includes("Total da compra"),
    `${label}: purchase total is not exposed as secondary information`,
    state,
  );
  check(state.repeatMode === "installment" && state.repeatModeDisabled, `${label}: repeat mode is not locked`, state);
  check(state.totalAmountReadonly, `${label}: total purchase value is editable`, state);
  check(state.occurredOnReadonly, `${label}: installment date is editable`, state);
  check(
    state.totalInstallmentsReadonly && state.totalInstallments === String(fixture.totalInstallments),
    `${label}: total installments are not preserved read-only`,
    state,
  );
  check(
    state.installmentStartReadonly && state.installmentStart === "1",
    `${label}: initial installment is not preserved read-only`,
    state,
  );
  check(
    state.installmentAmountVisible && state.installmentAmountReadonly,
    `${label}: occurrence amount is not visible read-only`,
    state,
  );
  check(
    state.contextVisible && state.contextText.includes(`Parcela ${fixture.sequenceNumber} de ${fixture.totalInstallments}`),
    `${label}: installment context is missing`,
    state,
  );
  check(!state.descriptionReadonly, `${label}: description should remain editable`, state);
  check(!state.instrumentDisabled, `${label}: instrument should remain editable`, state);
  check(state.noHorizontalOverflow, `${label}: edit modal causes horizontal overflow`, state);
  check(state.dialogWithinViewport, `${label}: edit modal escapes the viewport`, state);

  const filename = `issue-662-edit-installment-${label}-${width}x${height}.png`;
  await screenshot(browser.cdp, join(outputDir, filename));
  scenarios.push({
    route: invoiceRoute(fixture),
    viewport: `${width}x${height}`,
    state: `edit-installment-${fixture.sequenceNumber}-of-${fixture.totalInstallments}`,
    interaction: "open-existing-installment-purchase",
    screenshot: filename,
    observed: state,
  });

  await evaluate(
    browser.cdp,
    `document.querySelector('dialog[data-modal="purchase"] [data-close-modal]')?.click()`,
  );
  await sleep(80);
}

async function openInvoice(fixture) {
  await navigate(browser.cdp, `${baseUrl}${invoiceRoute(fixture)}`);
  await waitFor(`[data-edit-purchase="${fixture.transactionId}"]`);
}

function invoiceRoute(fixture) {
  return `/cartoes?cardId=${encodeURIComponent(fixture.cardId)}&invoiceId=${encodeURIComponent(fixture.invoiceId)}`;
}

async function waitFor(selector) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(
      browser.cdp,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error(`Issue 662 selector did not render: ${selector}`);
}

function fixtureExpression() {
  return `(async () => {
    async function request(path, method = "GET", body) {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(method + " " + path + " failed with " + response.status + ": " + JSON.stringify(payload));
      }
      return payload;
    }

    const suffix = Date.now().toString(36);
    const card = (await request("/api/credit-card-accounts", "POST", {
      name: "QA Issue 662 - Cartao " + suffix,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 120000,
      currency: "BRL",
      instruments: [{
        type: "physical",
        holder: "primary",
        name: "Fisico QA 662",
        maskedIdentifier: "**** 6620"
      }]
    })).creditCardAccount;
    const instrument = card.instruments[0];
    const purchase = await request(
      "/api/credit-card-accounts/" + card.id + "/purchases",
      "POST",
      {
        occurredOn: "2026-07-08",
        amountMinor: 30000,
        currency: "BRL",
        description: "QA issue 662 compra parcelada " + suffix,
        cardInstrumentId: instrument.id,
        totalInstallments: 3,
        installmentStart: 1
      }
    );
    const transactionId = purchase.transaction.id;
    const installments = (await request(
      "/api/installments?transactionId=" + transactionId + "&status=all"
    )).installments;
    const occurrence = installments.find((item) => item.sequenceNumber === 2);
    if (!occurrence?.invoice?.id) {
      throw new Error("Issue 662 fixture did not persist the future invoice occurrence");
    }
    return {
      cardId: card.id,
      transactionId,
      invoiceId: occurrence.invoice.id,
      sequenceNumber: occurrence.sequenceNumber,
      totalInstallments: occurrence.totalInstallments,
      installmentAmountMinor: occurrence.amountMinor,
      totalAmountMinor: purchase.transaction.amountMinor
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
