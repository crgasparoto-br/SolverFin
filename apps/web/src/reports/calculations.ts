import type { TransactionRecord } from "../transactions/types.js";
import type {
  BudgetSummaryReport,
  BudgetTarget,
  CategorySpendingReport,
  MonthlyEvolutionReport,
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
  const periodTransactions = filterTransactionsByPeriod(scopedTransactions, dataSet.period);
  const filteredTransactions = applyReportFilters(periodTransactions, dataSet);
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

  const categorySpending = calculateCategorySpending(filteredTransactions, periodBudgets);

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
): CategorySpendingReport[] {
  const expenseTransactions = transactions.filter(
    (transaction) => transaction.type === "expense" && transaction.status !== "archived",
  );
  const totalExpenses = expenseTransactions.reduce(
    (total, transaction) => total + transaction.amountInCents,
    0,
  );
  const categoryReports = new Map<string, CategorySpendingReportDraft>();

  for (const budget of budgets) {
    categoryReports.set(budget.categoryId, {
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      actualAmountInCents: 0,
      plannedAmountInCents: budget.plannedAmountInCents,
    });
  }

  for (const transaction of expenseTransactions) {
    const categoryId = transaction.categoryId ?? uncategorizedId;
    const currentReport = categoryReports.get(categoryId) ?? {
      categoryId,
      categoryName: "Sem categoria",
      actualAmountInCents: 0,
      plannedAmountInCents: 0,
    };

    currentReport.actualAmountInCents += transaction.amountInCents;
    categoryReports.set(categoryId, currentReport);
  }

  return [...categoryReports.values()]
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

function applyReportFilters(
  transactions: readonly TransactionRecord[],
  dataSet: ReportDataSet,
): TransactionRecord[] {
  return transactions.filter((transaction) => {
    if (
      dataSet.filters.categoryId !== undefined &&
      transaction.categoryId !== dataSet.filters.categoryId
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
}
