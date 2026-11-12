import type { TransactionFilters, TransactionRecord } from "../transactions/types.js";

export type ReportStateKind = "loading" | "empty" | "error" | "ready";
export type BudgetComparisonState = "within-budget" | "over-budget" | "unplanned" | "no-activity";

export interface ReportContext {
  tenantId: string;
  financialProfileId: string;
}

export interface ReportPeriod {
  startsOn: string;
  endsOn: string;
  label: string;
}

export interface ReportCategory {
  id: string;
  tenantId: string;
  financialProfileId: string;
  name: string;
  type: "income" | "expense" | "transfer";
  status: "active" | "archived";
  parentCategoryId?: string;
}

export interface BudgetTarget {
  id: string;
  tenantId: string;
  financialProfileId: string;
  categoryId: string;
  categoryName: string;
  startsOn: string;
  endsOn: string;
  plannedAmountInCents: number;
}

export interface ReportDataSet {
  context: ReportContext;
  period: ReportPeriod;
  filters: TransactionFilters;
  transactions: readonly TransactionRecord[];
  budgets: readonly BudgetTarget[];
  categories: readonly ReportCategory[];
}

export interface CategorySpendingChildReport {
  categoryId: string;
  categoryName: string;
  actualAmountInCents: number;
  plannedAmountInCents: number;
  remainingAmountInCents: number;
  spentPercent: number;
  sharePercent: number;
  state: BudgetComparisonState;
}

export interface CategorySpendingReport {
  categoryId: string;
  categoryName: string;
  actualAmountInCents: number;
  plannedAmountInCents: number;
  remainingAmountInCents: number;
  spentPercent: number;
  sharePercent: number;
  state: BudgetComparisonState;
  childCategories: readonly CategorySpendingChildReport[];
}

export interface MonthlyEvolutionReport {
  month: string;
  incomeInCents: number;
  expenseInCents: number;
  resultInCents: number;
}

export interface BudgetSummaryReport {
  plannedAmountInCents: number;
  actualAmountInCents: number;
  remainingAmountInCents: number;
  spentPercent: number;
  overBudgetCount: number;
  categoriesCount: number;
}

export interface ReportsSummary {
  incomeInCents: number;
  expenseInCents: number;
  resultInCents: number;
  filteredTransactionsCount: number;
}

export interface ReportsViewModel {
  state: ReportStateKind;
  title: string;
  description: string;
  context: ReportContext;
  period: ReportPeriod;
  filters: TransactionFilters;
  summary: ReportsSummary;
  budgetSummary: BudgetSummaryReport;
  categorySpending: readonly CategorySpendingReport[];
  monthlyEvolution: readonly MonthlyEvolutionReport[];
}
