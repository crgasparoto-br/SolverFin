import type { TransactionRecord } from "../transactions/types.js";
import type {
  BudgetSummaryReport,
  BudgetTarget,
  CategorySpendingChildReport,
  CategorySpendingReport,
  MonthlyEvolutionReport,
  ReportCategory,
  ReportContext,
  ReportDataSet,
  ReportPeriod,
  ReportsSummary,
  ReportStateKind,
  ReportsViewModel,
} from "./types.js";

const percentPrecision = 100;
const uncategorizedId = "category-uncategorized";

export function buildReportsViewModel(
  dataSet: ReportDataSet | undefined,
  state: ReportStateKind = "ready",
): ReportsViewModel {
  if (dataSet === undefined) {
    return buildUnavailableReports(state);
  }

  const scopedTransactions = filterReportTransactionsByContext(
    dataSet.transactions,
    dataSet.context,
  );
  const scopedBudgets = filterBudgetsByContext(dataSet.budgets, dataSet.context);
  const scopedCategories = filterCategoriesByContext(dataSet.categories, dataSet.context);
  const periodTransactions = filterTransactionsByPeriod(scopedTransactions, dataSet.period);
  const filteredTransactions = applyReportFilters(periodTransactions, dataSet, scopedCategories);
  const periodBudgets = filterBudgetsByPeriod(scopedBudgets, dataSet.period);
  const hasReportData = filteredTransactions.length > 0 || periodBudgets.length > 0;

  if (!hasReportData && state === "ready") {
    return {
      state: "empty",
      title: "Sem dados para o periodo",
      description:
        "Ajuste o periodo ou registre lancamentos e orcamentos para montar os relatorios.",
      context: dataSet.context,
      period: dataSet.period,
      filters: dataSet.filters,
      summary: calculateReportsSummary([]),
      budgetSummary: calculateBudgetSummary([], []),
      categorySpending: [],
      monthlyEvolution: calculateMonthlyEvolution(scopedTransactions),
    };
  }

  const categorySpending = calculateCategorySpending(
    filteredTransactions,
    periodBudgets,
    scopedCategories,
  );

  return {
    state,
    title: "Relatorios e orcamento mensal",
    description: "Compare gastos por categoria, previsto versus realizado e evolucao mensal.",
    context: dataSet.context,
    period: dataSet.period,
    filters: dataSet.filters,
    summary: calculateReportsSummary(filteredTransactions),
    budgetSummary: calculateBudgetSummary(categorySpending, periodBudgets),
    categorySpending,
    monthlyEvolution: calculateMonthlyEvolution(scopedTransactions),
  };
}

export function calculateReportsSummary(
  transactions: readonly TransactionRecord[],
): ReportsSummary {
  const activeTransactions = transactions.filter(
    (transaction) => transaction.status !== "archived",
  );
  const incomeInCents = sumTransactions(activeTransactions, "income");
  const expenseInCents = sumTransactions(activeTransactions, "expense");

  return {
    incomeInCents,
    expenseInCents,
    resultInCents: incomeInCents - expenseInCents,
    filteredTransactionsCount: activeTransactions.length,
  };
}

export function calculateCategorySpending(
  transactions: readonly TransactionRecord[],
  budgets: readonly BudgetTarget[],
  categories: readonly ReportCategory[] = [],
): CategorySpendingReport[] {
  const categoryIndex = buildCategoryIndex(categories);
  const expenseTransactions = transactions.filter(
    (transaction) => transaction.type === "expense" && transaction.status !== "archived",
  );
  const totalExpenses = expenseTransactions.reduce(
    (total, transaction) => total + transaction.amountInCents,
    0,
  );
  const parentReports = new Map<string, CategorySpendingReportDraft>();

  for (const budget of budgets) {
    const parentCategory = resolveTopLevelCategory(budget.categoryId, categoryIndex);
    const parentCategoryId = parentCategory?.id ?? budget.categoryId;
    const parentCategoryName = parentCategory?.name ?? budget.categoryName;
    const childCategory = categoryIndex.get(budget.categoryId);
    const childCategoryName = childCategory?.name ?? budget.categoryName;
    const currentReport = getOrCreateCategoryDraft(
      parentReports,
      parentCategoryId,
      parentCategoryName,
    );
    const childReport = getOrCreateCategoryDraft(
      currentReport.childCategories,
      budget.categoryId,
      childCategoryName,
    );

    currentReport.plannedAmountInCents += budget.plannedAmountInCents;
    childReport.plannedAmountInCents += budget.plannedAmountInCents;
  }

  for (const transaction of expenseTransactions) {
    const category = transaction.categoryId
      ? categoryIndex.get(transaction.categoryId)
      : undefined;
    const parentCategory = transaction.categoryId
      ? resolveTopLevelCategory(transaction.categoryId, categoryIndex)
      : undefined;
    const parentCategoryId = parentCategory?.id ?? transaction.categoryId ?? uncategorizedId;
    const parentCategoryName = parentCategory?.name ?? category?.name ?? "Sem categoria";
    const childCategoryId = transaction.categoryId ?? uncategorizedId;
    const childCategoryName = category?.name ?? "Sem categoria";
    const currentReport = getOrCreateCategoryDraft(
      parentReports,
      parentCategoryId,
      parentCategoryName,
    );
    const childReport = getOrCreateCategoryDraft(
      currentReport.childCategories,
      childCategoryId,
      childCategoryName,
    );

    currentReport.actualAmountInCents += transaction.amountInCents;
    childReport.actualAmountInCents += transaction.amountInCents;
  }

  return [...parentReports.values()]
    .map((report) => buildCategorySpendingReport(report, totalExpenses))
    .sort((current, next) => next.actualAmountInCents - current.actualAmountInCents);
}

export function calculateBudgetSummary(
  categorySpending: readonly CategorySpendingReport[],
  budgets: readonly BudgetTarget[],
): BudgetSummaryReport {
  const plannedAmountInCents = budgets.reduce(
    (total, budget) => total + budget.plannedAmountInCents,
    0,
  );
  const actualAmountInCents = categorySpending.reduce(
    (total, report) => total + report.actualAmountInCents,
    0,
  );

  return {
    plannedAmountInCents,
    actualAmountInCents,
    remainingAmountInCents: plannedAmountInCents - actualAmountInCents,
    spentPercent: calculatePercent(actualAmountInCents, plannedAmountInCents),
    overBudgetCount: categorySpending.filter((report) => report.state === "over-budget").length,
    categoriesCount: categorySpending.length,
  };
}

export function calculateMonthlyEvolution(
  transactions: readonly TransactionRecord[],
): MonthlyEvolutionReport[] {
  const groupedMonths = new Map<string, { incomeInCents: number; expenseInCents: number }>();

  for (const transaction of transactions) {
    if (transaction.status === "archived" || transaction.type === "transfer") {
      continue;
    }

    const month = transaction.date.slice(0, 7);
    const currentMonth = groupedMonths.get(month) ?? { incomeInCents: 0, expenseInCents: 0 };

    if (transaction.type === "income") {
      currentMonth.incomeInCents += transaction.amountInCents;
    } else {
      currentMonth.expenseInCents += transaction.amountInCents;
    }

    groupedMonths.set(month, currentMonth);
  }

  return [...groupedMonths.entries()]
    .map(([month, values]) => ({
      month,
      incomeInCents: values.incomeInCents,
      expenseInCents: values.expenseInCents,
      resultInCents: values.incomeInCents - values.expenseInCents,
    }))
    .sort((current, next) => current.month.localeCompare(next.month));
}

export function filterReportTransactionsByContext(
  transactions: readonly TransactionRecord[],
  context: ReportContext,
): TransactionRecord[] {
  return transactions.filter(
    (transaction) =>
      transaction.tenantId === context.tenantId &&
      transaction.financialProfileId === context.financialProfileId,
  );
}

export function filterBudgetsByContext(
  budgets: readonly BudgetTarget[],
  context: ReportContext,
): BudgetTarget[] {
  return budgets.filter(
    (budget) =>
      budget.tenantId === context.tenantId &&
      budget.financialProfileId === context.financialProfileId,
  );
}

export function filterCategoriesByContext(
  categories: readonly ReportCategory[],
  context: ReportContext,
): ReportCategory[] {
  return categories.filter(
    (category) =>
      category.tenantId === context.tenantId &&
      category.financialProfileId === context.financialProfileId,
  );
}

function applyReportFilters(
  transactions: readonly TransactionRecord[],
  dataSet: ReportDataSet,
  categories: readonly ReportCategory[],
): TransactionRecord[] {
  const categoryFilterIds = dataSet.filters.categoryId
    ? expandCategoryFilter(dataSet.filters.categoryId, categories)
    : undefined;

  return transactions.filter((transaction) => {
    if (
      categoryFilterIds !== undefined &&
      (transaction.categoryId === undefined || !categoryFilterIds.has(transaction.categoryId))
    ) {
      return false;
    }

    if (
      dataSet.filters.accountId !== undefined &&
      transaction.accountId !== dataSet.filters.accountId
    ) {
      return false;
    }

    if (dataSet.filters.type !== undefined && transaction.type !== dataSet.filters.type) {
      return false;
    }

    if (dataSet.filters.status !== undefined && transaction.status !== dataSet.filters.status) {
      return false;
    }

    return true;
  });
}

function filterTransactionsByPeriod(
  transactions: readonly TransactionRecord[],
  period: ReportPeriod,
): TransactionRecord[] {
  return transactions.filter(
    (transaction) => transaction.date >= period.startsOn && transaction.date <= period.endsOn,
  );
}

function filterBudgetsByPeriod(
  budgets: readonly BudgetTarget[],
  period: ReportPeriod,
): BudgetTarget[] {
  return budgets.filter(
    (budget) => budget.startsOn <= period.endsOn && budget.endsOn >= period.startsOn,
  );
}

function buildUnavailableReports(state: ReportStateKind): ReportsViewModel {
  const fallbackContext = {
    tenantId: "tenant-pendente",
    financialProfileId: "profile-pendente",
  };
  const fallbackPeriod = {
    startsOn: "2026-06-01",
    endsOn: "2026-06-30",
    label: "Junho de 2026",
  };

  return {
    state,
    title: state === "error" ? "Nao foi possivel carregar os relatorios" : "Carregando relatorios",
    description:
      state === "error"
        ? "Tente novamente para comparar seus resultados do periodo."
        : "Estamos preparando categorias, orcamentos e evolucao mensal.",
    context: fallbackContext,
    period: fallbackPeriod,
    filters: {},
    summary: calculateReportsSummary([]),
    budgetSummary: calculateBudgetSummary([], []),
    categorySpending: [],
    monthlyEvolution: [],
  };
}

function buildCategorySpendingReport(
  report: CategorySpendingReportDraft,
  totalExpenses: number,
): CategorySpendingReport {
  const remainingAmountInCents = report.plannedAmountInCents - report.actualAmountInCents;
  const childCategories = [...report.childCategories.values()]
    .map((childReport) => buildCategorySpendingChildReport(childReport, totalExpenses))
    .sort((current, next) => next.actualAmountInCents - current.actualAmountInCents);

  return {
    categoryId: report.categoryId,
    categoryName: report.categoryName,
    actualAmountInCents: report.actualAmountInCents,
    plannedAmountInCents: report.plannedAmountInCents,
    remainingAmountInCents,
    spentPercent: calculatePercent(report.actualAmountInCents, report.plannedAmountInCents),
    sharePercent: calculatePercent(report.actualAmountInCents, totalExpenses),
    state: resolveBudgetComparisonState(report.actualAmountInCents, report.plannedAmountInCents),
    childCategories,
  };
}

function buildCategorySpendingChildReport(
  report: CategorySpendingReportDraft,
  totalExpenses: number,
): CategorySpendingChildReport {
  const remainingAmountInCents = report.plannedAmountInCents - report.actualAmountInCents;

  return {
    categoryId: report.categoryId,
    categoryName: report.categoryName,
    actualAmountInCents: report.actualAmountInCents,
    plannedAmountInCents: report.plannedAmountInCents,
    remainingAmountInCents,
    spentPercent: calculatePercent(report.actualAmountInCents, report.plannedAmountInCents),
    sharePercent: calculatePercent(report.actualAmountInCents, totalExpenses),
    state: resolveBudgetComparisonState(report.actualAmountInCents, report.plannedAmountInCents),
  };
}

function getOrCreateCategoryDraft(
  reports: Map<string, CategorySpendingReportDraft>,
  categoryId: string,
  categoryName: string,
): CategorySpendingReportDraft {
  const existingReport = reports.get(categoryId);

  if (existingReport) {
    return existingReport;
  }

  const report = {
    categoryId,
    categoryName,
    actualAmountInCents: 0,
    plannedAmountInCents: 0,
    childCategories: new Map<string, CategorySpendingReportDraft>(),
  };

  reports.set(categoryId, report);
  return report;
}

function buildCategoryIndex(categories: readonly ReportCategory[]): Map<string, ReportCategory> {
  return new Map(categories.map((category) => [category.id, category]));
}

function resolveTopLevelCategory(
  categoryId: string,
  categories: ReadonlyMap<string, ReportCategory>,
): ReportCategory | undefined {
  let currentCategory = categories.get(categoryId);
  const visitedCategoryIds = new Set<string>();

  while (currentCategory?.parentCategoryId) {
    if (visitedCategoryIds.has(currentCategory.id)) {
      return currentCategory;
    }

    visitedCategoryIds.add(currentCategory.id);
    currentCategory = categories.get(currentCategory.parentCategoryId) ?? currentCategory;

    if (!currentCategory.parentCategoryId) {
      return currentCategory;
    }
  }

  return currentCategory;
}

function expandCategoryFilter(
  categoryId: string,
  categories: readonly ReportCategory[],
): Set<string> {
  const selectedCategoryIds = new Set<string>([categoryId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const category of categories) {
      if (
        category.parentCategoryId &&
        selectedCategoryIds.has(category.parentCategoryId) &&
        !selectedCategoryIds.has(category.id)
      ) {
        selectedCategoryIds.add(category.id);
        changed = true;
      }
    }
  }

  return selectedCategoryIds;
}

function resolveBudgetComparisonState(actualAmountInCents: number, plannedAmountInCents: number) {
  if (plannedAmountInCents <= 0 && actualAmountInCents > 0) {
    return "unplanned";
  }

  if (actualAmountInCents === 0) {
    return "no-activity";
  }

  if (actualAmountInCents > plannedAmountInCents) {
    return "over-budget";
  }

  return "within-budget";
}

function sumTransactions(
  transactions: readonly TransactionRecord[],
  type: TransactionRecord["type"],
): number {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amountInCents, 0);
}

function calculatePercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((part / total) * percentPrecision * percentPrecision) / percentPrecision;
}

interface CategorySpendingReportDraft {
  categoryId: string;
  categoryName: string;
  actualAmountInCents: number;
  plannedAmountInCents: number;
  childCategories: Map<string, CategorySpendingReportDraft>;
}
