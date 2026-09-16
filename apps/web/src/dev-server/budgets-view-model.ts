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

export interface BudgetUsageRecord {
  budgetId?: string;
  categoryId: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number;
  actualAmountMinor: number;
  remainingAmountMinor: number;
  usedPercent: number;
  alertThresholdPercent: number;
  status: "no_activity" | "on_track" | "approaching" | "exceeded" | "unbudgeted" | string;
  currency: string;
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
  source: "budget" | "unbudgeted";
  status: string;
  categoryId: string;
  categoryName: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number | null;
  currency?: string;
  actualAmountMinor: number | null;
  remainingAmountMinor: number | null;
  usedPercent: number | null;
  usageStatus: BudgetUsageRecord["status"] | "unavailable";
  usageUnavailableReason?: string;
  alertThresholdPercent?: number;
}

export interface BudgetsPageViewModel {
  rows: BudgetRowViewModel[];
  currencies: string[];
  activeCount: number;
  attentionCount: number;
  unavailableUsageCount: number;
  unbudgetedCount: number;
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
  unbudgetedUsage: readonly BudgetUsageRecord[] = [],
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
  const unbudgetedRows = filters.status === "archived"
    ? []
    : unbudgetedUsage
        .filter((usage) => usage.status === "unbudgeted")
        .filter((usage) => {
          if (!normalizedFilterCurrency) return true;
          return normalizeCurrency(usage.currency) === normalizedFilterCurrency;
        })
        .map((usage) => buildUnbudgetedRow(usage, categoryIndex));
  const rows = [...budgetRows, ...unbudgetedRows].sort(compareBudgetRows);
  const currencies = Array.from(
    new Set(
      [
        ...budgets.map((budget) => normalizeCurrency(budget.currency)),
        ...unbudgetedUsage.map((usage) => normalizeCurrency(usage.currency)),
      ].filter((currency): currency is string => currency !== undefined),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    rows,
    currencies,
    activeCount: rows.filter((row) => row.source === "budget" && row.status === "active").length,
    attentionCount: rows.filter(
      (row) => row.usageStatus === "approaching" || row.usageStatus === "exceeded",
    ).length,
    unavailableUsageCount: rows.filter((row) => row.usageStatus === "unavailable").length,
    unbudgetedCount: rows.filter((row) => row.source === "unbudgeted").length,
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
      ? usageLoad.error || "Não foi possível carregar o realizado deste orçamento."
      : "O realizado deste orçamento não está disponível com segurança.";

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
    actualAmountMinor: acceptedUsage?.actualAmountMinor ?? null,
    remainingAmountMinor: acceptedUsage?.remainingAmountMinor ?? null,
    usedPercent: acceptedUsage?.usedPercent ?? null,
    usageStatus: acceptedUsage?.status ?? "unavailable",
    ...(usageUnavailableReason ? { usageUnavailableReason } : {}),
    ...(acceptedUsage
      ? { alertThresholdPercent: acceptedUsage.alertThresholdPercent }
      : budget.alertThresholdPercent !== undefined
        ? { alertThresholdPercent: budget.alertThresholdPercent }
        : {}),
  };
}

function buildUnbudgetedRow(
  usage: BudgetUsageRecord,
  categoryIndex: ReadonlyMap<string, CategoryRecord>,
): BudgetRowViewModel {
  const currency = normalizeCurrency(usage.currency);
  return {
    id: `unbudgeted:${usage.categoryId}:${usage.periodStartOn}:${usage.periodEndOn}:${currency ?? "unknown"}`,
    source: "unbudgeted",
    status: "active",
    categoryId: usage.categoryId,
    categoryName: buildCategoryPath(usage.categoryId, categoryIndex),
    periodStartOn: usage.periodStartOn,
    periodEndOn: usage.periodEndOn,
    plannedAmountMinor: null,
    ...(currency ? { currency } : {}),
    actualAmountMinor: Number.isFinite(usage.actualAmountMinor) ? usage.actualAmountMinor : null,
    remainingAmountMinor: Number.isFinite(usage.remainingAmountMinor)
      ? usage.remainingAmountMinor
      : null,
    usedPercent: Number.isFinite(usage.usedPercent) ? usage.usedPercent : null,
    usageStatus: "unbudgeted",
    alertThresholdPercent: usage.alertThresholdPercent,
  };
}

function validateUsage(
  budget: BudgetRecord,
  usage: BudgetUsageRecord | undefined,
): BudgetUsageRecord | undefined {
  if (!usage) return undefined;
  const budgetCurrency = normalizeCurrency(budget.currency);
  const usageCurrency = normalizeCurrency(usage.currency);
  if (!budgetCurrency || !usageCurrency || budgetCurrency !== usageCurrency) return undefined;
  if (usage.budgetId && usage.budgetId !== budget.id) return undefined;
  if (usage.categoryId !== budget.categoryId) return undefined;
  if (usage.periodStartOn !== budget.periodStartOn || usage.periodEndOn !== budget.periodEndOn) {
    return undefined;
  }
  if (usage.plannedAmountMinor !== budget.plannedAmountMinor) return undefined;
  if (
    !Number.isFinite(usage.actualAmountMinor) ||
    !Number.isFinite(usage.remainingAmountMinor) ||
    !Number.isFinite(usage.usedPercent)
  ) {
    return undefined;
  }
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
  if (row.source === "unbudgeted") return 1;
  if (row.status === "active") return 0;
  if (row.status === "archived") return 2;
  return 3;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined;
}
