import assert from "node:assert/strict";
import test from "node:test";

import {
  canEditInstallmentAmount,
  readManualInstallmentFamily,
  resolveEditBlockedReason,
} from "./installments.js";

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

test("cancelled recurring installments are read-only even if the occurrence remains planned", () => {
  const base = {
    transactionId: "transaction-demo",
    transactionStatus: "PLANNED",
    status: "PLANNED",
    recurrenceStatus: "CANCELLED",
  };
  assert.equal(resolveEditBlockedReason(base), "recurrence_cancelled");
  assert.equal(canEditInstallmentAmount(base), false);
  assert.equal(
    resolveEditBlockedReason({ ...base, invoiceId: "invoice-demo" }),
    "invoice_linked",
    "invoice is the canonical boundary for card installments",
  );
  assert.equal(resolveEditBlockedReason({ ...base, recurrenceStatus: "ACTIVE" }), undefined);
  assert.equal(canEditInstallmentAmount({ ...base, recurrenceStatus: "ACTIVE" }), true);
});

test("only planned and posted unconciliated account installments allow amount adjustment", () => {
  const base = {
    transactionId: "transaction-demo",
    transactionStatus: "PLANNED",
    status: "PLANNED",
  };
  assert.equal(canEditInstallmentAmount(base), true);
  assert.equal(
    canEditInstallmentAmount({ ...base, status: "POSTED", transactionStatus: "POSTED" }),
    true,
  );
  assert.equal(canEditInstallmentAmount({ ...base, transactionStatus: "POSTED" }), false);
  assert.equal(
    canEditInstallmentAmount({ ...base, status: "RECONCILED", transactionStatus: "RECONCILED" }),
    false,
  );
  assert.equal(
    canEditInstallmentAmount({ ...base, status: "CANCELLED", transactionStatus: "CANCELLED" }),
    false,
  );
  assert.equal(canEditInstallmentAmount({ ...base, invoiceId: "invoice-demo" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, cardId: "card-demo" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, transactionCardId: "card-demo" }), false);
  assert.equal(canEditInstallmentAmount({ ...base, transactionId: null }), false);
});

test("manual installment family requires immutable, unique creation-receipt provenance", () => {
  const response = {
    installments: [
      { id: "three", sequenceNumber: 3 },
      { id: "one", sequenceNumber: 1 },
      { id: "two", sequenceNumber: 2 },
    ],
  };
  assert.deepEqual(readManualInstallmentFamily(response, "two"), [
    { id: "one", sequenceNumber: 1 },
    { id: "two", sequenceNumber: 2 },
    { id: "three", sequenceNumber: 3 },
  ]);
  assert.deepEqual(readManualInstallmentFamily(response, "not-in-series"), []);
  assert.deepEqual(
    readManualInstallmentFamily(
      {
        installments: [
          { id: "one", sequenceNumber: 1 },
          { id: "one", sequenceNumber: 2 },
        ],
      },
      "one",
    ),
    [],
  );
  assert.deepEqual(
    readManualInstallmentFamily(
      {
        installments: [
          { id: "one", sequenceNumber: 1 },
          { id: "two", sequenceNumber: 1 },
        ],
      },
      "one",
    ),
    [],
  );
  assert.deepEqual(
    readManualInstallmentFamily(
      {
        installments: [
          { id: "one", sequenceNumber: 1 },
          { id: "two", sequenceNumber: 0 },
        ],
      },
      "one",
    ),
    [],
  );
  assert.deepEqual(readManualInstallmentFamily({ installments: [] }, "one"), []);
  assert.deepEqual(readManualInstallmentFamily(null, "one"), []);
});
