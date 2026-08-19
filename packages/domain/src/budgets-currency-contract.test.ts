import assert from "node:assert/strict";

import type { Budget, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { summarizeBudgetDashboard, summarizeBudgetUsage } from "./budgets.js";

const context: TenantContext = {
  organizationId: "org-budget-currency",
  financialProfileId: "profile-budget-currency",
  financialProfileKind: "personal",
  userId: "user-budget-currency",
};
const now = "2026-08-18T12:00:00.000Z";
const periodStartOn = "2026-08-01";
const periodEndOn = "2026-08-31";

usageIgnoresSameCategoryAmountsFromAnotherCurrency();
dashboardKeepsBudgetedAndUnbudgetedAmountsSeparatedByCurrency();

function usageIgnoresSameCategoryAmountsFromAnotherCurrency(): void {
  const budget = createBudget("budget-brl", "food", "BRL", 10_000);
  const summary = summarizeBudgetUsage({
    context,
    budget,
    transactions: [
      createExpense("brl-food", "food", "BRL", 2_500),
      createExpense("usd-food", "food", "USD", 91_000),
    ],
  });

  assert.equal(summary.currency, "BRL");
  assert.equal(summary.actualAmountMinor, 2_500);
  assert.equal(summary.remainingAmountMinor, 7_500);
}

function dashboardKeepsBudgetedAndUnbudgetedAmountsSeparatedByCurrency(): void {
  const summaries = summarizeBudgetDashboard({
    context,
    budgets: [
      createBudget("budget-brl", "food", "BRL", 10_000),
      createBudget("budget-usd", "food", "USD", 20_000),
    ],
    transactions: [
      createExpense("brl-food", "food", "BRL", 2_500),
      createExpense("usd-food", "food", "USD", 4_000),
      createExpense("brl-transport", "transport", "BRL", 1_100),
      createExpense("usd-transport", "transport", "USD", 2_200),
    ],
    periodStartOn,
    periodEndOn,
  });

  assert.deepEqual(
    summaries.map((summary) => [summary.currency, summary.categoryId, summary.actualAmountMinor]),
    [
      ["BRL", "food", 2_500],
      ["BRL", "transport", 1_100],
      ["USD", "food", 4_000],
      ["USD", "transport", 2_200],
    ],
  );
}

function createBudget(
  id: string,
  categoryId: string,
  currency: string,
  plannedAmountMinor: number,
): Budget {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    categoryId,
    status: "active",
    periodStartOn,
    periodEndOn,
    plannedAmountMinor,
    currency,
    createdAt: now,
    updatedAt: now,
  };
}

function createExpense(
  id: string,
  categoryId: string,
  currency: string,
  amountMinor: number,
): Transaction {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor,
    currency,
    occurredOn: "2026-08-10",
    plannedOn: "2026-08-10",
    description: `Expense ${id}`,
    categoryId,
    accountId: `account-${currency.toLowerCase()}`,
    createdAt: now,
    updatedAt: now,
  };
}
