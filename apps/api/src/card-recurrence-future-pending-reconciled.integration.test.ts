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
    name: `Cartao conciliadas futuras ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 80_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico conciliadas",
        maskedIdentifier: "**** 9191",
      },
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual conciliadas",
        maskedIdentifier: "**** 9292",
      },
    ],
  });
  const physicalInstrument = requireInstrument(account.instruments, "physical");
  const virtualInstrument = requireInstrument(account.instruments, "virtual");
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2027-11-05",
    amountMinor: 1_111,
    description: `Recorrencia conciliadas futuras ${suffix}`,
    cardId: account.id,
    cardInstrumentId: physicalInstrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-01-05", 3);

  const occurrences = await readOccurrences(recurrence.id);
  assert.equal(occurrences.length, 3);

  const installmentLockedOccurrence = requireSequence(occurrences, 2);
  const transactionLockedOccurrence = requireSequence(occurrences, 3);

  await markInstallmentStatus(installmentLockedOccurrence.installmentId, "RECONCILED");
  await markTransactionStatus(transactionLockedOccurrence.transactionId, "RECONCILED");

  const update = await updateRecurrenceForContext(CONTEXT, recurrence.id, {
    editScope: "recurrence_and_future_pending",
    amountMinor: 3_333,
    description: `Recorrencia conciliadas atualizada ${suffix}`,
    cardInstrumentId: virtualInstrument.id,
  });

  assert.equal(update.futurePendingUpdate?.updatedCount, 1);
  assert.equal(update.futurePendingUpdate?.skippedCount, 2);
  assert.deepEqual(update.futurePendingUpdate?.skipped.map((item) => item.reason).sort(), [
    "installment_locked",
    "transaction_locked",
  ]);

  const refreshed = await readOccurrences(recurrence.id);
  const refreshedEligible = requireSequence(refreshed, 1);
  const refreshedInstallmentLocked = requireSequence(refreshed, 2);
  const refreshedTransactionLocked = requireSequence(refreshed, 3);

  assert.equal(refreshedEligible.installmentAmountMinor, 3_333);
  assert.equal(refreshedEligible.installmentCardInstrumentId, virtualInstrument.id);
  assert.equal(refreshedEligible.transactionAmountMinor, 3_333);
  assert.equal(
    refreshedEligible.transactionDescription,
    `Recorrencia conciliadas atualizada ${suffix}`,
  );
  assert.equal(refreshedEligible.transactionCardInstrumentId, virtualInstrument.id);

  assertOccurrencePreserved(refreshedInstallmentLocked, installmentLockedOccurrence);
  assertOccurrencePreserved(refreshedTransactionLocked, transactionLockedOccurrence);
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
        i."id" as "installmentId",
        i."sequenceNumber",
        i."status" as "installmentStatus",
        i."amountMinor" as "installmentAmountMinor",
        i."cardInstrumentId" as "installmentCardInstrumentId",
        t."id" as "transactionId",
        t."status" as "transactionStatus",
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

async function markInstallmentStatus(installmentId: string, status: string): Promise<void> {
  await query(`update "Installment" set "status" = $1 where "id" = $2`, [
    status,
    installmentId,
  ]);
}

async function markTransactionStatus(
  transactionId: string | null,
  status: string,
): Promise<void> {
  assert.notEqual(transactionId, null);

  await query(`update "Transaction" set "status" = $1 where "id" = $2`, [status, transactionId]);
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
  installmentStatus: string;
  installmentAmountMinor: number;
  installmentCardInstrumentId: string | null;
  transactionId: string | null;
  transactionStatus: string | null;
  transactionAmountMinor: number | null;
  transactionDescription: string | null;
  transactionCardInstrumentId: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
}
