import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { moveCardPurchaseInvoicePeriodForContext } from "./repositories/card-purchase-invoice-period-move.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { registerCardPurchaseForContext } from "./repositories/cards.js";
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
    name: `Cartao mover fatura ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 200_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico mover",
        maskedIdentifier: "**** 4141",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual mover",
        maskedIdentifier: "**** 4242",
      },
    ],
  });
  const physicalInstrument = requireInstrument(account.instruments, "physical");

  await assertMoveCommonPurchase(account.id, physicalInstrument, suffix);
  await assertRejectsSamePeriod(account.id, physicalInstrument, suffix);
  await assertLockedOriginAndDestinationInvoices(account.id, physicalInstrument, suffix);
  await assertMoveInstallmentPurchaseSelectedOccurrence(account.id, physicalInstrument, suffix);
  await assertMoveRecurringMaterializedOccurrence(account.id, physicalInstrument, suffix);
}

async function assertMoveCommonPurchase(
  cardId: string,
  instrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const destination = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-08-05",
    amountMinor: 1_100,
    description: `Compra destino existente ${suffix}`,
    cardInstrumentId: instrument.id,
  });
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-07-10",
    amountMinor: 2_500,
    description: `Compra mover comum ${suffix}`,
    cardInstrumentId: instrument.id,
  });
  const originInvoiceId = purchase.invoice.id;
  const destinationInvoiceId = destination.invoice.id;

  const result = await moveCardPurchaseInvoicePeriodForContext(
    CONTEXT,
    cardId,
    purchase.transaction.id,
    { invoicePeriod: "2028-08" },
  );

  assert.equal(result.transaction.id, purchase.transaction.id);
  assert.equal(result.transaction.invoiceId, destinationInvoiceId);
  assert.equal(result.transaction.cardId, cardId);
  assert.equal(result.transaction.cardInstrumentId, instrument.id);
  assert.equal(result.transaction.amountMinor, 2_500);
  assert.equal(result.transaction.currency, "BRL");
  assert.equal(result.transaction.description, `Compra mover comum ${suffix}`);
  assert.equal(result.transaction.status, "posted");
  assert.equal(result.transaction.occurredOn, "2028-08-10");
  assert.equal(result.originInvoice.invoiceId, originInvoiceId);
  assert.equal(result.originInvoice.totalExpensesMinor, 0);
  assert.equal(result.destinationInvoice.invoiceId, destinationInvoiceId);
  assert.equal(result.destinationInvoice.totalExpensesMinor, 3_600);
  assert.equal(result.installmentScope, "selected_purchase");
  assert.equal(result.recurrenceScope, "materialized_occurrence_only");

  const moved = await readTransaction(purchase.transaction.id);
  assert.equal(moved.invoiceId, destinationInvoiceId);
  assert.equal(moved.cardInstrumentId, instrument.id);
  assert.equal(moved.recurrenceId, null);
  assert.equal(moved.installmentId, null);

  assert.equal(await readInvoiceTotal(originInvoiceId), 0);
  assert.equal(await readInvoiceTotal(destinationInvoiceId), 3_600);
}

async function assertRejectsSamePeriod(
  cardId: string,
  instrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-09-10",
    amountMinor: 1_200,
    description: `Compra mesmo periodo ${suffix}`,
    cardInstrumentId: instrument.id,
  });

  await assert.rejects(
    () =>
      moveCardPurchaseInvoicePeriodForContext(CONTEXT, cardId, purchase.transaction.id, {
        invoicePeriod: "2028-09",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CARD_PURCHASE_INVOICE_PERIOD_UNCHANGED",
  );
}

async function assertLockedOriginAndDestinationInvoices(
  cardId: string,
  instrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const lockedOrigin = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-10-10",
    amountMinor: 1_300,
    description: `Origem travada ${suffix}`,
    cardInstrumentId: instrument.id,
  });

  await query(`update "Invoice" set "status" = 'CLOSED' where "id" = $1`, [
    lockedOrigin.invoice.id,
  ]);

  await assert.rejects(
    () =>
      moveCardPurchaseInvoicePeriodForContext(CONTEXT, cardId, lockedOrigin.transaction.id, {
        invoicePeriod: "2028-11",
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "CARD_PURCHASE_INVOICE_LOCKED",
  );

  const destination = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-12-10",
    amountMinor: 1_400,
    description: `Destino travado ${suffix}`,
    cardInstrumentId: instrument.id,
  });

  await query(`update "Invoice" set "status" = 'PAID' where "id" = $1`, [destination.invoice.id]);

  const movable = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2028-11-10",
    amountMinor: 1_500,
    description: `Compra destino travado ${suffix}`,
    cardInstrumentId: instrument.id,
  });

  await assert.rejects(
    () =>
      moveCardPurchaseInvoicePeriodForContext(CONTEXT, cardId, movable.transaction.id, {
        invoicePeriod: "2028-12",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CARD_PURCHASE_DESTINATION_INVOICE_LOCKED",
  );

  const row = await readTransaction(movable.transaction.id);
  assert.equal(row.invoiceId, movable.invoice.id);
  assert.equal(await readInvoiceTotal(movable.invoice.id), movable.invoice.totalAmountMinor);
}

async function assertMoveInstallmentPurchaseSelectedOccurrence(
  cardId: string,
  instrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const purchase = await registerCardPurchaseForContext(CONTEXT, cardId, {
    occurredOn: "2029-01-10",
    amountMinor: 6_000,
    description: `Compra parcelada mover ${suffix}`,
    cardInstrumentId: instrument.id,
    totalInstallments: 3,
  });

  const result = await moveCardPurchaseInvoicePeriodForContext(
    CONTEXT,
    cardId,
    purchase.transaction.id,
    { invoicePeriod: "2029-04" },
  );

  const row = await readTransaction(purchase.transaction.id);
  assert.equal(result.transaction.installmentId, undefined);
  assert.equal(row.installmentId, null);
  assert.equal(row.invoiceId, result.destinationInvoice.invoiceId);
  assert.equal(result.transaction.cardInstrumentId, instrument.id);
  assert.equal(result.transaction.amountMinor, 6_000);
  assert.equal(await readInvoiceTotal(purchase.invoice.id), 0);
  assert.equal(result.destinationInvoice.totalExpensesMinor, 2_000);
}

async function assertMoveRecurringMaterializedOccurrence(
  cardId: string,
  instrument: ApiCardInstrument,
  suffix: string,
): Promise<void> {
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2029-05-08",
    amountMinor: 3_000,
    description: `Recorrente mover ${suffix}`,
    cardId,
    cardInstrumentId: instrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2029-05-08", 1);

  const original = await readRecurringOccurrence(recurrence.id);
  const originalInvoiceTotal = await readInvoiceTotal(original.invoiceId);

  const result = await moveCardPurchaseInvoicePeriodForContext(
    CONTEXT,
    cardId,
    original.transactionId,
    { invoicePeriod: "2029-06" },
  );

  const refreshed = await readRecurringOccurrence(recurrence.id);
  assert.equal(result.transaction.id, original.transactionId);
  assert.equal(result.transaction.recurrenceId, recurrence.id);
  assert.equal(result.transaction.installmentId, original.installmentId);
  assert.equal(result.transaction.cardInstrumentId, instrument.id);
  assert.equal(result.transaction.amountMinor, 3_000);
  assert.notEqual(result.transaction.invoiceId, original.invoiceId);
  assert.equal(refreshed.recurrenceId, recurrence.id);
  assert.equal(refreshed.installmentId, original.installmentId);
  assert.equal(refreshed.transactionCardInstrumentId, instrument.id);
  assert.equal(refreshed.installmentCardInstrumentId, instrument.id);
  assert.equal(refreshed.invoiceId, result.destinationInvoice.invoiceId);
  assert.equal(refreshed.installmentDueOn, result.destinationInvoice.dueOn);
  assert.equal(await readInvoiceTotal(original.invoiceId), originalInvoiceTotal - 3_000);
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
        t."invoiceId",
        t."recurrenceId",
        t."installmentId",
        t."cardInstrumentId" as "transactionCardInstrumentId",
        i."cardInstrumentId" as "installmentCardInstrumentId",
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
  invoiceId: string;
  recurrenceId: string;
  installmentId: string;
  transactionCardInstrumentId: string | null;
  installmentCardInstrumentId: string | null;
  installmentDueOn: string;
}
