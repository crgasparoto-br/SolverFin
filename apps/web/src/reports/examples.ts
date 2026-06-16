import { buildReportsViewModel } from "./calculations.js";
import { reportsMockDataSet } from "./mock-data.js";

export const reportsReadyExample = buildReportsViewModel(reportsMockDataSet);
export const reportsLoadingExample = buildReportsViewModel(undefined, "loading");
export const reportsErrorExample = buildReportsViewModel(undefined, "error");
export const reportsEmptyExample = buildReportsViewModel({
  context: reportsMockDataSet.context,
  period: reportsMockDataSet.period,
  filters: reportsMockDataSet.filters,
  transactions: [],
  budgets: [],
});
export const reportsFoodFilterExample = buildReportsViewModel({
  ...reportsMockDataSet,
  filters: {
    ...reportsMockDataSet.filters,
    categoryId: "category-food-demo",
  },
});

export const reportsExpectedTotals = {
  incomeInCents: 620000,
  expenseInCents: 337750,
  resultInCents: 282250,
  filteredTransactionsCount: 5,
  plannedAmountInCents: 380000,
  remainingAmountInCents: 42250,
  spentPercent: 88.88,
  overBudgetCount: 1,
  categorySpendingCount: 4,
  monthlyEvolutionCount: 3,
  foodFilterExpenseInCents: 95000,
} as const;

export function isReportsMockConsistent(): boolean {
  return (
    reportsReadyExample.summary.incomeInCents === reportsExpectedTotals.incomeInCents &&
    reportsReadyExample.summary.expenseInCents === reportsExpectedTotals.expenseInCents &&
    reportsReadyExample.summary.resultInCents === reportsExpectedTotals.resultInCents &&
    reportsReadyExample.summary.filteredTransactionsCount ===
      reportsExpectedTotals.filteredTransactionsCount &&
    reportsReadyExample.budgetSummary.plannedAmountInCents ===
      reportsExpectedTotals.plannedAmountInCents &&
    reportsReadyExample.budgetSummary.remainingAmountInCents ===
      reportsExpectedTotals.remainingAmountInCents &&
    reportsReadyExample.budgetSummary.spentPercent === reportsExpectedTotals.spentPercent &&
    reportsReadyExample.budgetSummary.overBudgetCount === reportsExpectedTotals.overBudgetCount &&
    reportsReadyExample.categorySpending.length === reportsExpectedTotals.categorySpendingCount &&
    reportsReadyExample.monthlyEvolution.length === reportsExpectedTotals.monthlyEvolutionCount &&
    reportsFoodFilterExample.summary.expenseInCents ===
      reportsExpectedTotals.foodFilterExpenseInCents &&
    reportsEmptyExample.state === "empty" &&
    reportsLoadingExample.state === "loading" &&
    reportsErrorExample.state === "error"
  );
}
