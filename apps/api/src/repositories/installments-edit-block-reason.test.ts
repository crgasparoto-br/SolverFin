import assert from "node:assert/strict";
import test from "node:test";

import { canEditInstallmentAmount, resolveEditBlockedReason } from "./installments.js";

for (const transactionStatus of ["PLANNED", "POSTED", "RECONCILED", "CANCELLED"]) {
  test(`invoice-linked installment takes precedence over ${transactionStatus.toLowerCase()} transaction status`, () => {
    assert.equal(
      resolveEditBlockedReason({
        transactionId: "transaction-demo",
        transactionStatus,
        status: "PLANNED",
        invoiceId: "invoice-demo",
      }),
      "invoice_linked",
    );
  });
}

test("invoice-linked reason takes precedence over a non-planned installment", () => {
  assert.equal(
    resolveEditBlockedReason({
      transactionId: "transaction-demo",
      transactionStatus: "POSTED",
      status: "POSTED",
      invoiceId: "invoice-demo",
    }),
    "invoice_linked",
  );
});

test("non-invoice installments retain status-specific reasons", () => {
  assert.equal(
    resolveEditBlockedReason({
      transactionId: "transaction-demo",
      transactionStatus: "POSTED",
      status: "PLANNED",
    }),
    "transaction_status_locked",
  );
  assert.equal(
    resolveEditBlockedReason({
      transactionId: "transaction-demo",
      transactionStatus: "PLANNED",
      status: "POSTED",
    }),
    "installment_status_locked",
  );
  assert.equal(resolveEditBlockedReason({ status: "PLANNED" }), "linked_transaction_missing");
});

test("only planned and posted unconciliated account installments allow amount adjustment", () => {
  const base = { transactionId: "transaction-demo", transactionStatus: "PLANNED", status: "PLANNED" };
  assert.equal(canEditInstallmentAmount(base), true);
  assert.equal(canEditInstallmentAmount({ ...base, status: "POSTED", transactionStatus: "POSTED" }), true);
  assert.equal(canEditInstallmentAmount({ ...base, transactionStatus: "POSTED" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, status: "RECONCILED", transactionStatus: "RECONCILED" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, status: "CANCELLED", transactionStatus: "CANCELLED" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, invoiceId: "invoice-demo" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, cardId: "card-demo" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, transactionCardId: "card-demo" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, transactionId: null }), false);
});
