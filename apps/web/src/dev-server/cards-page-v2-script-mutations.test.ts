import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { cardsPageMutationScript } from "./cards-page-v2-script-mutations.js";

type FetchReply = () => Response | Promise<Response>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createInstallmentHarness(responses: FetchReply[], pendingMetadata = false) {
  const listeners: Array<() => Promise<void>> = [];
  const submitListeners: Array<(event: { preventDefault(): void }) => void> = [];
  const requests: string[] = [];
  let focusedScope = "";
  const buttons = ["current", "current_and_future"].map((scope) => ({
    dataset: { installmentScope: scope },
    disabled: false,
    focus() {
      focusedScope = scope;
    },
    addEventListener(_name: string, callback: () => Promise<void>) {
      listeners.push(callback);
    },
  }));
  const valueField = { value: "10,00", focus() {} };
  const status = { textContent: "", className: "" };
  const form = {
    dataset: {
      invoiceId: "invoice-1",
      installmentId: "installment-1",
      pendingPurchasePath: "/api/credit-card-accounts/card-1/purchases/purchase-1",
      pendingPurchasePayload: pendingMetadata ? JSON.stringify({ description: "Editada" }) : "",
      savedAmountMinor: "",
      submitting: "false",
    },
    addEventListener(name: string, callback: (event: { preventDefault(): void }) => void) {
      if (name === "submit") submitListeners.push(callback);
    },
    querySelector(selector: string) {
      if (selector === '[data-installment-scope="current"]') return buttons[0];
      if (selector === '[name="amountMinor"]') return valueField;
      if (selector === "[data-installment-amount-status]") return status;
      return null;
    },
    querySelectorAll(selector: string) {
      return selector === "[data-installment-scope]" ? buttons : [];
    },
  };
  let scheduledReloads = 0;
  runInNewContext(cardsPageMutationScript(), {
    installmentAmountForm: form,
    recurringScopeDialog: null,
    purchaseForm: null,
    pendingRecurringEdit: null,
    document: { querySelector: () => null },
    moneyToMinor: (value: unknown) =>
      Math.round(Number.parseFloat(String(value).replace(",", ".")) * 100),
    fetch: async (path: string) => {
      requests.push(path);
      const next = responses.shift();
      assert.ok(next, "Unexpected request");
      return next();
    },
    window: {
      setTimeout: () => {
        scheduledReloads += 1;
      },
      location: { reload() {} },
    },
  });
  assert.equal(listeners.length, 2);
  assert.equal(submitListeners.length, 1);
  return {
    listeners,
    submitListeners,
    get focusedScope() {
      return focusedScope;
    },
    requests,
    buttons,
    form,
    status,
    get scheduledReloads() {
      return scheduledReloads;
    },
  };
}

await (async function enterRequiresExplicitScopeAndNeverWrites() {
  const harness = createInstallmentHarness([]);
  let prevented = 0;
  harness.submitListeners[0]!({
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(prevented, 1);
  assert.match(harness.status.textContent, /Escolha Somente esta ou Esta e as próximas/);
  assert.equal(harness.focusedScope, "current");
  assert.deepEqual(harness.requests, []);
  assert.equal(harness.scheduledReloads, 0);

  harness.form.dataset.submitting = "true";
  harness.submitListeners[0]!({
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(prevented, 2);
  assert.deepEqual(harness.requests, []);
})();

await (async function failedMetadataSaveAllowsRetryWithoutSecondFinancialWrite() {
  const harness = createInstallmentHarness(
    [
      () => reply(200, { updatedCount: 1, skippedCount: 0 }),
      () => reply(409, { error: { message: "Edição bloqueada" } }),
      () => reply(200, { purchase: { id: "purchase-1" } }),
    ],
    true,
  );
  await harness.listeners[0]!();
  assert.equal(harness.status.className, "form-status error");
  assert.match(harness.status.textContent, /Valor atualizado, mas outros dados não foram salvos/);
  assert.ok(harness.buttons.every((button) => !button.disabled));
  assert.equal(harness.form.dataset.savedAmountMinor, "1000");
  assert.equal(harness.form.dataset.submitting, "false");
  assert.equal(harness.scheduledReloads, 0);

  await harness.listeners[0]!();
  assert.deepEqual(harness.requests, [
    "/api/invoices/invoice-1/installments/installment-1/amount",
    "/api/credit-card-accounts/card-1/purchases/purchase-1",
    "/api/credit-card-accounts/card-1/purchases/purchase-1",
  ]);
  assert.equal(harness.scheduledReloads, 1);
  assert.equal(harness.form.dataset.submitting, "true");
})();

await (async function failedAmountSaveCanBeRetried() {
  const harness = createInstallmentHarness([
    () => reply(409, { error: { message: "Parcela bloqueada" } }),
    () => reply(200, { updatedCount: 1, skippedCount: 0 }),
  ]);
  await harness.listeners[0]!();
  assert.equal(harness.status.textContent, "Parcela bloqueada");
  assert.ok(harness.buttons.every((button) => !button.disabled));
  assert.equal(harness.form.dataset.savedAmountMinor, "");
  await harness.listeners[0]!();
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.scheduledReloads, 1);
})();

await (async function doubleClickDoesNotDuplicateFinancialWrite() {
  let finish: (response: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const harness = createInstallmentHarness([() => pending]);
  const first = harness.listeners[0]!();
  await harness.listeners[1]!();
  assert.equal(harness.requests.length, 1);
  finish(reply(200, { updatedCount: 1, skippedCount: 0 }));
  await first;
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.scheduledReloads, 1);
})();
