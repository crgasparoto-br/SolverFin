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
    name: `Cartao periodo fatura ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 80_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico periodo",
        maskedIdentifier: "**** 8181",
      },
    ],
  });
  const physicalInstrument = requireInstrument(account.instruments, "physical");
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2027-11-05",
    amountMinor: 1_111,
    description: `Recorrencia periodo fatura ${suffix}`,
    cardId: account.id,
    cardInstrumentId: physicalInstrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2027-11-05", 1);

  const occurrences = await readOccurrences(recurrence.id);
  assert.equal(occurrences.length, 1);

  const original = requireOnlyOccurrence(occurrences);
  assert.notEqual(original.invoiceId, null);
  assert.notEqual(original.periodStartOn, null);
  assert.notEqual(original.periodEndOn, null);
  assertDateWithinPeriod(original.dueOn, original.periodStartOn, original.periodEndOn);
  assertDateOutsidePeriod("2027-11-25", original.periodStartOn, original.periodEndOn);

  const update = await updateRecurrenceForContext(CONTEXT, recurrence.id, {
    editScope: "recurrence_and_future_pending",
    startOn: "2027-11-25",
    amountMinor: 3_333,
    description: `Recorrencia fora periodo ${suffix}`,
  });

  assert.equal(update.futurePendingUpdate?.updatedCount, 0);
  assert.equal(update.futurePendingUpdate?.skippedCount, 1);
  assert.deepEqual(update.futurePendingUpdate?.skipped, [
    {
      installmentId: original.installmentId,
      sequenceNumber: original.sequenceNumber,
      reason: "invoice_period_mismatch",
      transactionId: original.transactionId,
      invoiceId: original.invoiceId,
    },
  ]);

  const refreshed = await readOccurrences(recurrence.id);
  assert.equal(refreshed.length, 1);
  assertOccurrencePreserved(requireOnlyOccurrence(refreshed), original);
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
        i."id" as "installmentId",
        i."sequenceNumber",
        to_char(i."dueOn", 'YYYY-MM-DD') as "dueOn",
        i."amountMinor" as "installmentAmountMinor",
        i."cardInstrumentId" as "installmentCardInstrumentId",
        t."id" as "transactionId",
        t."amountMinor" as "transactionAmountMinor",
        t."description" as "transactionDescription",
        to_char(t."occurredOn", 'YYYY-MM-DD') as "transactionOccurredOn",
        to_char(t."plannedOn", 'YYYY-MM-DD') as "transactionPlannedOn",
        t."cardInstrumentId" as "transactionCardInstrumentId",
        inv."id" as "invoiceId",
        to_char(inv."periodStartOn", 'YYYY-MM-DD') as "periodStartOn",
        to_char(inv."periodEndOn", 'YYYY-MM-DD') as "periodEndOn"
       from "Installment" i
       left join "Transaction" t on t."installmentId" = i."id"
       left join "Invoice" inv on inv."id" = t."invoiceId"
       where i."recurrenceId" = $1
       order by i."sequenceNumber" asc`,
    [recurrenceId],
  );
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

function requireOnlyOccurrence(occurrences: OccurrenceRow[]): OccurrenceRow {
  if (occurrences.length !== 1 || occurrences[0] === undefined) {
    throw new Error("Expected exactly one occurrence.");
  }

  return occurrences[0];
}

function assertOccurrencePreserved(occurrence: OccurrenceRow, original: OccurrenceRow): void {
  assert.equal(occurrence.dueOn, original.dueOn);
  assert.equal(occurrence.installmentAmountMinor, original.installmentAmountMinor);
  assert.equal(occurrence.installmentCardInstrumentId, original.installmentCardInstrumentId);
  assert.equal(occurrence.transactionId, original.transactionId);
  assert.equal(occurrence.transactionAmountMinor, original.transactionAmountMinor);
  assert.equal(occurrence.transactionDescription, original.transactionDescription);
  assert.equal(occurrence.transactionOccurredOn, original.transactionOccurredOn);
  assert.equal(occurrence.transactionPlannedOn, original.transactionPlannedOn);
  assert.equal(occurrence.transactionCardInstrumentId, original.transactionCardInstrumentId);
  assert.equal(occurrence.invoiceId, original.invoiceId);
}

function assertDateWithinPeriod(
  date: string,
  periodStartOn: string | null,
  periodEndOn: string | null,
): void {
  if (periodStartOn === null || periodEndOn === null) {
    throw new Error("Expected invoice period.");
  }

  assert.ok(date >= periodStartOn && date <= periodEndOn);
}

function assertDateOutsidePeriod(
  date: string,
  periodStartOn: string | null,
  periodEndOn: string | null,
): void {
  if (periodStartOn === null || periodEndOn === null) {
    throw new Error("Expected invoice period.");
  }

  assert.ok(date < periodStartOn || date > periodEndOn);
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
  dueOn: string;
  installmentAmountMinor: number;
  installmentCardInstrumentId: string | null;
  transactionId: string | null;
  transactionAmountMinor: number | null;
  transactionDescription: string | null;
  transactionOccurredOn: string | null;
  transactionPlannedOn: string | null;
  transactionCardInstrumentId: string | null;
  invoiceId: string | null;
  periodStartOn: string | null;
  periodEndOn: string | null;
}
