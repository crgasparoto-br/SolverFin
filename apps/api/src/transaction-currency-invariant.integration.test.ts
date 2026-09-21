import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { TransactionError, type TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { buildFinancialSummary } from "./repositories/dashboard.js";
import {
  createTransactionForContext,
  getTransactionForContext,
  listTransactionsForContext,
  updateTransactionForContext,
  voidTransactionForContext,
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
    name: `Cross currency BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const brlDestination = await createAccountForContext(CONTEXT, {
    name: `Same currency BRL ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 0,
  });
  const usdAccount = await createAccountForContext(CONTEXT, {
    name: `Cross currency USD ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });

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

  await assert.rejects(
    () =>
      query(
        `insert into "Transaction"
          ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
           "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
           "effectiveOn", "description", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, 'TRANSFER', 'POSTED', 'MANUAL', 53832, 'BRL',
                 '2037-08-10', '2037-08-10', '2037-08-10', $6, now(), now())`,
        [
          randomUUID(),
          CONTEXT.organizationId,
          CONTEXT.financialProfileId,
          brlAccount.id,
          usdAccount.id,
          `Direct cross currency without destination amount ${suffix}`,
        ],
      ),
    /TRANSACTION_DESTINATION_AMOUNT_REQUIRED/,
  );

  await assertRejects("TRANSACTION_CURRENCY_MISMATCH", () =>
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

  await assertRejects("TRANSACTION_DESTINATION_AMOUNT_REQUIRED", () =>
    createTransactionForContext(CONTEXT, {
      accountId: brlAccount.id,
      destinationAccountId: usdAccount.id,
      kind: "transfer",
      status: "planned",
      amountMinor: 53_832,
      currency: "BRL",
      occurredOn: "2037-08-12",
      plannedOn: "2037-08-12",
      description: `Missing destination amount ${suffix}`,
    }),
  );

  const sameCurrency = await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    destinationAccountId: brlDestination.id,
    kind: "transfer",
    status: "planned",
    amountMinor: 4_200,
    currency: "BRL",
    occurredOn: "2037-08-12",
    plannedOn: "2037-08-12",
    description: `Same currency transfer ${suffix}`,
  });
  assert.equal(sameCurrency.destinationAmountMinor, 4_200);
  assert.equal(sameCurrency.destinationCurrency, "BRL");

  const baseline = await buildFinancialSummary(CONTEXT, REFERENCE);
  const planned = await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    destinationAccountId: usdAccount.id,
    kind: "transfer",
    status: "planned",
    amountMinor: 53_832,
    destinationAmountMinor: 10_000,
    currency: "BRL",
    occurredOn: "2037-08-14",
    plannedOn: "2037-08-14",
    description: `538.32 BRL to 100 USD ${suffix}`,
  });

  assert.equal(planned.currency, "BRL");
  assert.equal(planned.amountMinor, 53_832);
  assert.equal(planned.destinationCurrency, "USD");
  assert.equal(planned.destinationAmountMinor, 10_000);

  const reread = await getTransactionForContext(CONTEXT, planned.id);
  assert.equal(reread.id, planned.id);
  assert.equal(reread.destinationAmountMinor, 10_000);
  assert.equal(reread.destinationCurrency, "USD");

  const [sourceStatement, destinationStatement] = await Promise.all([
    listTransactionsForContext(CONTEXT, { accountId: brlAccount.id }),
    listTransactionsForContext(CONTEXT, { accountId: usdAccount.id }),
  ]);
  const sourceView = sourceStatement.find((transaction) => transaction.id === planned.id);
  const destinationView = destinationStatement.find(
    (transaction) => transaction.id === planned.id,
  );
  assert.ok(sourceView, "Source account statement must expose the transfer.");
  assert.ok(
    destinationView,
    "Destination account statement must expose the same transfer identity.",
  );
  assert.equal(sourceView.id, destinationView.id);
  assert.equal(sourceView.amountMinor, 53_832);
  assert.equal(sourceView.currency, "BRL");
  assert.equal(destinationView.destinationAmountMinor, 10_000);
  assert.equal(destinationView.destinationCurrency, "USD");

  const beforePosting = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.equal(
    block(beforePosting, "BRL").availableBalanceMinor,
    block(baseline, "BRL").availableBalanceMinor,
  );
  assert.equal(
    block(beforePosting, "USD").availableBalanceMinor,
    block(baseline, "USD").availableBalanceMinor,
  );

  await updateTransactionForContext(CONTEXT, planned.id, { status: "posted" });
  const posted = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.equal(
    block(posted, "BRL").availableBalanceMinor -
      block(baseline, "BRL").availableBalanceMinor,
    -53_832,
  );
  assert.equal(
    block(posted, "USD").availableBalanceMinor -
      block(baseline, "USD").availableBalanceMinor,
    10_000,
  );
  assert.equal(block(posted, "BRL").incomeMinor, block(baseline, "BRL").incomeMinor);
  assert.equal(block(posted, "BRL").expensesMinor, block(baseline, "BRL").expensesMinor);
  assert.equal(block(posted, "USD").incomeMinor, block(baseline, "USD").incomeMinor);
  assert.equal(block(posted, "USD").expensesMinor, block(baseline, "USD").expensesMinor);

  const edited = await updateTransactionForContext(CONTEXT, planned.id, {
    amountMinor: 60_000,
    destinationAmountMinor: 12_000,
  });
  assert.equal(edited.id, planned.id);
  assert.equal(edited.amountMinor, 60_000);
  assert.equal(edited.destinationAmountMinor, 12_000);

  const afterEdit = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.equal(
    block(afterEdit, "BRL").availableBalanceMinor -
      block(baseline, "BRL").availableBalanceMinor,
    -60_000,
  );
  assert.equal(
    block(afterEdit, "USD").availableBalanceMinor -
      block(baseline, "USD").availableBalanceMinor,
    12_000,
  );

  await voidTransactionForContext(CONTEXT, planned.id);
  const afterVoid = await buildFinancialSummary(CONTEXT, REFERENCE);
  assert.equal(
    block(afterVoid, "BRL").availableBalanceMinor,
    block(baseline, "BRL").availableBalanceMinor,
  );
  assert.equal(
    block(afterVoid, "USD").availableBalanceMinor,
    block(baseline, "USD").availableBalanceMinor,
  );
}

function block(summary: Awaited<ReturnType<typeof buildFinancialSummary>>, currency: string) {
  const value = summary.currencyBlocks.find((item) => item.currency === currency);
  assert.ok(value, `Expected ${currency} currency block`);
  return value;
}

async function assertRejects(
  code: TransactionError["code"],
  action: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) => error instanceof TransactionError && error.code === code,
  );
}
