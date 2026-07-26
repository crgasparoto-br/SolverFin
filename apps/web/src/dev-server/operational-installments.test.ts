import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountInstallmentsPath,
  buildHistoricalCategoryOption,
  buildInstallmentPatch,
  buildInvoiceInstallmentsPath,
  operationalInstallmentsController,
  translateInstallmentBlockReason,
} from "./operational-installments.js";

test("builds one scoped account installments query for the selected month", () => {
  assert.equal(
    buildAccountInstallmentsPath("account-demo", "2026-02", "profile-demo"),
    "/api/installments?accountId=account-demo&dueFrom=2026-02-01&dueTo=2026-02-28&status=all&profileId=profile-demo",
  );
});

test("builds the invoice query using invoiceId instead of isolated cardId", () => {
  assert.equal(
    buildInvoiceInstallmentsPath("invoice-demo", "profile-demo"),
    "/api/installments?invoiceId=invoice-demo&status=all&profileId=profile-demo",
  );
});

test("sends only changed safe fields and uses null to remove category", () => {
  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "Original", categoryId: "category-demo" },
      { description: "Parcela ajustada", note: "", categoryId: "" },
    ),
    { description: "Parcela ajustada", note: null, categoryId: null },
  );
  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "", categoryId: "" },
      { description: "Parcela", note: "", categoryId: "" },
    ),
    {},
  );
});

test("preserves an archived historical category while editing other fields", () => {
  assert.deepEqual(
    buildHistoricalCategoryOption({
      id: "installment-demo",
      sequenceNumber: 2,
      totalInstallments: 6,
      dueOn: "2026-08-05",
      amountMinor: 12345,
      currency: "BRL",
      status: "planned",
      editable: true,
      transaction: { categoryId: "category-archived" },
      category: {
        id: "category-archived",
        name: "Categoria histórica",
        status: "archived",
      },
    }),
    {
      value: "category-archived",
      label: "Categoria histórica (arquivada)",
      disabled: true,
    },
  );
  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "", categoryId: "category-archived" },
      { description: "Parcela ajustada", note: "", categoryId: "category-archived" },
    ),
    { description: "Parcela ajustada" },
  );
});

test("translates stable backend block reasons", () => {
  assert.equal(
    translateInstallmentBlockReason("invoice_linked"),
    "Esta parcela é alterada pela compra da fatura.",
  );
  assert.equal(
    translateInstallmentBlockReason("transaction_status_locked"),
    "O lançamento já foi efetivado, conciliado ou cancelado.",
  );
});

test("controller preserves purchase editing and handles stale edit conflicts", () => {
  const script = operationalInstallmentsController();
  assert.match(script, /data-edit-purchase/);
  assert.doesNotMatch(script, /data-installment-edit.*data-edit-purchase/s);
  assert.match(script, /INSTALLMENT_EDIT_BLOCKED/);
  assert.match(script, /Recarregar estado atual/);
  assert.match(script, /rememberAndSet\(saveButton, "hidden", !editable\)/);
  assert.match(script, /data-installment-reload/);
  assert.match(script, /data-installment-historical-category/);
  assert.match(script, /ensureHistoricalCategoryOption\(form\.categoryId, installment\)/);
  assert.match(script, /setAccountEditLookupState\("loading"\)/);
  assert.match(script, /setAccountEditLookupState\("unavailable"\)/);
  assert.match(script, /Edição temporariamente indisponível/);
  assert.match(script, /stopImmediatePropagation/);
  assert.match(script, /Parcela " \+ installment\.sequenceNumber \+ " de/);
});
