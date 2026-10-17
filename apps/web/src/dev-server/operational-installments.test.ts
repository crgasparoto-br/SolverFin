import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountInstallmentsPath,
  buildHistoricalCategoryOption,
  buildInstallmentPatch,
  buildInvoiceInstallmentsPath,
  formatInstallmentSequence,
  operationalInstallmentsController,
  translateInstallmentBlockReason,
} from "./operational-installments.js";

test("builds one scoped account installments query for the selected month", () => {
  assert.equal(
    buildAccountInstallmentsPath("account-demo", "2026-02", "profile-demo"),
    "/api/installments?accountId=account-demo&operationalFrom=2026-02-01&operationalTo=2026-02-28&status=all&profileId=profile-demo",
  );
});

test("consolidated All accounts never passes the all sentinel as a UUID to installments API", () => {
  assert.equal(
    buildAccountInstallmentsPath("all", "2026-09", "profile-demo"),
    "/api/installments?operationalFrom=2026-09-01&operationalTo=2026-09-30&status=all&profileId=profile-demo",
  );
  assert.equal(
    buildAccountInstallmentsPath("all", "2026-09", undefined, "2026-09-15"),
    "/api/installments?operationalFrom=2026-09-15&operationalTo=2026-09-15&status=all",
  );
  const script = operationalInstallmentsController();
  assert.ok(script.includes('accountId === "all" ? "" : "accountId="'));
  assert.doesNotMatch(buildAccountInstallmentsPath("all", "2026-09"), /accountId=all/);
});

test("uses the exact displayed day when the statement has a valid daily filter", () => {
  assert.equal(
    buildAccountInstallmentsPath("account-demo", "2026-02", "profile-demo", "2026-02-15"),
    "/api/installments?accountId=account-demo&operationalFrom=2026-02-15&operationalTo=2026-02-15&status=all&profileId=profile-demo",
  );
  assert.equal(
    buildAccountInstallmentsPath("account-demo", "2026-02", undefined, "2026-03-15"),
    "/api/installments?accountId=account-demo&operationalFrom=2026-02-01&operationalTo=2026-02-28&status=all",
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
  assert.deepEqual(
    buildInstallmentPatch(
      { description: "Parcela", note: "Observação", categoryId: "" },
      { description: "Parcela", note: "  Observação  ", categoryId: "" },
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

test("formats unbounded recurrence installments without exposing zero as a total", () => {
  assert.equal(formatInstallmentSequence(1, 0), "Parcela 1 de ?");
  assert.equal(formatInstallmentSequence(2, 6), "Parcela 2 de 6");
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
  assert.match(script, /rememberAndSet\(saveButton, "hidden", !anyEditable\)/);
  assert.match(script, /data-installment-reload/);
  assert.ok(script.includes('attachments.dataset.entityId = installment.transaction?.id || ""'));
  assert.ok(script.includes("window.SolverFinAttachments?.resetPending(attachments)"));
  assert.ok(script.includes("window.SolverFinAttachments?.refresh(attachments)"));
  assert.match(script, /data-installment-historical-category/);
  assert.match(script, /ensureHistoricalCategoryOption\(form\.categoryId, installment\)/);
  assert.match(script, /setAccountEditLookupState\("loading"\)/);
  assert.match(script, /setAccountEditLookupState\("unavailable"\)/);
  assert.match(script, /Edição temporariamente indisponível/);
  assert.match(script, /document\.addEventListener\("submit"/);
  assert.doesNotMatch(
    script,
    /document\.querySelector\("\[data-form\]"\)\?\.addEventListener\("submit"/,
  );
  assert.match(script, /stopImmediatePropagation/);
  assert.match(script, /function installmentLabel\(installment\)/);
  assert.match(script, /installmentLabel\(installment\)/);
  assert.match(script, /urlParams\.get\("day"\)/);
  assert.match(script, /operationalFrom=" \+ operationalFrom/);
  assert.match(script, /operationalTo=" \+ operationalTo/);
  assert.match(script, /function keepInstallmentFocusInsideModal\(event\)/);
  assert.match(script, /event\.key !== "Tab"/);
  assert.match(script, /addEventListener\("keydown", keepInstallmentFocusInsideModal\)/);
  assert.match(script, /badge\.tabIndex = 0/);
  assert.match(script, /aria-describedby/);
  assert.match(script, /installment-assistive-text/);
  assert.match(script, /installmentBlockReason/);
});

test("installment value correction sends only changed cents and keeps metadata protected on posted records", () => {
  const script = operationalInstallmentsController();
  assert.ok(script.includes("const amountEditable = installment.amountEditable === true"));
  assert.ok(script.includes('name="adjustedInstallmentAmount"'));
  assert.ok(script.includes("parseInstallmentAmount(value)"));
  assert.ok(script.includes("patch.amountMinor = cents"));
  assert.ok(script.includes('rememberAndSet(saveButton, "hidden", !anyEditable)'));
  assert.ok(script.includes("Ajuste somente o valor desta parcela"));
  assert.ok(script.includes("sem redistribuir as demais"));
  assert.ok(script.includes("installment.editable === true && !form.description.value.trim()"));
  assert.ok(script.includes('method: "PATCH"'));
});

test("fixed recurring occurrences do not display finite installment badges", () => {
  const script = operationalInstallmentsController();
  assert.ok(script.includes("if (!installment.recurrenceId"));
  assert.ok(script.includes("Number(installment.totalInstallments) > 0"));
  assert.ok(script.includes("const total = Number(installment.totalInstallments) > 0"));
  assert.ok(script.includes('return "Parcela " + installment.sequenceNumber + " de " + total;'));
  assert.ok(script.includes('findNodeByData("script[data-purchase]", transactionId)'));
  assert.ok(script.includes("addBadge(row, installment)"));
});

test("installment scope selection follows Golden Screen neutral button states", () => {
  const script = operationalInstallmentsController();
  assert.ok(script.includes('data-button-variant="neutral" data-scope="current"'));
  assert.ok(script.includes('data-button-variant="neutral" data-scope="current_and_future"'));
  assert.ok(
    script.includes(".installment-scope-dialog button.installment-scope-option:hover:not(:disabled)"),
  );
  assert.ok(
    script.includes(".installment-scope-dialog button.installment-scope-option:focus-visible"),
  );
  assert.ok(script.includes("background: var(--neutral-control-hover)"));
  assert.ok(script.includes("border-color: var(--neutral-control-border-hover)"));
  assert.ok(script.includes("color: var(--neutral-control-text-hover)"));
  assert.ok(script.includes("box-shadow: var(--shadow-focus)"));
  assert.ok(script.includes("background: var(--surface)"));
  assert.ok(script.includes("color: var(--primary)"));
});

test("amount edit requires an explicit current or future scope before the PATCH", () => {
  const script = operationalInstallmentsController();
  assert.ok(script.includes("function chooseInstallmentScope(installment)"));
  assert.ok(script.includes("Onde aplicar o novo valor?"));
  assert.ok(script.includes("Somente esta parcela"));
  assert.ok(script.includes("Esta e as próximas"));
  assert.ok(script.includes("data-scope-cancel>Voltar sem salvar"));
  assert.ok(script.includes("const scope = await chooseInstallmentScope(installment)"));
  assert.ok(script.includes("patch.scope = scope"));
  assert.ok(script.includes("const hasFuture = !installment.recurrenceId"));
  assert.ok(script.includes("if (!scope) {"));
  assert.ok(script.includes('Object.keys(patch).some((field) => field !== "amountMinor")'));
  assert.ok(script.includes("body: JSON.stringify(patch)"));
  assert.ok(script.includes(".installment-scope-dialog::backdrop"));
});
