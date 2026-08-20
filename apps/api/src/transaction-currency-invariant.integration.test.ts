import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { TransactionError, type TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { buildFinancialSummary } from "./repositories/dashboard.js";
import {
  createTransactionForContext,
  getTransactionForContext,
  updateTransactionForContext,
} from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};
const REFERENCE = new Date("2037-08-20T12:00:00.000Z");

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the integration test.");

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const brlAccount = await createAccountForContext(CONTEXT, {
    name: `Currency invariant BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const usdAccount = await createAccountForContext(CONTEXT, {
    name: `Currency invariant USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const afterAccounts = await buildFinancialSummary(CONTEXT, REFERENCE);

  await assert.rejects(
    () =>
      query(
        `insert into "Transaction"
          ("id", "organizationId", "financialProfileId", "accountId", "kind", "status", "source",
           "amountMinor", "currency", "occurredOn", "plannedOn", "effectiveOn", "description",
           "createdAt", "updatedAt")
         values ($1, $2, $3, $4, 'EXPENSE', 'POSTED', 'MANUAL', $5, 'USD',
                 $6::date, $6::date, $6::date, $7, now(), now())`,
        [
          randomUUID(),
          CONTEXT.organizationId,
          CONTEXT.financialProfileId,
          brlAccount.id,
          88_000,
          "2037-08-10",
          `Direct invalid account currency ${suffix}`,
        ],
      ),
    /TRANSACTION_CURRENCY_MISMATCH/,
  );

  const afterRejectedDirectWrite = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.deepEqual(afterRejectedDirectWrite.currencyBlocks, afterAccounts.currencyBlocks);
  assert.deepEqual(afterRejectedDirectWrite.recentItems, afterAccounts.recentItems);

  await assertRejectsCurrencyMismatch(() =>
    createTransactionForContext(CONTEXT, {
      accountId: brlAccount.id,
      kind: "expense",
      status: "posted",
      amountMinor: 91_000,
      currency: "USD",
      occurredOn: "2037-08-11",
      plannedOn: "2037-08-11",
      effectiveOn: "2037-08-11",
      description: `Invalid account currency ${suffix}`,
    }),
  );

  await assertRejectsCurrencyMismatch(() =>
    createTransactionForContext(CONTEXT, {
      accountId: brlAccount.id,
      destinationAccountId: usdAccount.id,
      kind: "transfer",
      status: "posted",
      amountMinor: 77_000,
      currency: "BRL",
      occurredOn: "2037-08-12",
      plannedOn: "2037-08-12",
      effectiveOn: "2037-08-12",
      description: `Invalid cross currency transfer ${suffix}`,
    }),
  );

  const afterRejectedCreates = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.deepEqual(afterRejectedCreates.currencyBlocks, afterAccounts.currencyBlocks);
  assert.deepEqual(afterRejectedCreates.recentItems, afterAccounts.recentItems);

  const valid = await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 1_234,
    currency: "BRL",
    occurredOn: "2037-08-13",
    plannedOn: "2037-08-13",
    effectiveOn: "2037-08-13",
    description: `Valid BRL before invalid update ${suffix}`,
  });
  const beforeRejectedUpdate = await buildFinancialSummary(CONTEXT, REFERENCE);

  await assertRejectsCurrencyMismatch(() =>
    updateTransactionForContext(CONTEXT, valid.id, { currency: "USD" }),
  );

  const persisted = await getTransactionForContext(CONTEXT, valid.id);
  assert.equal(persisted.accountId, brlAccount.id);
  assert.equal(persisted.currency, "BRL");

  const afterRejectedUpdate = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.deepEqual(afterRejectedUpdate.currencyBlocks, beforeRejectedUpdate.currencyBlocks);
  assert.deepEqual(afterRejectedUpdate.recentItems, beforeRejectedUpdate.recentItems);
}

async function assertRejectsCurrencyMismatch(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof TransactionError &&
      (error as TransactionError).code === "TRANSACTION_CURRENCY_MISMATCH",
  );
}
