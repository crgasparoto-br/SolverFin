export interface ReportAnalysisPeriod {
  label: string;
  accessibleLabel: string;
}

export interface ReportAnalysisCell {
  amountMinor: number;
}

export interface ReportAnalysisSeries {
  cells: readonly ReportAnalysisCell[];
  totalMinor: number;
  averageMinor: number;
}

export interface CategoryEvolutionAnalysisReport {
  periodCount: number;
  periods: readonly ReportAnalysisPeriod[];
}

export interface CategoryEvolutionAnalysisBlock {
  currency: string;
  income: ReportAnalysisSeries;
  expense: ReportAnalysisSeries;
  result: ReportAnalysisSeries;
}

export interface CategoryEvolutionAnalysisViewModel {
  currency: string;
  periodCount: number;
  summary: {
    incomeMinor: number;
    expenseMinor: number;
    resultMinor: number;
    averageResultMinor: number;
  };
  trend: Array<{
    label: string;
    accessibleLabel: string;
    amountMinor: number;
  }>;
  highlights: {
    bestPeriod?: { label: string; accessibleLabel: string; amountMinor: number };
    lowestPeriod?: { label: string; accessibleLabel: string; amountMinor: number };
    negativePeriodCount: number;
  };
}

export function buildCategoryEvolutionAnalysisViewModel(
  report: CategoryEvolutionAnalysisReport,
  block: CategoryEvolutionAnalysisBlock,
): CategoryEvolutionAnalysisViewModel {
  const trend = report.periods.map((period, index) => ({
    label: period.label,
    accessibleLabel: period.accessibleLabel,
    amountMinor: block.result.cells[index]?.amountMinor ?? 0,
  }));
  const bestPeriod = trend.reduce<(typeof trend)[number] | undefined>(
    (best, item) => (best === undefined || item.amountMinor > best.amountMinor ? item : best),
    undefined,
  );
  const lowestPeriod = trend.reduce<(typeof trend)[number] | undefined>(
    (lowest, item) =>
      lowest === undefined || item.amountMinor < lowest.amountMinor ? item : lowest,
    undefined,
  );

  return {
    currency: normalizeCurrency(block.currency),
    periodCount: report.periodCount,
    summary: {
      incomeMinor: block.income.totalMinor,
      expenseMinor: -Math.abs(block.expense.totalMinor),
      resultMinor: block.result.totalMinor,
      averageResultMinor: block.result.averageMinor,
    },
    trend,
    highlights: {
      ...(bestPeriod ? { bestPeriod } : {}),
      ...(lowestPeriod ? { lowestPeriod } : {}),
      negativePeriodCount: trend.filter((item) => item.amountMinor < 0).length,
    },
  };
}

export interface InstallmentAnalysisItem {
  id: string;
  status: string;
  dueOn: string;
  amountMinor: number;
  currency: string;
  invoice?: { status: string };
  card?: { name: string };
  category?: { name: string };
}

export interface InstallmentSummaryViewModel {
  activeCount: number;
  totalMinor: number;
  plannedOpenCount: number;
  plannedOpenMinor: number;
  postedClosedCount: number;
  postedClosedMinor: number;
  overdueCount: number;
  overdueMinor: number;
  futureCount: number;
  futureMinor: number;
}

export interface InstallmentAggregateViewModel {
  label: string;
  count: number;
  amountMinor: number;
}

export interface InstallmentCurrencyViewModel<T extends InstallmentAnalysisItem> {
  currency: string;
  items: T[];
  summary: InstallmentSummaryViewModel;
  groups: {
    months: InstallmentAggregateViewModel[];
    cards: InstallmentAggregateViewModel[];
    categories: InstallmentAggregateViewModel[];
  };
}

export function buildInstallmentAnalysisViewModel<T extends InstallmentAnalysisItem>(
  items: readonly T[],
  today: string,
  formatMonth: (month: string) => string,
): Array<InstallmentCurrencyViewModel<T>> {
  const byCurrency = new Map<string, T[]>();
  for (const item of items) {
    const currency = normalizeCurrency(item.currency);
    const current = byCurrency.get(currency) ?? [];
    current.push(item);
    byCurrency.set(currency, current);
  }

  return Array.from(byCurrency.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, currencyItems]) => ({
      currency,
      items: currencyItems.slice(),
      summary: summarizeInstallments(currencyItems, today),
      groups: {
        months: aggregateBy(currencyItems, (item) => formatMonth(item.dueOn.slice(0, 7))),
        cards: aggregateBy(currencyItems, (item) => item.card?.name ?? "Sem cartão informado"),
        categories: aggregateBy(currencyItems, (item) => item.category?.name ?? "Sem categoria"),
      },
    }));
}

function summarizeInstallments(
  installments: readonly InstallmentAnalysisItem[],
  today: string,
): InstallmentSummaryViewModel {
  return installments.reduce<InstallmentSummaryViewModel>(
    (summary, installment) => {
      const amountMinor = installment.status === "cancelled" ? 0 : installment.amountMinor;
      const postedClosed = isPostedOrClosed(installment);
      const plannedOpen = installment.status === "planned" && !postedClosed;
      const overdue = plannedOpen && installment.dueOn < today;
      const future = installment.status !== "cancelled" && installment.dueOn > today;

      if (installment.status !== "cancelled") {
        summary.activeCount += 1;
        summary.totalMinor += amountMinor;
      }
      if (plannedOpen) {
        summary.plannedOpenCount += 1;
        summary.plannedOpenMinor += amountMinor;
      }
      if (postedClosed) {
        summary.postedClosedCount += 1;
        summary.postedClosedMinor += amountMinor;
      }
      if (overdue) {
        summary.overdueCount += 1;
        summary.overdueMinor += amountMinor;
      }
      if (future) {
        summary.futureCount += 1;
        summary.futureMinor += amountMinor;
      }
      return summary;
    },
    emptyInstallmentSummary(),
  );
}

function emptyInstallmentSummary(): InstallmentSummaryViewModel {
  return {
    activeCount: 0,
    totalMinor: 0,
    plannedOpenCount: 0,
    plannedOpenMinor: 0,
    postedClosedCount: 0,
    postedClosedMinor: 0,
    overdueCount: 0,
    overdueMinor: 0,
    futureCount: 0,
    futureMinor: 0,
  };
}

function isPostedOrClosed(installment: InstallmentAnalysisItem): boolean {
  return (
    installment.status === "posted" ||
    installment.status === "reconciled" ||
    installment.invoice?.status === "closed" ||
    installment.invoice?.status === "paid"
  );
}

function aggregateBy<T extends InstallmentAnalysisItem>(
  installments: readonly T[],
  labelFor: (installment: T) => string,
): InstallmentAggregateViewModel[] {
  const groups = new Map<string, InstallmentAggregateViewModel>();
  for (const installment of installments) {
    const label = labelFor(installment);
    const current = groups.get(label) ?? { label, count: 0, amountMinor: 0 };
    current.count += 1;
    if (installment.status !== "cancelled") current.amountMinor += installment.amountMinor;
    groups.set(label, current);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.amountMinor - left.amountMinor || left.label.localeCompare(right.label, "pt-BR"),
  );
}

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new TypeError("Report analysis requires an explicit three-letter currency code.");
  }
  return normalized;
}
