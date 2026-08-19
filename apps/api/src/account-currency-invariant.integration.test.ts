import assert from "node:assert/strict";

import { AccountError, type TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  createAccountForContext,
  getAccountForContext,
  updateAccountForContext,
} from "./repositories/accounts.js";
import { buildFinancialSummary } from "./repositories/dashboard.js";
import { createTransactionForContext } from "./repositories/transactions.js";

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
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the integration test.");

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const account = await createAccountForContext(CONTEXT, {
    name: `Account currency lock ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  let transactionId: string | undefined;

  try {
    const transaction = await createTransactionForContext(CONTEXT, {
      accountId: account.id,
      kind: "expense",
      status: "posted",
      amountMinor: 4_321,
      currency: "BRL",
      occurredOn: "2037-08-14",
      plannedOn: "2037-08-14",
      effectiveOn: "2037-08-14",
      description: `Account currency invariant ${suffix}`,
    });
    transactionId = transaction.id;

    const beforeRejectedChanges = await buildFinancialSummary(CONTEXT, REFERENCE);

    await assert.rejects(
      () => updateAccountForContext(CONTEXT, account.id, { currency: "USD" }),
      (error: unknown) => error instanceof AccountError && error.code === "ACCOUNT_CURRENCY_LOCKED",
    );

    await assert.rejects(
      () =>
        query(
          `update "Account"
              set "currency" = 'USD', "updatedAt" = now()
            where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
          [account.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
        ),
      /TRANSACTION_CURRENCY_MISMATCH/,
    );

    const persisted = await getAccountForContext(CONTEXT, account.id);
    assert.equal(persisted.currency, "BRL");

    const afterRejectedChanges = await buildFinancialSummary(CONTEXT, REFERENCE);
    assert.deepEqual(afterRejectedChanges.currencyBlocks, beforeRejectedChanges.currencyBlocks);
    assert.deepEqual(afterRejectedChanges.recentItems, beforeRejectedChanges.recentItems);
  } finally {
    if (transactionId) {
      await query(`delete from "Transaction" where "id" = $1`, [transactionId]);
    }
    await query(`delete from "Account" where "id" = $1`, [account.id]);
  }
}
