import assert from "node:assert/strict";
import test from "node:test";

import { resolveEditBlockedReason } from "./installments.js";

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
