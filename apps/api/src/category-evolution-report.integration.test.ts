import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import {
  buildCategoryEvolutionReportForContext,
  parseCategoryEvolutionFilters,
} from "./category-evolution-report.js";
import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { archiveCategoryForContext, createCategoryForContext } from "./repositories/categories.js";
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
  const brlAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta relatório BRL issue 542 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const usdAccount = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta relatório USD issue 542 ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const incomeRoot = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Receitas issue 542 ${suffix}`,
    kind: "income",
  });
  const incomeChild = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Projetos issue 542 ${suffix}`,
    kind: "income",
    parentCategoryId: incomeRoot.id,
  });
  const expenseCategory = await createCategoryForContext(PERSONAL_CONTEXT, {
    name: `Moradia issue 542 ${suffix}`,
    kind: "expense",
  });

  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: brlAccount.id,
    categoryId: incomeChild.id,
    kind: "income",
    status: "posted",
    amountMinor: 10_000,
    occurredOn: "2031-01-15",
    plannedOn: "2031-01-15",
    description: `Receita realizada issue 542 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: brlAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 5_000,
    occurredOn: "2031-02-10",
    plannedOn: "2031-02-10",
    description: `Receita sem categoria issue 542 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: brlAccount.id,
    categoryId: expenseCategory.id,
    kind: "expense",
    status: "reconciled",
    amountMinor: 4_000,
    occurredOn: "2031-01-20",
    plannedOn: "2031-01-20",
    description: `Despesa conciliada issue 542 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: brlAccount.id,
    categoryId: incomeChild.id,
    kind: "income",
    status: "planned",
    amountMinor: 99_000,
    occurredOn: "2031-01-25",
    plannedOn: "2031-01-25",
    description: `Receita planejada ignorada issue 542 ${suffix}`,
  });
  await createTransactionForContext(PERSONAL_CONTEXT, {
    accountId: usdAccount.id,
    categoryId: incomeChild.id,
    kind: "income",
    status: "posted",
    amountMinor: 2_000,
    currency: "USD",
    occurredOn: "2031-02-05",
    plannedOn: "2031-02-05",
    description: `Receita USD issue 542 ${suffix}`,
  });
  await archiveCategoryForContext(PERSONAL_CONTEXT, expenseCategory.id);

  const filters = parseCategoryEvolutionFilters(
    new URLSearchParams({ interval: "monthly", start: "2031-01", periods: "2" }),
  );
  const report = await buildCategoryEvolutionReportForContext(PERSONAL_CONTEXT, filters);

  assert.deepEqual(
    report.currencyBlocks.map((block) => block.currency),
    ["BRL", "USD"],
  );

  const brl = report.currencyBlocks[0];
  assert.ok(brl);
  assert.deepEqual(
    brl.income.cells.map((cell) => cell.amountMinor),
    [10_000, 5_000],
  );
  assert.deepEqual(
    brl.expense.cells.map((cell) => cell.amountMinor),
    [4_000, 0],
  );
  assert.deepEqual(
    brl.result.cells.map((cell) => cell.amountMinor),
    [6_000, 5_000],
  );
  assert.equal(brl.income.totalMinor, 15_000);
  assert.equal(brl.incomeCategories[0]?.categoryId, incomeRoot.id);
  assert.equal(brl.incomeCategories[0]?.children[0]?.categoryId, incomeChild.id);
  assert.equal(brl.expenseCategories[0]?.categoryId, expenseCategory.id);
  assert.equal(brl.expenseCategories[0]?.status, "archived");
  assert.equal(
    brl.incomeCategories.some((category) => category.name === "Sem categoria"),
    true,
  );

  const usd = report.currencyBlocks[1];
  assert.ok(usd);
  assert.equal(usd.income.totalMinor, 2_000);
  assert.equal(usd.expense.totalMinor, 0);
  assert.equal(usd.result.totalMinor, 2_000);
}
