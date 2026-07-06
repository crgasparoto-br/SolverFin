import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import {
  createRecurrenceForContext,
  generateInstallmentsForContext,
  updateRecurrenceForContext,
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
    name: `Cartao futuras pendentes ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 80_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico futuras",
        maskedIdentifier: "**** 6161",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual futuras",
        maskedIdentifier: "**** 7171",
      },
    ],
  });
  const physicalInstrument = requireInstrument(account.instruments, "physical");
  const virtualInstrument = requireInstrument(account.instruments, "virtual");
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2027-11-05",
    amountMinor: 1_111,
    description: `Recorrencia futuras pendentes ${suffix}`,
    cardId: account.id,
    cardInstrumentId: physicalInstrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-02-05", 4);

  const occurrences = await readOccurrences(recurrence.id);
  assert.equal(occurrences.length, 4);

  const paidOccurrence = requireSequence(occurrences, 2);
  const cancelledOccurrence = requireSequence(occurrences, 3);
  const missingTransactionOccurrence = requireSequence(occurrences, 4);

  await markInvoiceStatus(paidOccurrence.invoiceId, "PAID");
  await markInvoiceStatus(cancelledOccurrence.invoiceId, "CANCELLED");
  await deleteTransaction(missingTransactionOccurrence.transactionId);

  const update = await updateRecurrenceForContext(CONTEXT, recurrence.id, {
    editScope: "recurrence_and_future_pending",
    amountMinor: 3_333,
    description: `Recorrencia atualizada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
  });

  assert.equal(update.futurePendingUpdate?.updatedCount, 1);
  assert.equal(update.futurePendingUpdate?.skippedCount, 3);
  assert.deepEqual(update.futurePendingUpdate?.skipped.map((item) => item.reason).sort(), [
    "invoice_locked",
    "invoice_locked",
    "transaction_missing",
  ]);

  const refreshed = await readOccurrences(recurrence.id);
  const refreshedEligible = requireSequence(refreshed, 1);
  const refreshedPaid = requireSequence(refreshed, 2);
  const refreshedCancelled = requireSequence(refreshed, 3);
  const refreshedMissingTransaction = requireSequence(refreshed, 4);

  assert.equal(refreshedEligible.installmentAmountMinor, 3_333);
  assert.equal(refreshedEligible.installmentCardInstrumentId, virtualInstrument.id);
  assert.equal(refreshedEligible.transactionAmountMinor, 3_333);
  assert.equal(refreshedEligible.transactionDescription, `Recorrencia atualizada ${suffix}`);
  assert.equal(refreshedEligible.transactionCardInstrumentId, virtualInstrument.id);

  assertOccurrencePreserved(refreshedPaid, paidOccurrence);
  assertOccurrencePreserved(refreshedCancelled, cancelledOccurrence);
  assert.equal(refreshedMissingTransaction.transactionId, null);
  assert.equal(
    refreshedMissingTransaction.installmentAmountMinor,
    missingTransactionOccurrence.installmentAmountMinor,
  );
  assert.equal(
    refreshedMissingTransaction.installmentCardInstrumentId,
    missingTransactionOccurrence.installmentCardInstrumentId,
  );
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
        i."id" as "installmentId",
        i."sequenceNumber",
        i."amountMinor" as "installmentAmountMinor",
        i."cardInstrumentId" as "installmentCardInstrumentId",
        t."id" as "transactionId",
        t."amountMinor" as "transactionAmountMinor",
        t."description" as "transactionDescription",
        t."cardInstrumentId" as "transactionCardInstrumentId",
        inv."id" as "invoiceId",
        inv."status" as "invoiceStatus"
       from "Installment" i
       left join "Transaction" t on t."installmentId" = i."id"
       left join "Invoice" inv on inv."id" = t."invoiceId"
       where i."recurrenceId" = $1
       order by i."sequenceNumber" asc`,
    [recurrenceId],
  );
}

async function markInvoiceStatus(invoiceId: string | null, status: string): Promise<void> {
  assert.notEqual(invoiceId, null);

  await query(`update "Invoice" set "status" = $1 where "id" = $2`, [status, invoiceId]);
}

async function deleteTransaction(transactionId: string | null): Promise<void> {
  assert.notEqual(transactionId, null);

  await query(`delete from "Transaction" where "id" = $1`, [transactionId]);
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

function requireSequence(occurrences: OccurrenceRow[], sequenceNumber: number): OccurrenceRow {
  const occurrence = occurrences.find((candidate) => candidate.sequenceNumber === sequenceNumber);

  if (occurrence === undefined) {
    throw new Error(`Expected occurrence sequence ${sequenceNumber}.`);
  }

  return occurrence;
}

function assertOccurrencePreserved(occurrence: OccurrenceRow, original: OccurrenceRow): void {
  assert.equal(occurrence.installmentAmountMinor, original.installmentAmountMinor);
  assert.equal(occurrence.installmentCardInstrumentId, original.installmentCardInstrumentId);
  assert.equal(occurrence.transactionId, original.transactionId);
  assert.equal(occurrence.transactionAmountMinor, original.transactionAmountMinor);
  assert.equal(occurrence.transactionDescription, original.transactionDescription);
  assert.equal(occurrence.transactionCardInstrumentId, original.transactionCardInstrumentId);
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

interface OccurrenceRow {
  installmentId: string;
  sequenceNumber: number;
  installmentAmountMinor: number;
  installmentCardInstrumentId: string | null;
  transactionId: string | null;
  transactionAmountMinor: number | null;
  transactionDescription: string | null;
  transactionCardInstrumentId: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
}
