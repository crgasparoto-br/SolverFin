import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  createTransactionForContext,
  updateTransactionForContext,
} from "./repositories/transactions.js";

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
  const account = await createAccountForContext(CONTEXT, {
    name: `Conta fluxo generico ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const created = await createTransactionForContext(CONTEXT, {
    kind: "expense",
    amountMinor: 1_250,
    occurredOn: "2028-05-10",
    accountId: account.id,
    description: `Lancamento generico original ${suffix}`,
    status: "posted",
    source: "manual",
  });

  assert.equal(created.accountId, account.id);
  assert.equal(created.cardId, undefined);
  assert.equal(created.invoiceId, undefined);
  assert.equal(created.recurrenceId, undefined);
  assert.equal(created.installmentId, undefined);

  const updated = await updateTransactionForContext(CONTEXT, created.id, {
    amountMinor: 1_875,
    occurredOn: "2028-05-11",
    plannedOn: "2028-05-12",
    description: `Lancamento generico editado ${suffix}`,
    status: "planned",
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.accountId, account.id);
  assert.equal(updated.cardId, undefined);
  assert.equal(updated.invoiceId, undefined);
  assert.equal(updated.recurrenceId, undefined);
  assert.equal(updated.installmentId, undefined);
  assert.equal(updated.amountMinor, 1_875);
  assert.equal(updated.status, "planned");
  assert.equal(updated.occurredOn, "2028-05-12");
  assert.equal(updated.plannedOn, "2028-05-12");
  assert.equal(updated.description, `Lancamento generico editado ${suffix}`);

  const row = await readTransaction(created.id);
  assert.equal(row.accountId, account.id);
  assert.equal(row.cardId, null);
  assert.equal(row.invoiceId, null);
  assert.equal(row.recurrenceId, null);
  assert.equal(row.installmentId, null);
  assert.equal(row.amountMinor, 1_875);
  assert.equal(row.status, "PLANNED");
  assert.equal(row.occurredOn, "2028-05-12");
  assert.equal(row.plannedOn, "2028-05-12");
  assert.equal(row.description, `Lancamento generico editado ${suffix}`);
}

async function readTransaction(transactionId: string): Promise<TransactionRow> {
  const rows = await query<TransactionRow>(
    `select
        "accountId",
        "cardId",
        "invoiceId",
        "recurrenceId",
        "installmentId",
        "amountMinor",
        "status",
        to_char("occurredOn", 'YYYY-MM-DD') as "occurredOn",
        to_char("plannedOn", 'YYYY-MM-DD') as "plannedOn",
        "description"
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

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface TransactionRow {
  accountId: string | null;
  cardId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  amountMinor: number;
  status: string;
  occurredOn: string;
  plannedOn: string;
  description: string;
}
