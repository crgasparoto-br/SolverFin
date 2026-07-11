import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { updateCardPurchaseForContext } from "./repositories/card-invoice-contracts.js";
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
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run the integration database before this test.",
  );

  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao escopo isolado ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    creditLimitMinor: 100_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Cartao principal",
        maskedIdentifier: "**** 4242",
      },
    ],
  });
  const instrument = account.instruments[0];
  assert.ok(instrument);

  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2028-04-08",
    amountMinor: 3_000,
    description: `Recorrencia original ${suffix}`,
    cardId: account.id,
    cardInstrumentId: instrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-06-08", 3);

  const before = await readOccurrences(recurrence.id);
  assert.equal(before.length, 3);
  const selected = before[1];
  assert.ok(selected);

  await updateCardPurchaseForContext(CONTEXT, account.id, selected.transactionId, {
    amountMinor: 4_500,
    occurredOn: "2028-05-09",
    description: `Somente ocorrencia selecionada ${suffix}`,
  });

  const after = await readOccurrences(recurrence.id);
  assert.equal(after.length, 3);

  assertOccurrenceUnchanged(before[0], after[0]);
  assert.equal(after[1]?.transactionId, selected.transactionId);
  assert.equal(after[1]?.transactionAmountMinor, 4_500);
  assert.equal(after[1]?.installmentAmountMinor, 4_500);
  assert.equal(after[1]?.transactionOccurredOn, "2028-05-09");
  assert.equal(after[1]?.installmentDueOn, "2028-05-09");
  assert.equal(after[1]?.transactionDescription, `Somente ocorrencia selecionada ${suffix}`);
  assertOccurrenceUnchanged(before[2], after[2]);

  const recurrenceAfter = await readRecurrence(recurrence.id);
  assert.equal(recurrenceAfter.amountMinor, 3_000);
  assert.equal(recurrenceAfter.description, `Recorrencia original ${suffix}`);
}

function assertOccurrenceUnchanged(
  before: OccurrenceRow | undefined,
  after: OccurrenceRow | undefined,
): void {
  assert.ok(before);
  assert.ok(after);
  assert.deepEqual(after, before);
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
       t."id" as "transactionId",
       i."sequenceNumber",
       t."amountMinor" as "transactionAmountMinor",
       i."amountMinor" as "installmentAmountMinor",
       t."description" as "transactionDescription",
       to_char(t."occurredOn", 'YYYY-MM-DD') as "transactionOccurredOn",
       to_char(i."dueOn", 'YYYY-MM-DD') as "installmentDueOn"
     from "Transaction" t
     join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     where t."organizationId" = $1
       and t."financialProfileId" = $2
       and t."recurrenceId" = $3
     order by i."sequenceNumber" asc`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, recurrenceId],
  );
}

async function readRecurrence(recurrenceId: string): Promise<RecurrenceRow> {
  const rows = await query<RecurrenceRow>(
    `select "amountMinor", "description"
       from "Recurrence"
      where "id" = $1
        and "organizationId" = $2
        and "financialProfileId" = $3`,
    [recurrenceId, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const row = rows[0];
  assert.ok(row);
  return row;
}

interface OccurrenceRow {
  transactionId: string;
  sequenceNumber: number;
  transactionAmountMinor: number;
  installmentAmountMinor: number;
  transactionDescription: string;
  transactionOccurredOn: string;
  installmentDueOn: string;
}

interface RecurrenceRow {
  amountMinor: number;
  description: string;
}
