import type {
  DashboardAvailabilityCard,
  DashboardCategoryExpense,
  DashboardDataSet,
  DashboardEntry,
  DashboardMonthlyCashFlow,
  DashboardStateKind,
  DashboardSummary,
  DashboardTenantContext,
  DashboardUpcomingBill,
  DashboardViewModel,
} from "./types.js";

const percentPrecision = 100;

export function buildDashboardViewModel(
  dataSet: DashboardDataSet | undefined,
  state: DashboardStateKind = "ready",
): DashboardViewModel {
  if (dataSet === undefined) {
    return buildUnavailableDashboard(state);
  }

  const scopedEntries = filterEntriesByContext(dataSet.entries, dataSet.context);
  const scopedBills = filterBillsByContext(dataSet.upcomingBills, dataSet.context);
  const summary = calculateDashboardSummary(dataSet, scopedEntries);
  const hasOperationalData = scopedEntries.length > 0 || scopedBills.length > 0;

  if (!hasOperationalData && state === "ready") {
    return {
      state: "empty",
      title: "Comece registrando sua movimentacao",
      description: "Ainda nao ha lancamentos ou vencimentos para montar o resumo deste periodo.",
      period: dataSet.period,
      summary,
      availability: buildAvailabilityCard(dataSet.dailyAvailability),
      categoryExpenses: [],
      monthlyCashFlow: [],
      upcomingBills: [],
    };
  }

  return {
    state,
    title: "Resumo financeiro",
    description: "Acompanhe saldo, resultado do periodo e compromissos proximos.",
    period: dataSet.period,
    summary,
    availability: buildAvailabilityCard(dataSet.dailyAvailability),
    categoryExpenses: calculateCategoryExpenses(scopedEntries),
    monthlyCashFlow: calculateMonthlyCashFlow(scopedEntries),
    upcomingBills: sortUpcomingBills(scopedBills),
  };
}

export function calculateDashboardSummary(
  dataSet: DashboardDataSet,
  entries: readonly DashboardEntry[] = filterEntriesByContext(dataSet.entries, dataSet.context),
): DashboardSummary {
  const periodEntries = entries.filter((entry) => isDateWithinPeriod(entry.postedOn, dataSet.period));
  const incomeInCents = sumEntryAmounts(periodEntries, "income");
  const expenseInCents = sumEntryAmounts(periodEntries, "expense");
  const resultInCents = incomeInCents - expenseInCents;
  const balanceInCents = dataSet.openingBalanceInCents + resultInCents;

  return {
    balanceInCents,
    incomeInCents,
    expenseInCents,
    resultInCents,
    expenseRatioPercent: calculatePercent(expenseInCents, incomeInCents),
  };
}

export function calculateCategoryExpenses(
  entries: readonly DashboardEntry[],
): DashboardCategoryExpense[] {
  const expenseEntries = entries.filter((entry) => entry.type === "expense");
  const totalExpenses = expenseEntries.reduce((total, entry) => total + entry.amountInCents, 0);
  const groupedExpenses = new Map<string, number>();

  for (const entry of expenseEntries) {
    const categoryName = entry.categoryName ?? "Sem categoria";
    groupedExpenses.set(categoryName, (groupedExpenses.get(categoryName) ?? 0) + entry.amountInCents);
  }

  return [...groupedExpenses.entries()]
    .map(([categoryName, amountInCents]) => ({
      categoryName,
      amountInCents,
      sharePercent: calculatePercent(amountInCents, totalExpenses),
    }))
    .sort((current, next) => next.amountInCents - current.amountInCents);
}

export function calculateMonthlyCashFlow(
  entries: readonly DashboardEntry[],
): DashboardMonthlyCashFlow[] {
  const groupedMonths = new Map<string, { incomeInCents: number; expenseInCents: number }>();

  for (const entry of entries) {
    const month = entry.postedOn.slice(0, 7);
    const currentMonth = groupedMonths.get(month) ?? { incomeInCents: 0, expenseInCents: 0 };

    if (entry.type === "income") {
      currentMonth.incomeInCents += entry.amountInCents;
    } else {
      currentMonth.expenseInCents += entry.amountInCents;
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

export function buildAvailabilityCard(
  availability: DashboardDataSet["dailyAvailability"],
): DashboardAvailabilityCard {
  if (availability === undefined) {
    return {
      state: "pending",
      title: "Disponibilidade do dia pendente",
      description: "O servico de calculo ainda nao esta disponivel para este perfil.",
      assumptions: [],
      limitations: ["A UI nao calcula disponibilidade sem contrato estruturado de API."],
    };
  }

  const description =
    availability.confidence === "low"
      ? "Valor estimado com baixa confianca. Revise as premissas antes de decidir."
      : "Valor informado pelo contrato de disponibilidade financeira.";

  return {
    state: "available",
    title: "Disponivel hoje",
    description,
    amountInCents: availability.availableTodayInCents,
    confidence: availability.confidence,
    detailPath: availability.detailPath,
    assumptions: availability.assumptions,
    limitations: availability.limitations,
  };
}

export function filterEntriesByContext(
  entries: readonly DashboardEntry[],
  context: DashboardTenantContext,
): DashboardEntry[] {
  return entries.filter(
    (entry) =>
      entry.tenantId === context.tenantId && entry.financialProfileId === context.financialProfileId,
  );
}

export function filterBillsByContext(
  bills: readonly DashboardUpcomingBill[],
  context: DashboardTenantContext,
): DashboardUpcomingBill[] {
  return bills.filter(
    (bill) =>
      bill.tenantId === context.tenantId && bill.financialProfileId === context.financialProfileId,
  );
}

function buildUnavailableDashboard(state: DashboardStateKind): DashboardViewModel {
  const fallbackPeriod = {
    startsOn: "2026-06-01",
    endsOn: "2026-06-30",
    label: "Junho de 2026",
  };

  return {
    state,
    title: state === "error" ? "Nao foi possivel carregar o dashboard" : "Carregando dashboard",
    description:
      state === "error"
        ? "Tente novamente para acompanhar seu resumo financeiro."
        : "Estamos preparando saldos, vencimentos e disponibilidade.",
    period: fallbackPeriod,
    summary: {
      balanceInCents: 0,
      incomeInCents: 0,
      expenseInCents: 0,
      resultInCents: 0,
      expenseRatioPercent: 0,
    },
    availability: buildAvailabilityCard(undefined),
    categoryExpenses: [],
    monthlyCashFlow: [],
    upcomingBills: [],
  };
}

function sumEntryAmounts(entries: readonly DashboardEntry[], type: DashboardEntry["type"]): number {
  return entries
    .filter((entry) => entry.type === type)
    .reduce((total, entry) => total + entry.amountInCents, 0);
}

function calculatePercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((part / total) * percentPrecision * percentPrecision) / percentPrecision;
}

function isDateWithinPeriod(date: string, period: DashboardDataSet["period"]): boolean {
  return date >= period.startsOn && date <= period.endsOn;
}

function sortUpcomingBills(bills: readonly DashboardUpcomingBill[]): DashboardUpcomingBill[] {
  return [...bills].sort((current, next) => current.dueOn.localeCompare(next.dueOn));
}
