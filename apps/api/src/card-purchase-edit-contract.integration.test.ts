import assert from "node:assert/strict";

import { TenantAuthorizationError, type TenantContext } from "@solverfin/domain";

import { closePool, getPool, query, withSharedTransaction } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { moveCardPurchaseInvoicePeriodForContext } from "./repositories/card-purchase-invoice-period-move-core.js";
import {
  adjustInvoiceInstallmentAmountForContext,
  deleteSimpleCardPurchaseForContext,
  listCardPurchasesForContext,
  reconcileInvoiceInstallmentForContext,
  reverseCardPurchaseForContext,
  summarizeInvoiceForContext,
  updateCardReversalForContext,
  updateCardPurchaseForContext,
} from "./repositories/card-invoice-contracts.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";
import { listInstallmentsForContext } from "./repositories/installments.js";
import {
  createRecurrenceForContext,
  generateInstallmentsForContext,
} from "./repositories/recurrences.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};
class RollbackSoftDeleteFixtures extends Error {}

const OTHER_PROFILE_CONTEXT: TenantContext = {
  ...CONTEXT,
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "mei",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assertIntegrationDatabaseConfigured();

  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao edicao compra ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    creditLimitMinor: 90_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico edicao",
        maskedIdentifier: "**** 8181",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual edicao",
        maskedIdentifier: "**** 9191",
      },
    ],
  });
  const physicalInstrument = requireInstrument(account.instruments, "physical");
  const virtualInstrument = requireInstrument(account.instruments, "virtual");

  await assertCommonCardPurchaseEdit(account.id, physicalInstrument, virtualInstrument, suffix);
  await assertInstallmentPurchaseEdit(account.id, physicalInstrument, virtualInstrument, suffix);
  await assertRecurringCardPurchaseEdit(account.id, physicalInstrument, virtualInstrument, suffix);
  await assertLockedInvoiceRejectsCardPurchaseEdit(suffix);
  await assertSimplePurchaseSoftDelete(account.id, physicalInstrument.id, suffix);
  await assertConcurrentPurchaseEditCannotResurrect(account.id, physicalInstrument.id, suffix);
}

async function assertInstallmentPurchaseEdit(
  cardId: string,
  physicalInstrument: ApiCardInstrument,
  virtualInstrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-05-08",
    amountMinor: 10_000,
    description: `Compra parcelada original ${suffix}`,
    cardInstrumentId: physicalInstrument.id,
    totalInstallments: 3,
  });
  const invoices = [purchase.invoice, ...purchase.futureInvoices];
  const linkedTotal = await readInvoiceTotal(purchase.invoice.id);
  await assert.rejects(
    () => deleteSimpleCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_DELETE_RESTRICTED",
  );
  assert.equal(await readInvoiceTotal(purchase.invoice.id), linkedTotal);
  assert.deepEqual(
    await listInstallmentsForContext(OTHER_PROFILE_CONTEXT, {
      transactionId: purchase.transaction.id,
      status: "all",
    }),
    [],
  );

  const occurrenceIds: string[] = [];
  for (const [index, invoice] of invoices.entries()) {
    const occurrences = await listInstallmentsForContext(CONTEXT, {
      invoiceId: invoice.id,
      status: "all",
    });
    assert.equal(occurrences.length, 1);
    occurrenceIds.push(occurrences[0]!.id);
    assert.equal(occurrences[0]?.transaction?.id, purchase.transaction.id);
    assert.equal(occurrences[0]?.invoice?.id, invoice.id);
    assert.equal(occurrences[0]?.sequenceNumber, index + 1);
    assert.equal(occurrences[0]?.amountMinor, [3_334, 3_333, 3_333][index]);
    const summary = await summarizeInvoiceForContext(CONTEXT, invoice.id);
    assert.equal(summary.purchasesCount, 1);
    assert.equal(summary.unreconciledExpensesMinor, [3_334, 3_333, 3_333][index]);
  }

  // Reconciliation changes only this invoice occurrence, never the parent purchase or sibling parcels.
  const firstInvoiceId = invoices[0]!.id;
  const firstOccurrenceId = occurrenceIds[0]!;
  const reconciled = await reconcileInvoiceInstallmentForContext(
    CONTEXT,
    firstInvoiceId,
    firstOccurrenceId,
    "reconciled",
  );
  assert.equal(reconciled.invoice.reconciledExpensesMinor, 3_334);
  assert.equal(reconciled.invoice.unreconciledExpensesMinor, 0);
  assert.equal(
    (await listInstallmentsForContext(CONTEXT, { invoiceId: invoices[1]!.id }))[0]?.status,
    "planned",
  );
  await assert.rejects(
    () =>
      reconcileInvoiceInstallmentForContext(
        OTHER_PROFILE_CONTEXT,
        firstInvoiceId,
        firstOccurrenceId,
        "posted",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_INSTALLMENT_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      reconcileInvoiceInstallmentForContext(CONTEXT, invoices[1]!.id, firstOccurrenceId, "posted"),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_INSTALLMENT_NOT_FOUND",
  );
  // A reconciled sibling makes shared purchase metadata immutable, even if
  // the edited occurrence is not reconciled. No transaction/series write is allowed.
  const readSharedSeriesState = () =>
    query<{
      id: string;
      status: string;
      cardInstrumentId: string | null;
      updatedAt: Date;
      description: string;
    }>(
      `select i."id", i."status", i."cardInstrumentId", i."updatedAt", t."description"
         from "Installment" i
         join "Transaction" t on t."id" = i."transactionId"
        where i."transactionId" = $1 and i."organizationId" = $2
          and i."financialProfileId" = $3
        order by i."sequenceNumber"`,
      [purchase.transaction.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
    );
  const beforeRejectedMetadata = await readSharedSeriesState();
  for (const payload of [
    { description: `Nao editar conciliada ${suffix}` },
    { cardInstrumentId: virtualInstrument.id },
    { description: `Nao propagar ${suffix}`, cardInstrumentId: virtualInstrument.id },
  ]) {
    await assert.rejects(
      () => updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, payload),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CARD_INSTALLMENT_RECONCILED_LOCKED",
    );
    assert.deepEqual(await readSharedSeriesState(), beforeRejectedMetadata);
  }
  const posted = await reconcileInvoiceInstallmentForContext(
    CONTEXT,
    firstInvoiceId,
    firstOccurrenceId,
    "posted",
  );
  assert.equal(posted.invoice.reconciledExpensesMinor, 0);
  assert.equal(posted.invoice.unreconciledExpensesMinor, 3_334);

  // #742: amount adjustments affect invoice occurrences, never the base purchase.
  await assert.rejects(
    () =>
      adjustInvoiceInstallmentAmountForContext(
        OTHER_PROFILE_CONTEXT,
        firstInvoiceId,
        firstOccurrenceId,
        3_500,
        "current",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_INSTALLMENT_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      adjustInvoiceInstallmentAmountForContext(
        CONTEXT,
        invoices[1]!.id,
        firstOccurrenceId,
        3_500,
        "current",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_INSTALLMENT_NOT_FOUND",
  );
  await assert.rejects(
    () =>
      adjustInvoiceInstallmentAmountForContext(
        CONTEXT,
        firstInvoiceId,
        firstOccurrenceId,
        0,
        "current",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_INSTALLMENT_AMOUNT_INVALID",
  );
  const singleAdjustment = await adjustInvoiceInstallmentAmountForContext(
    CONTEXT,
    firstInvoiceId,
    firstOccurrenceId,
    3_500,
    "current",
  );
  assert.equal(singleAdjustment.updatedCount, 1);
  assert.equal(singleAdjustment.skippedCount, 0);
  assert.equal(singleAdjustment.invoice.totalExpensesMinor, 3_500);
  const unchangedAdjustment = await adjustInvoiceInstallmentAmountForContext(
    CONTEXT,
    firstInvoiceId,
    firstOccurrenceId,
    3_500,
    "current",
  );
  assert.equal(
    unchangedAdjustment.updatedCount,
    0,
    "No-op must not count as a changed installment",
  );
  assert.equal(unchangedAdjustment.skippedCount, 0);
  assert.equal(unchangedAdjustment.invoice.totalExpensesMinor, 3_500);
  assert.deepEqual(
    await Promise.all(
      invoices.map(
        async (invoice) =>
          (await listInstallmentsForContext(CONTEXT, { invoiceId: invoice.id }))[0]?.amountMinor,
      ),
    ),
    [3_500, 3_333, 3_333],
  );
  const futureAdjustment = await adjustInvoiceInstallmentAmountForContext(
    CONTEXT,
    invoices[1]!.id,
    occurrenceIds[1]!,
    4_500,
    "current_and_future",
  );
  assert.equal(futureAdjustment.updatedCount, 2);
  assert.equal(futureAdjustment.skippedCount, 0);
  assert.deepEqual(
    await Promise.all(
      invoices.map(
        async (invoice) =>
          (await listInstallmentsForContext(CONTEXT, { invoiceId: invoice.id }))[0]?.amountMinor,
      ),
    ),
    [3_500, 4_500, 4_500],
  );
  assert.equal(
    (await summarizeInvoiceForContext(CONTEXT, invoices[2]!.id)).totalExpensesMinor,
    4_500,
  );

  for (const forbiddenPayload of [
    { amountMinor: 12_000 },
    { occurredOn: "2028-05-09" },
    { invoiceId: purchase.invoice.id },
    { status: "reconciled" },
  ]) {
    await assert.rejects(
      () =>
        updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, forbiddenPayload),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CARD_INSTALLMENT_PURCHASE_STRUCTURE_LOCKED",
    );
  }

  const updated = await updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, {
    description: `Compra parcelada editada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
  });
  assert.equal(updated.transaction.amountMinor, 10_000);
  assert.equal(updated.transaction.description, `Compra parcelada editada ${suffix}`);
  assert.equal(updated.transaction.cardInstrumentId, virtualInstrument.id);

  const rows = await query<{ cardInstrumentId: string; transactionId: string; invoiceId: string }>(
    `select "cardInstrumentId", "transactionId", "invoiceId" from "Installment"
      where "transactionId" = $1 order by "sequenceNumber"`,
    [purchase.transaction.id],
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.cardInstrumentId),
    [virtualInstrument.id, virtualInstrument.id, virtualInstrument.id],
  );
  assert.ok(rows.every((row) => row.transactionId === purchase.transaction.id && row.invoiceId));

  await query(`update "Invoice" set "status" = 'CLOSED' where "id" = $1`, [invoices[2]?.id]);
  const partialAdjustment = await adjustInvoiceInstallmentAmountForContext(
    CONTEXT,
    invoices[1]!.id,
    occurrenceIds[1]!,
    4_800,
    "current_and_future",
  );
  assert.equal(partialAdjustment.updatedCount, 1);
  assert.equal(partialAdjustment.skippedCount, 1);
  assert.equal(
    (await listInstallmentsForContext(CONTEXT, { invoiceId: invoices[2]!.id }))[0]?.amountMinor,
    4_500,
  );
  await assert.rejects(
    () =>
      adjustInvoiceInstallmentAmountForContext(
        CONTEXT,
        invoices[2]!.id,
        occurrenceIds[2]!,
        5_000,
        "current",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_INSTALLMENT_AMOUNT_LOCKED",
  );
  await assert.rejects(
    () =>
      reconcileInvoiceInstallmentForContext(
        CONTEXT,
        invoices[2]!.id,
        occurrenceIds[2]!,
        "reconciled",
      ),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_INVOICE_LOCKED",
  );
  await assert.rejects(
    () =>
      updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, {
        description: `Nao deve persistir ${suffix}`,
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_INVOICE_LOCKED",
  );
  const unchanged = await readTransaction(purchase.transaction.id);
  assert.equal(unchanged.cardInstrumentId, virtualInstrument.id);

  // A corrupt/incompatible currency in the occurrence must not silently be
  // converted to the invoice currency or alter its financial totals.
  const originalSecondAmount = (
    await listInstallmentsForContext(CONTEXT, { invoiceId: invoices[1]!.id })
  )[0]?.amountMinor;
  const originalSecondTotal = await readInvoiceTotal(invoices[1]!.id);
  await query(`update "Installment" set "currency" = 'USD' where "id" = $1`, [occurrenceIds[1]]);
  try {
    await assert.rejects(
      () =>
        adjustInvoiceInstallmentAmountForContext(
          CONTEXT,
          invoices[1]!.id,
          occurrenceIds[1]!,
          5_200,
          "current",
        ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CARD_INSTALLMENT_AMOUNT_LOCKED",
    );
    assert.equal(
      (await listInstallmentsForContext(CONTEXT, { invoiceId: invoices[1]!.id }))[0]?.amountMinor,
      originalSecondAmount,
    );
    assert.equal(await readInvoiceTotal(invoices[1]!.id), originalSecondTotal);
  } finally {
    await query(`update "Installment" set "currency" = 'BRL' where "id" = $1`, [occurrenceIds[1]]);
  }
}

async function assertCommonCardPurchaseEdit(
  cardId: string,
  physicalInstrument: ApiCardInstrument,
  virtualInstrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-04-08",
    amountMinor: 2_000,
    description: `Compra comum original ${suffix}`,
    cardInstrumentId: physicalInstrument.id,
  });
  const originalInvoiceId = purchase.invoice.id;

  const result = await updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, {
    amountMinor: 2_500,
    occurredOn: "2028-04-09",
    description: `Compra comum editada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
  });

  assert.equal(result.transaction.kind, "expense");
  assert.equal(result.transaction.id, purchase.transaction.id);
  assert.equal(result.transaction.invoiceId, originalInvoiceId);
  assert.equal(result.transaction.cardId, cardId);
  assert.equal(result.transaction.cardInstrumentId, virtualInstrument.id);
  assert.equal(result.transaction.amountMinor, 2_500);
  assert.equal(result.transaction.occurredOn, "2028-04-09");
  assert.equal(result.transaction.plannedOn, "2028-04-09");
  assert.equal(result.transaction.description, `Compra comum editada ${suffix}`);
  assert.equal(result.transaction.recurrenceId, undefined);
  assert.equal(result.transaction.installmentId, undefined);
  assert.equal(result.invoice.invoiceId, originalInvoiceId);
  assert.equal(result.invoice.totalExpensesMinor, purchase.invoice.totalAmountMinor + 500);
  // The inline status control changes only reconciliation, never invoice totals or purchase fields.
  const reconciled = await updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, {
    status: "reconciled",
  });
  assert.equal(reconciled.transaction.status, "reconciled");
  assert.equal(reconciled.transaction.amountMinor, 2_500);
  assert.equal(reconciled.transaction.description, result.transaction.description);
  assert.equal(reconciled.invoice.totalExpensesMinor, result.invoice.totalExpensesMinor);
  assert.equal(
    reconciled.invoice.reconciledExpensesMinor - result.invoice.reconciledExpensesMinor,
    result.transaction.status === "reconciled" ? 0 : 2_500,
  );
  const unreconciled = await updateCardPurchaseForContext(
    CONTEXT,
    cardId,
    purchase.transaction.id,
    { status: "posted" },
  );
  assert.equal(unreconciled.transaction.status, "posted");
  assert.equal(unreconciled.transaction.amountMinor, 2_500);
  assert.equal(unreconciled.invoice.totalExpensesMinor, result.invoice.totalExpensesMinor);
  assert.equal(
    unreconciled.invoice.reconciledExpensesMinor,
    result.invoice.reconciledExpensesMinor -
      (result.transaction.status === "reconciled" ? 2_500 : 0),
  );

  const row = await readTransaction(purchase.transaction.id);
  assert.equal(row.accountId, null);
  assert.equal(row.cardId, cardId);
  assert.equal(row.invoiceId, originalInvoiceId);
  assert.equal(row.recurrenceId, null);
  assert.equal(row.installmentId, null);
  assert.equal(row.cardInstrumentId, virtualInstrument.id);

  // A user-supplied text marker must never convert an EXPENSE into a credit.
  const markerOnly = await updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, {
    description: `Compra comum ${suffix} [estorno:${purchase.transaction.id}:unico]`,
  });
  assert.equal(markerOnly.transaction.kind, "expense");
  const invoiceBeforeReversal = await summarizeInvoiceForContext(CONTEXT, originalInvoiceId);
  assert.equal(invoiceBeforeReversal.totalExpensesMinor, 2_500);
  const ordinaryPurchase = (
    await listCardPurchasesForContext(CONTEXT, { invoiceId: originalInvoiceId })
  ).find((item) => item.id === purchase.transaction.id);
  assert.equal(ordinaryPurchase?.kind, "expense");
  assert.equal(ordinaryPurchase?.amountMinor, 2_500);

  // Genuine credits carry INCOME direction in the serialized API contract.
  const reversal = await reverseCardPurchaseForContext(
    CONTEXT,
    cardId,
    purchase.transaction.id,
    originalInvoiceId,
  );
  assert.equal(reversal.amountMinor, -2_500);
  const reversalRow = (
    await listCardPurchasesForContext(CONTEXT, { invoiceId: originalInvoiceId })
  ).find((item) => item.id === reversal.transactionId);
  assert.equal(reversalRow?.kind, "income");
  assert.equal(reversalRow?.amountMinor, 2_500);
  const invoiceBefore = await summarizeInvoiceForContext(CONTEXT, originalInvoiceId);
  assert.equal(invoiceBefore.totalExpensesMinor, invoiceBeforeReversal.totalExpensesMinor - 2_500);
  await assert.rejects(
    () => reverseCardPurchaseForContext(CONTEXT, cardId, reversal.transactionId, originalInvoiceId),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_REVERSAL_INVALID_SOURCE",
  );
  const invoiceAfter = await summarizeInvoiceForContext(CONTEXT, originalInvoiceId);
  assert.equal(invoiceAfter.totalExpensesMinor, invoiceBefore.totalExpensesMinor);
}

async function assertRecurringCardPurchaseEdit(
  cardId: string,
  physicalInstrument: ApiCardInstrument,
  virtualInstrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2028-04-08",
    amountMinor: 3_000,
    description: `Compra recorrente original ${suffix}`,
    cardId,
    cardInstrumentId: physicalInstrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-04-08", 1);

  const original = await readRecurringOccurrence(recurrence.id);
  assert.equal(original.accountId, null);
  assert.equal(original.cardId, cardId);
  assert.notEqual(original.transactionId, null);
  assert.notEqual(original.installmentId, null);
  assert.notEqual(original.invoiceId, null);

  const result = await updateCardPurchaseForContext(CONTEXT, cardId, original.transactionId, {
    amountMinor: 3_700,
    occurredOn: "2028-04-09",
    description: `Compra recorrente editada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
  });

  assert.equal(result.transaction.id, original.transactionId);
  assert.equal(result.transaction.invoiceId, original.invoiceId);
  assert.equal(result.transaction.recurrenceId, recurrence.id);
  assert.equal(result.transaction.installmentId, original.installmentId);
  assert.equal(result.transaction.cardInstrumentId, virtualInstrument.id);
  assert.equal(result.transaction.amountMinor, 3_700);
  assert.equal(result.transaction.occurredOn, "2028-04-09");
  assert.equal(result.transaction.plannedOn, "2028-04-09");
  assert.equal(result.transaction.description, `Compra recorrente editada ${suffix}`);

  const refreshed = await readRecurringOccurrence(recurrence.id);
  assert.equal(refreshed.accountId, null);
  assert.equal(refreshed.cardId, cardId);
  assert.equal(refreshed.transactionId, original.transactionId);
  assert.equal(refreshed.invoiceId, original.invoiceId);
  assert.equal(refreshed.recurrenceId, recurrence.id);
  assert.equal(refreshed.installmentId, original.installmentId);
  assert.equal(refreshed.transactionCardInstrumentId, virtualInstrument.id);
  assert.equal(refreshed.installmentCardInstrumentId, virtualInstrument.id);
  assert.equal(refreshed.transactionAmountMinor, 3_700);
  assert.equal(refreshed.installmentAmountMinor, 3_700);
  assert.equal(refreshed.transactionOccurredOn, "2028-04-09");
  assert.equal(refreshed.transactionPlannedOn, "2028-04-09");
  assert.equal(refreshed.installmentDueOn, "2028-04-09");

  await assert.rejects(
    () =>
      updateCardPurchaseForContext(CONTEXT, cardId, original.transactionId, {
        occurredOn: "2028-04-21",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CARD_PURCHASE_DATE_OUT_OF_INVOICE_PERIOD",
  );
}

async function assertLockedInvoiceRejectsCardPurchaseEdit(suffix: string): Promise<void> {
  const lockedStatuses = ["CLOSED", "PAID", "CANCELLED"] as const;

  for (const [index, status] of lockedStatuses.entries()) {
    const account = await createCreditCardAccountForContext(CONTEXT, {
      name: `Cartao fatura ${status} ${suffix}`,
      closingDay: 20,
      dueDay: 10,
      currency: "BRL",
      creditLimitMinor: 10_000,
      instruments: [
        {
          type: "physical",
          holder: "primary",
          name: `Fisico ${status}`,
          maskedIdentifier: `**** 7${index}7${index}`,
        },
      ],
    });
    const physicalInstrument = requireInstrument(account.instruments, "physical");
    const purchase = await registerCardPurchaseForContext(CONTEXT, account.id, {
      occurredOn: `2028-0${6 + index}-08`,
      amountMinor: 4_000,
      description: `Compra fatura ${status} ${suffix}`,
      cardInstrumentId: physicalInstrument.id,
    });

    await query(`update "Invoice" set "status" = $2 where "id" = $1`, [
      purchase.invoice.id,
      status,
    ]);

    await assert.rejects(
      () =>
        updateCardPurchaseForContext(CONTEXT, account.id, purchase.transaction.id, {
          amountMinor: 4_500,
        }),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_INVOICE_LOCKED",
    );

    // A status-only shortcut must not bypass invoice lifecycle restrictions.
    await assert.rejects(
      () =>
        updateCardPurchaseForContext(CONTEXT, account.id, purchase.transaction.id, {
          status: "reconciled",
        }),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_INVOICE_LOCKED",
    );

    const row = await readTransaction(purchase.transaction.id);
    assert.equal(row.cardInstrumentId, physicalInstrument.id);

    const invoiceTotal = await readInvoiceTotal(purchase.invoice.id);
    assert.equal(invoiceTotal, purchase.invoice.totalAmountMinor);
  }
}

async function assertSimplePurchaseSoftDelete(
  cardId: string,
  cardInstrumentId: string,
  suffix: string,
): Promise<void> {
  try {
    await withSharedTransaction(async () => {
    const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
      occurredOn: "2031-02-08",
      amountMinor: 1_200,
      description: "Compra simples para anular " + suffix,
      cardInstrumentId,
    });
    const invoiceId = purchase.invoice.id;
    const before = await summarizeInvoiceForContext(CONTEXT, invoiceId);
    assert.equal(before.purchasesCount, 1);
    const previousLimit = before.cardTotals[0]?.limitUsedMinor;
    assert.ok(previousLimit !== undefined);

    await assert.rejects(
      () =>
        deleteSimpleCardPurchaseForContext(OTHER_PROFILE_CONTEXT, cardId, purchase.transaction.id),
      (error: unknown) => isNotFoundError(error),
    );
    assert.equal(await readInvoiceTotal(invoiceId), before.totalExpensesMinor);

    const result = await deleteSimpleCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id);
    assert.deepEqual(result, { transactionId: purchase.transaction.id, invoiceId });
    const persisted = await query<{
      id: string;
      status: string;
      amountMinor: number;
      voidedAt: Date | null;
      updatedByUserId: string | null;
    }>(
      'select "id", "status", "amountMinor", "voidedAt", "updatedByUserId" ' +
        'from "Transaction" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3',
      [purchase.transaction.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
    );
    assert.equal(persisted.length, 1, "Soft deletion must preserve the financial row");
    assert.equal(persisted[0]?.status, "VOIDED");
    assert.equal(persisted[0]?.amountMinor, 1_200);
    assert.ok(persisted[0]?.voidedAt instanceof Date);
    assert.equal(persisted[0]?.updatedByUserId, CONTEXT.userId);

    const audit = await query<{ action: string; redactedChanges: unknown }>(
      'select "action", "redactedChanges" from "AuditLogEntry" ' +
        'where "organizationId" = $1 and "financialProfileId" = $2 and "entityId" = $3 ' +
        'order by "occurredAt" desc limit 1',
      [CONTEXT.organizationId, CONTEXT.financialProfileId, purchase.transaction.id],
    );
    assert.equal(audit.length, 1);
    assert.equal(audit[0]?.action, "SOFT_DELETE");
    assert.deepEqual(audit[0]?.redactedChanges, { status: "changed", voidedAt: "added" });

    const after = await summarizeInvoiceForContext(CONTEXT, invoiceId);
    assert.equal(after.totalExpensesMinor, before.totalExpensesMinor - 1_200);
    assert.equal(after.unreconciledExpensesMinor, before.unreconciledExpensesMinor - 1_200);
    assert.equal(after.purchasesCount, before.purchasesCount - 1);
    assert.equal(after.cardTotals[0]?.limitUsedMinor, previousLimit - 1_200);
    assert.equal(
      (await listCardPurchasesForContext(CONTEXT, { invoiceId })).some(
        (row) => row.id === purchase.transaction.id,
      ),
      false,
    );
    await assert.rejects(
      () => deleteSimpleCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id),
      (error: unknown) => isNotFoundError(error),
    );
    await assert.rejects(
      () =>
        updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, { description: "X" }),
      (error: unknown) => isNotFoundError(error),
    );
    assert.equal(await readInvoiceTotal(invoiceId), after.totalExpensesMinor);

    await assert.rejects(
      () => reverseCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, invoiceId),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "CARD_REVERSAL_INVALID_SOURCE",
    );
    await assert.rejects(
      () =>
        moveCardPurchaseInvoicePeriodForContext(CONTEXT, cardId, purchase.transaction.id, {
          invoicePeriod: "2031-03",
        }),
      (error: unknown) => isNotFoundError(error),
    );
    assert.equal(await readInvoiceTotal(invoiceId), after.totalExpensesMinor);

    const reconciled = await registerCardPurchaseForContext(CONTEXT, cardId, {
      occurredOn: "2031-02-09",
      amountMinor: 700,
      description: "Compra conciliada preservada " + suffix,
      cardInstrumentId,
    });
    await updateCardPurchaseForContext(CONTEXT, cardId, reconciled.transaction.id, {
      status: "reconciled",
    });
    const protectedTotal = await readInvoiceTotal(invoiceId);
    await assert.rejects(
      () => deleteSimpleCardPurchaseForContext(CONTEXT, cardId, reconciled.transaction.id),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_DELETE_LOCKED",
    );
    assert.equal(await readInvoiceTotal(invoiceId), protectedTotal);
    const protectedRow = await query<{ status: string }>(
      'select "status" from "Transaction" where "id" = $1',
      [reconciled.transaction.id],
    );
    assert.equal(protectedRow[0]?.status, "RECONCILED");

    const another = await registerCardPurchaseForContext(CONTEXT, cardId, {
      occurredOn: "2031-02-10",
      amountMinor: 400,
      description: "Compra para estorno anulado " + suffix,
      cardInstrumentId,
    });
    const reversal = await reverseCardPurchaseForContext(
      CONTEXT,
      cardId,
      another.transaction.id,
      another.invoice.id,
    );
    await deleteSimpleCardPurchaseForContext(CONTEXT, cardId, reversal.transactionId);
    const beforeBlockedReversalEdit = await readInvoiceTotal(invoiceId);
    await assert.rejects(
      () =>
        updateCardReversalForContext(CONTEXT, cardId, reversal.transactionId, {
          description: "Estorno alterado indevidamente",
          occurredOn: "2031-02-10",
          amountMinor: 500,
        }),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "CARD_REVERSAL_EDIT_LOCKED",
    );
    assert.equal(await readInvoiceTotal(invoiceId), beforeBlockedReversalEdit);
      // Do not leave active purchases that contaminate report integration cases.
      throw new RollbackSoftDeleteFixtures();
    });
  } catch (error) {
    if (!(error instanceof RollbackSoftDeleteFixtures)) throw error;
  }
}
async function assertConcurrentPurchaseEditCannotResurrect(
  cardId: string,
  cardInstrumentId: string,
  suffix: string,
): Promise<void> {
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2031-02-13",
    amountMinor: 550,
    description: "Compra em disputa com edição " + suffix,
    cardInstrumentId,
  });
  const client = await getPool().connect();
  let locked = false;
  try {
    await client.query("BEGIN");
    locked = true;
    await client.query('select "id" from "Transaction" where "id" = $1 for update', [
      purchase.transaction.id,
    ]);
    // DELETE is queued before EDIT, while EDIT must still read the active row.
    const deletion = deleteSimpleCardPurchaseForContext(
      CONTEXT,
      cardId,
      purchase.transaction.id,
    ).then(
      (value) => ({ success: true as const, value }),
      (error: unknown) => ({ success: false as const, error }),
    );
    await waitForBlockedSql("for update of t, inv");
    const edition = updateCardPurchaseForContext(CONTEXT, cardId, purchase.transaction.id, {
      amountMinor: 825,
    }).then(
      () => ({ success: true as const }),
      (error: unknown) => ({ success: false as const, error }),
    );
    await waitForBlockedSql('update "Transaction" set');

    await client.query("COMMIT");
    locked = false;
    const deletionResult = await deletion;
    if (!deletionResult.success) throw deletionResult.error;
    assert.equal(deletionResult.value.invoiceId, purchase.invoice.id);
    const editionResult = await edition;
    assert.equal(editionResult.success, false, "A delayed edit cannot restore VOIDED");
    if (!editionResult.success) {
      assert.ok(editionResult.error instanceof Error);
      assert.equal(
        (editionResult.error as Error & { code?: string }).code,
        "CARD_PURCHASE_CONCURRENT_CHANGE",
      );
    }
  } finally {
    if (locked) await client.query("ROLLBACK");
    client.release();
  }

  const rows = await query<{ status: string; amountMinor: number; voidedAt: Date | null }>(
    'select "status", "amountMinor", "voidedAt" from "Transaction" where "id" = $1',
    [purchase.transaction.id],
  );
  assert.equal(rows[0]?.status, "VOIDED");
  assert.equal(rows[0]?.amountMinor, 550);
  assert.ok(rows[0]?.voidedAt instanceof Date);
  assert.equal((await summarizeInvoiceForContext(CONTEXT, purchase.invoice.id)).totalExpensesMinor, 0);
}

async function waitForBlockedSql(needle: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const [row] = await query<{ blocked: boolean }>(
      `select exists (
         select 1 from pg_stat_activity
          where "datname" = current_database() and "pid" <> pg_backend_pid()
            and "wait_event_type" = 'Lock' and "query" ilike $1
       ) as "blocked"`,
      ["%" + needle + "%"],
    );
    if (row?.blocked) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Database writer contention was not observed: " + needle);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof TenantAuthorizationError ||
    (error instanceof Error &&
      "code" in error &&
      (error.code === "CARD_PURCHASE_NOT_FOUND" || error.code === "TENANT_RESOURCE_NOT_FOUND"))
  );
}

async function readInvoiceTotal(invoiceId: string): Promise<number> {
  const rows = await query<{ totalAmountMinor: number }>(
    `select "totalAmountMinor" from "Invoice" where "id" = $1`,
    [invoiceId],
  );

  const row = rows[0];

  if (row === undefined) {
    throw new Error(`Expected invoice ${invoiceId}.`);
  }

  return row.totalAmountMinor;
}

async function readTransaction(transactionId: string): Promise<TransactionRow> {
  const rows = await query<TransactionRow>(
    `select
        "id",
        "accountId",
        "cardId",
        "cardInstrumentId",
        "invoiceId",
        "recurrenceId",
        "installmentId"
       from "Transaction"
       where "id" = $1`,
    [transactionId],
  );

  const row = rows[0];

  if (row === undefined) {
    throw new Error(`Expected transaction ${transactionId}.`);
  }

  return row;
}

async function readRecurringOccurrence(recurrenceId: string): Promise<RecurringOccurrenceRow> {
  const rows = await query<RecurringOccurrenceRow>(
    `select
        t."id" as "transactionId",
        t."accountId",
        t."cardId",
        t."invoiceId",
        t."recurrenceId",
        t."installmentId",
        t."cardInstrumentId" as "transactionCardInstrumentId",
        t."amountMinor" as "transactionAmountMinor",
        to_char(t."occurredOn", 'YYYY-MM-DD') as "transactionOccurredOn",
        to_char(t."plannedOn", 'YYYY-MM-DD') as "transactionPlannedOn",
        i."id" as "installmentId",
        i."cardInstrumentId" as "installmentCardInstrumentId",
        i."amountMinor" as "installmentAmountMinor",
        to_char(i."dueOn", 'YYYY-MM-DD') as "installmentDueOn"
       from "Transaction" t
       join "Installment" i on i."id" = t."installmentId"
       where t."recurrenceId" = $1
       order by t."createdAt" asc
       limit 1`,
    [recurrenceId],
  );

  const row = rows[0];

  if (row === undefined) {
    throw new Error(`Expected recurring occurrence for ${recurrenceId}.`);
  }

  return row;
}

function requireInstrument(
  instruments: readonly ApiCardInstrument[],
  type: ApiCardInstrument["type"],
): ApiCardInstrument {
  const instrument = instruments.find((candidate) => candidate.type === type);

  if (instrument === undefined) {
    throw new Error(`Expected ${type} instrument.`);
  }

  return instrument;
}

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface ApiCardInstrument {
  id: string;
  type: "physical" | "virtual";
}

interface TransactionRow {
  id: string;
  accountId: string | null;
  cardId: string | null;
  cardInstrumentId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
}

interface RecurringOccurrenceRow {
  transactionId: string;
  accountId: string | null;
  cardId: string | null;
  invoiceId: string;
  recurrenceId: string;
  installmentId: string;
  transactionCardInstrumentId: string | null;
  transactionAmountMinor: number;
  transactionOccurredOn: string;
  transactionPlannedOn: string;
  installmentCardInstrumentId: string | null;
  installmentAmountMinor: number;
  installmentDueOn: string;
}
