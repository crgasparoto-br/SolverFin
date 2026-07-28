import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import {
  buildCategoryEvolutionReportForAccountContext,
  CategoryEvolutionAccountNotAvailableError,
} from "./category-evolution-account-filter.js";
import { parseCategoryEvolutionFilters } from "./category-evolution-report.js";
import { closePool } from "./db.js";
import { archiveAccountForContext, createAccountForContext } from "./repositories/accounts.js";
import { createCategoryForContext } from "./repositories/categories.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const PERSONAL_CONTEXT: TenantContext = {
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

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const selectedAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta selecionada issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const otherAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Outra conta issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const emptyAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta sem movimento issue 546 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const incomeCategory = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Receita filtrada issue 546 ${suffix}`,
    kind: "income",
  });
  const expenseCategory = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Despesa filtrada issue 546 ${suffix}`,
    kind: "expense",
  });

  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: selectedAccount.id,
    categoryId: incomeCategory.id,
    kind: "income",
    status: "posted",
    amountMinor: 12_000,
    occurredOn: "2032-03-10",
    plannedOn: "2032-03-10",
    description: `Receita conta selecionada issue 546 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: selectedAccount.id,
    categoryId: expenseCategory.id,
    kind: "expense",
    status: "reconciled",
    amountMinor: 3_000,
    occurredOn: "2032-03-11",
    plannedOn: "2032-03-11",
    description: `Despesa conta selecionada issue 546 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: otherAccount.id,
    categoryId: incomeCategory.id,
    kind: "income",
    status: "posted",
    amountMinor: 8_000,
    occurredOn: "2032-03-12",
    plannedOn: "2032-03-12",
    description: `Receita outra conta issue 546 ${suffix}`,
  });

  const filters = parseCategoryEvolutionFilters(
    new URLSearchParams({ interval: "monthly", start: "2032-03", periods: "1" }),
  );

  const allAccounts = await buildCategoryEvolutionReportForAccountContext(
    PERSONAL_CONTEXT,
    filters,
    undefined,
  );
  assert.equal(allAccounts.currencyBlocks[0]?.income.totalMinor, 20_000);
  assert.equal(allAccounts.currencyBlocks[0]?.expense.totalMinor, 3_000);

  const selected = await buildCategoryEvolutionReportForAccountContext(
    PERSONAL_CONTEXT,
    filters,
    selectedAccount.id,
  );
  assert.equal(selected.currencyBlocks[0]?.income.totalMinor, 12_000);
  assert.equal(selected.currencyBlocks[0]?.expense.totalMinor, 3_000);
  assert.equal(selected.currencyBlocks[0]?.result.totalMinor, 9_000);

  const empty = await buildCategoryEvolutionReportForAccountContext(
    PERSONAL_CONTEXT,
    filters,
    emptyAccount.id,
  );
  assert.deepEqual(empty.currencyBlocks, []);

  await archiveAccountForContext(PERSONAL_CONTEXT, selectedAccount.id);
  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForAccountContext(
        PERSONAL_CONTEXT,
        filters,
        selectedAccount.id,
      ),
    (error: unknown) =>
      error instanceof CategoryEvolutionAccountNotAvailableError && error.statusCode === 404,
  );

  await assert.rejects(
    () =>
      buildCategoryEvolutionReportForAccountContext(
        PERSONAL_CONTEXT,
        filters,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    (error: unknown) =>
      error instanceof CategoryEvolutionAccountNotAvailableError && error.statusCode === 404,
  );
}
