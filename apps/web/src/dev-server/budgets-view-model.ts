export interface BudgetRecord {
  id: string;
  status: string;
  categoryId: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number;
  currency?: string;
  alertThresholdPercent?: number;
}

export interface BudgetCompositionItemRecord {
  id: string;
  state: "realized" | "committed";
  description: string;
  date: string;
  amountMinor: number;
  currency: string;
  categoryId?: string;
  transactionId?: string;
  commitmentId?: string;
}

export interface BudgetUsageRecord {
  source: "budget" | "unbudgeted" | "uncategorized";
  budgetId?: string;
  categoryId?: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number | null;
  actualAmountMinor: number;
  realizedAmountMinor: number;
  committedAmountMinor: number;
  projectedAmountMinor: number;
  remainingAmountMinor: number | null;
  availableAmountMinor: number | null;
  overBudgetAmountMinor: number | null;
  usedPercent: number | null;
  alertThresholdPercent: number | null;
  status:
    | "no_activity"
    | "on_track"
    | "approaching"
    | "exceeded"
    | "unbudgeted"
    | "uncategorized"
    | string;
  currency: string;
  realizedItems: BudgetCompositionItemRecord[];
  committedItems: BudgetCompositionItemRecord[];
}

export interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

export interface BudgetUsageLoad {
  ok: boolean;
  usage?: BudgetUsageRecord;
  error?: string;
}

export interface BudgetRowViewModel {
  id: string;
  source: "budget" | "unbudgeted" | "uncategorized";
  status: string;
  categoryId?: string;
  categoryName: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number | null;
  currency?: string;
  actualAmountMinor: number | null;
  committedAmountMinor: number | null;
  projectedAmountMinor: number | null;
  remainingAmountMinor: number | null;
  availableAmountMinor: number | null;
  overBudgetAmountMinor: number | null;
  usedPercent: number | null;
  usageStatus: BudgetUsageRecord["status"] | "unavailable";
  usageUnavailableReason?: string;
  alertThresholdPercent?: number;
  compositionItems: BudgetCompositionItemRecord[];
}

export interface BudgetsPageViewModel {
  rows: BudgetRowViewModel[];
  currencies: string[];
  activeCount: number;
  attentionCount: number;
  unavailableUsageCount: number;
  unbudgetedCount: number;
  uncategorizedCount: number;
}

export interface BudgetPresentationFilters {
  currency?: string;
  status?: "active" | "archived";
}

export function buildBudgetsPageViewModel(
  budgets: readonly BudgetRecord[],
  categories: readonly CategoryRecord[],
  usageByBudgetId: ReadonlyMap<string, BudgetUsageLoad>,
  filters: BudgetPresentationFilters = {},
  dashboardUsage: readonly BudgetUsageRecord[] = [],
): BudgetsPageViewModel {
  const categoryIndex = new Map(categories.map((category) => [category.id, category]));
  const normalizedFilterCurrency = normalizeCurrency(filters.currency);
  const budgetRows = budgets
    .filter((budget) => filters.status === undefined || budget.status === filters.status)
    .filter((budget) => {
      if (!normalizedFilterCurrency) return true;
      return normalizeCurrency(budget.currency) === normalizedFilterCurrency;
    })
    .map((budget) => buildBudgetRow(budget, categoryIndex, usageByBudgetId.get(budget.id)));
  const dashboardRows =
    filters.status === "archived"
      ? []
      : dashboardUsage
          .filter((usage) => usage.source === "unbudgeted" || usage.source === "uncategorized")
          .filter((usage) => {
            if (!normalizedFilterCurrency) return true;
            return normalizeCurrency(usage.currency) === normalizedFilterCurrency;
          })
          .map((usage) => buildDashboardRow(usage, categoryIndex));
  const rows = [...budgetRows, ...dashboardRows].sort(compareBudgetRows);
  const currencies = Array.from(
    new Set(
      [
        ...budgets.map((budget) => normalizeCurrency(budget.currency)),
        ...dashboardUsage.map((usage) => normalizeCurrency(usage.currency)),
      ].filter((currency): currency is string => currency !== undefined),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    rows,
    currencies,
    activeCount: rows.filter((row) => row.source === "budget" && row.status === "active").length,
    attentionCount: rows.filter(
      (row) =>
        row.usageStatus === "approaching" ||
        row.usageStatus === "exceeded" ||
        (row.overBudgetAmountMinor ?? 0) > 0,
    ).length,
    unavailableUsageCount: rows.filter((row) => row.usageStatus === "unavailable").length,
    unbudgetedCount: rows.filter((row) => row.source === "unbudgeted").length,
    uncategorizedCount: rows.filter((row) => row.source === "uncategorized").length,
  };
}

function buildBudgetRow(
  budget: BudgetRecord,
  categoryIndex: ReadonlyMap<string, CategoryRecord>,
  usageLoad: BudgetUsageLoad | undefined,
): BudgetRowViewModel {
  const currency = normalizeCurrency(budget.currency);
  const acceptedUsage = validateUsage(budget, usageLoad?.usage);
  const usageUnavailableReason = acceptedUsage
    ? undefined
    : usageLoad?.ok === false
      ? usageLoad.error || "Não foi possível carregar o acompanhamento deste orçamento."
      : "O acompanhamento deste orçamento não está disponível com segurança.";

  return {
    id: budget.id,
    source: "budget",
    status: budget.status,
    categoryId: budget.categoryId,
    categoryName: buildCategoryPath(budget.categoryId, categoryIndex),
    periodStartOn: budget.periodStartOn,
    periodEndOn: budget.periodEndOn,
    plannedAmountMinor: budget.plannedAmountMinor,
    ...(currency ? { currency } : {}),
    actualAmountMinor: acceptedUsage?.realizedAmountMinor ?? null,
    committedAmountMinor: acceptedUsage?.committedAmountMinor ?? null,
    projectedAmountMinor: acceptedUsage?.projectedAmountMinor ?? null,
    remainingAmountMinor: acceptedUsage?.remainingAmountMinor ?? null,
    availableAmountMinor: acceptedUsage?.availableAmountMinor ?? null,
    overBudgetAmountMinor: acceptedUsage?.overBudgetAmountMinor ?? null,
    usedPercent: acceptedUsage?.usedPercent ?? null,
    usageStatus: acceptedUsage?.status ?? "unavailable",
    ...(usageUnavailableReason ? { usageUnavailableReason } : {}),
    ...(acceptedUsage?.alertThresholdPercent !== null &&
    acceptedUsage?.alertThresholdPercent !== undefined
      ? { alertThresholdPercent: acceptedUsage.alertThresholdPercent }
      : budget.alertThresholdPercent !== undefined
        ? { alertThresholdPercent: budget.alertThresholdPercent }
        : {}),
    compositionItems: acceptedUsage
      ? [...acceptedUsage.realizedItems, ...acceptedUsage.committedItems].sort(compareCompositionItems)
      : [],
  };
}

function buildDashboardRow(
  usage: BudgetUsageRecord,
  categoryIndex: ReadonlyMap<string, CategoryRecord>,
): BudgetRowViewModel {
  const currency = normalizeCurrency(usage.currency);
  const source = usage.source === "uncategorized" ? "uncategorized" : "unbudgeted";
  const categoryName =
    source === "uncategorized"
      ? "Sem categoria"
      : usage.categoryId
        ? buildCategoryPath(usage.categoryId, categoryIndex)
        : "Categoria não localizada";

  return {
    id: [
      source,
      usage.categoryId ?? "uncategorized",
      usage.periodStartOn,
      usage.periodEndOn,
      currency ?? "unknown",
    ].join(":"),
    source,
    status: "active",
    ...(usage.categoryId ? { categoryId: usage.categoryId } : {}),
    categoryName,
    periodStartOn: usage.periodStartOn,
    periodEndOn: usage.periodEndOn,
    plannedAmountMinor: null,
    ...(currency ? { currency } : {}),
    actualAmountMinor: finiteOrNull(usage.realizedAmountMinor),
    committedAmountMinor: finiteOrNull(usage.committedAmountMinor),
    projectedAmountMinor: finiteOrNull(usage.projectedAmountMinor),
    remainingAmountMinor: null,
    availableAmountMinor: null,
    overBudgetAmountMinor: null,
    usedPercent: null,
    usageStatus: source,
    compositionItems: [...usage.realizedItems, ...usage.committedItems].sort(compareCompositionItems),
  };
}

function validateUsage(
  budget: BudgetRecord,
  usage: BudgetUsageRecord | undefined,
): BudgetUsageRecord | undefined {
  if (!usage || usage.source !== "budget") return undefined;
  const budgetCurrency = normalizeCurrency(budget.currency);
  const usageCurrency = normalizeCurrency(usage.currency);
  if (!budgetCurrency || !usageCurrency || budgetCurrency !== usageCurrency) return undefined;
  if (usage.budgetId !== budget.id) return undefined;
  if (usage.categoryId !== budget.categoryId) return undefined;
  if (usage.periodStartOn !== budget.periodStartOn || usage.periodEndOn !== budget.periodEndOn) {
    return undefined;
  }
  if (usage.plannedAmountMinor !== budget.plannedAmountMinor) return undefined;
  if (
    !Number.isFinite(usage.realizedAmountMinor) ||
    !Number.isFinite(usage.committedAmountMinor) ||
    !Number.isFinite(usage.projectedAmountMinor) ||
    !Number.isFinite(usage.availableAmountMinor) ||
    !Number.isFinite(usage.overBudgetAmountMinor) ||
    !Number.isFinite(usage.usedPercent)
  ) {
    return undefined;
  }
  if (!Array.isArray(usage.realizedItems) || !Array.isArray(usage.committedItems)) return undefined;
  return usage;
}

function buildCategoryPath(
  categoryId: string,
  categoryIndex: ReadonlyMap<string, CategoryRecord>,
): string {
  const category = categoryIndex.get(categoryId);
  if (!category) return "Categoria não localizada";

  const path = [category.name];
  const visited = new Set<string>([category.id]);
  let parentId = category.parentCategoryId;
  while (parentId && !visited.has(parentId)) {
    const parent = categoryIndex.get(parentId);
    if (!parent) break;
    path.unshift(parent.name);
    visited.add(parent.id);
    parentId = parent.parentCategoryId;
  }
  return path.join(" › ");
}

function compareBudgetRows(left: BudgetRowViewModel, right: BudgetRowViewModel): number {
  const status = statusRank(left) - statusRank(right);
  if (status !== 0) return status;
  const currency = (left.currency ?? "ZZZ").localeCompare(right.currency ?? "ZZZ");
  if (currency !== 0) return currency;
  const period = right.periodStartOn.localeCompare(left.periodStartOn);
  if (period !== 0) return period;
  return left.categoryName.localeCompare(right.categoryName, "pt-BR");
}

function statusRank(row: BudgetRowViewModel): number {
  if (row.source === "budget" && row.status === "active") return 0;
  if (row.source === "unbudgeted") return 1;
  if (row.source === "uncategorized") return 2;
  if (row.status === "archived") return 3;
  return 4;
}

function compareCompositionItems(
  left: BudgetCompositionItemRecord,
  right: BudgetCompositionItemRecord,
): number {
  const date = left.date.localeCompare(right.date);
  return date === 0 ? left.id.localeCompare(right.id) : date;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined;
}
