import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { updateCardPurchaseForContext } from "./repositories/card-invoice-contracts.js";
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
    name: `Cartao edicao compra ${suffix}`,
    closingDay: 20,
    dueDay: 10,
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
  await assertRecurringCardPurchaseEdit(account.id, physicalInstrument, virtualInstrument, suffix);
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

  const row = await readTransaction(purchase.transaction.id);
  assert.equal(row.accountId, null);
  assert.equal(row.cardId, cardId);
  assert.equal(row.invoiceId, originalInvoiceId);
  assert.equal(row.recurrenceId, null);
  assert.equal(row.installmentId, null);
  assert.equal(row.cardInstrumentId, virtualInstrument.id);
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
