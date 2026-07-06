import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
  const initialCategory = await createExpenseCategory(
    `Categoria inicial futuras ${suffix}`,
  );
  const updatedCategory = await createExpenseCategory(
    `Categoria atualizada futuras ${suffix}`,
  );
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao categoria data ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 80_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Fisico categoria data",
        maskedIdentifier: "**** 9393",
      },
    ],
  });
  const physicalInstrument = requireInstrument(account.instruments, "physical");
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2027-11-05",
    amountMinor: 1_111,
    description: `Recorrencia categoria data ${suffix}`,
    cardId: account.id,
    cardInstrumentId: physicalInstrument.id,
    categoryId: initialCategory.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2027-11-05", 1);

  const occurrences = await readOccurrences(recurrence.id);
  assert.equal(occurrences.length, 1);

  const original = requireOnlyOccurrence(occurrences);
  assert.equal(original.dueOn, "2027-11-05");
  assert.equal(original.transactionOccurredOn, "2027-11-05");
  assert.equal(original.transactionPlannedOn, "2027-11-05");
  assert.equal(original.transactionCategoryId, initialCategory.id);
  assert.notEqual(original.invoiceId, null);
  assertDateWithinPeriod("2027-11-10", original.periodStartOn, original.periodEndOn);

  const update = await updateRecurrenceForContext(CONTEXT, recurrence.id, {
    editScope: "recurrence_and_future_pending",
    startOn: "2027-11-10",
    amountMinor: 3_333,
    description: `Recorrencia categoria data atualizada ${suffix}`,
    categoryId: updatedCategory.id,
  });

  assert.equal(update.futurePendingUpdate?.updatedCount, 1);
  assert.equal(update.futurePendingUpdate?.skippedCount, 0);
  assert.deepEqual(update.futurePendingUpdate?.skipped, []);

  const refreshed = await readOccurrences(recurrence.id);
  assert.equal(refreshed.length, 1);

  const occurrence = requireOnlyOccurrence(refreshed);
  assert.equal(occurrence.installmentId, original.installmentId);
  assert.equal(occurrence.transactionId, original.transactionId);
  assert.equal(occurrence.invoiceId, original.invoiceId);
  assert.equal(occurrence.dueOn, "2027-11-10");
  assert.equal(occurrence.installmentAmountMinor, 3_333);
  assert.equal(occurrence.transactionOccurredOn, "2027-11-10");
  assert.equal(occurrence.transactionPlannedOn, "2027-11-10");
  assert.equal(occurrence.transactionAmountMinor, 3_333);
  assert.equal(
    occurrence.transactionDescription,
    `Recorrencia categoria data atualizada ${suffix}`,
  );
  assert.equal(occurrence.transactionCategoryId, updatedCategory.id);
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
        i."id" as "installmentId",
        i."sequenceNumber",
        to_char(i."dueOn", 'YYYY-MM-DD') as "dueOn",
        i."amountMinor" as "installmentAmountMinor",
        t."id" as "transactionId",
        t."categoryId" as "transactionCategoryId",
        t."amountMinor" as "transactionAmountMinor",
        t."description" as "transactionDescription",
        to_char(t."occurredOn", 'YYYY-MM-DD') as "transactionOccurredOn",
        to_char(t."plannedOn", 'YYYY-MM-DD') as "transactionPlannedOn",
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

async function createExpenseCategory(name: string): Promise<ApiCategory> {
  const category = {
    id: randomUUID(),
    name,
  };

  await query(
    `insert into "Category"
       ("id", "organizationId", "financialProfileId", "name", "kind", "status", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, 'EXPENSE', 'ACTIVE', now(), now(), $5, $5)`,
    [
      category.id,
      CONTEXT.organizationId,
      CONTEXT.financialProfileId,
      category.name,
      CONTEXT.userId,
    ],
  );

  return category;
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

interface ApiCategory {
  id: string;
  name: string;
}

interface OccurrenceRow {
  installmentId: string;
  sequenceNumber: number;
  dueOn: string;
  installmentAmountMinor: number;
  transactionId: string | null;
  transactionCategoryId: string | null;
  transactionAmountMinor: number | null;
  transactionDescription: string | null;
  transactionOccurredOn: string | null;
  transactionPlannedOn: string | null;
  invoiceId: string | null;
  periodStartOn: string | null;
  periodEndOn: string | null;
}
