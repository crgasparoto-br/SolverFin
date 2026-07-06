import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
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
    name: `Cartao materializacao recorrencia ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 100_000,
    instruments: [
      {
        type: "virtual",
        holder: "primary",
        name: "Virtual materializacao",
        maskedIdentifier: "**** 1212",
      },
    ],
  });
  const instrument = requireInstrument(account.instruments, "virtual");
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2028-06-08",
    amountMinor: 4_200,
    description: `Recorrencia materializada ${suffix}`,
    cardId: account.id,
    cardInstrumentId: instrument.id,
  });

  const generated = await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-08-08", 3);

  assert.equal(generated.installments.length, 3);
  assert.equal(generated.transactions.length, 3);

  const rows = await readOccurrences(recurrence.id);
  assert.equal(rows.length, 3);

  for (const row of rows) {
    assert.equal(row.organizationId, CONTEXT.organizationId);
    assert.equal(row.financialProfileId, CONTEXT.financialProfileId);
    assert.equal(row.accountId, null);
    assert.equal(row.cardId, account.id);
    assert.equal(row.installmentCardId, account.id);
    assert.equal(row.recurrenceId, recurrence.id);
    assert.equal(row.transactionRecurrenceId, recurrence.id);
    assert.equal(row.installmentId, row.transactionInstallmentId);
    assert.equal(row.invoiceId !== null, true);
    assert.equal(row.kind, "EXPENSE");
    assert.equal(row.source, "RECURRENCE");
    assert.equal(row.transactionCardInstrumentId, instrument.id);
    assert.equal(row.installmentCardInstrumentId, instrument.id);
    assert.equal(row.transactionAmountMinor, 4_200);
    assert.equal(row.installmentAmountMinor, 4_200);
    assert.equal(row.transactionDescription, `Recorrencia materializada ${suffix}`);
    assert.equal(row.transactionOccurredOn, row.installmentDueOn);
    assert.equal(row.transactionPlannedOn, row.installmentDueOn);
  }

  assert.deepEqual(
    rows.map((row) => row.sequenceNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    rows.map((row) => row.installmentDueOn),
    ["2028-06-08", "2028-07-08", "2028-08-08"],
  );
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
        i."organizationId",
        i."financialProfileId",
        i."id" as "installmentId",
        i."recurrenceId",
        i."cardId" as "installmentCardId",
        i."cardInstrumentId" as "installmentCardInstrumentId",
        i."sequenceNumber",
        i."amountMinor" as "installmentAmountMinor",
        to_char(i."dueOn", 'YYYY-MM-DD') as "installmentDueOn",
        t."id" as "transactionId",
        t."accountId",
        t."cardId",
        t."invoiceId",
        t."recurrenceId" as "transactionRecurrenceId",
        t."installmentId" as "transactionInstallmentId",
        t."cardInstrumentId" as "transactionCardInstrumentId",
        t."kind",
        t."source",
        t."amountMinor" as "transactionAmountMinor",
        t."description" as "transactionDescription",
        to_char(t."occurredOn", 'YYYY-MM-DD') as "transactionOccurredOn",
        to_char(t."plannedOn", 'YYYY-MM-DD') as "transactionPlannedOn"
       from "Installment" i
       join "Transaction" t on t."installmentId" = i."id"
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
  organizationId: string;
  financialProfileId: string;
  installmentId: string;
  recurrenceId: string;
  installmentCardId: string | null;
  installmentCardInstrumentId: string | null;
  sequenceNumber: number;
  installmentAmountMinor: number;
  installmentDueOn: string;
  transactionId: string;
  accountId: string | null;
  cardId: string | null;
  invoiceId: string | null;
  transactionRecurrenceId: string | null;
  transactionInstallmentId: string | null;
  transactionCardInstrumentId: string | null;
  kind: string;
  source: string;
  transactionAmountMinor: number;
  transactionDescription: string;
  transactionOccurredOn: string;
  transactionPlannedOn: string;
}
