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
  status: string;
  categoryId: string;
  categoryName: string;
  periodStartOn: string;
  periodEndOn: string;
  plannedAmountMinor: number;
  currency?: string;
  actualAmountMinor: number | null;
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
): BudgetsPageViewModel {
  const categoryIndex = new Map(categories.map((category) => [category.id, category]));
  const currencies = Array.from(
    new Set(
      budgets
        .map((budget) => normalizeCurrency(budget.currency))
        .filter((currency): currency is string => currency !== undefined),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const normalizedFilterCurrency = normalizeCurrency(filters.currency);
  const rows = budgets
    .filter((budget) => filters.status === undefined || budget.status === filters.status)
    .filter((budget) => {
      if (!normalizedFilterCurrency) return true;
      return normalizeCurrency(budget.currency) === normalizedFilterCurrency;
    })
    .map((budget) => {
      const currency = normalizeCurrency(budget.currency);
      const usageLoad = usageByBudgetId.get(budget.id);
      const acceptedUsage = validateUsage(budget, usageLoad?.usage);
      const usageUnavailableReason = acceptedUsage
        ? undefined
        : usageLoad?.ok === false
          ? usageLoad.error || "Não foi possível carregar o realizado deste orçamento."
          : "O realizado deste orçamento não está disponível com segurança.";

      return {
        id: budget.id,
        status: budget.status,
        categoryId: budget.categoryId,
        categoryName: buildCategoryPath(budget.categoryId, categoryIndex),
        periodStartOn: budget.periodStartOn,
        periodEndOn: budget.periodEndOn,
        plannedAmountMinor: budget.plannedAmountMinor,
        ...(currency ? { currency } : {}),
        actualAmountMinor: acceptedUsage?.actualAmountMinor ?? null,
        usedPercent: acceptedUsage?.usedPercent ?? null,
        usageStatus: acceptedUsage?.status ?? "unavailable",
        ...(usageUnavailableReason ? { usageUnavailableReason } : {}),
        ...(acceptedUsage
          ? { alertThresholdPercent: acceptedUsage.alertThresholdPercent }
          : budget.alertThresholdPercent !== undefined
            ? { alertThresholdPercent: budget.alertThresholdPercent }
            : {}),
      } satisfies BudgetRowViewModel;
    })
    .sort(compareBudgetRows);

  return {
    rows,
    currencies,
    activeCount: rows.filter((row) => row.status === "active").length,
    attentionCount: rows.filter(
      (row) => row.usageStatus === "approaching" || row.usageStatus === "exceeded",
    ).length,
    unavailableUsageCount: rows.filter((row) => row.usageStatus === "unavailable").length,
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
  if (!Number.isFinite(usage.actualAmountMinor) || !Number.isFinite(usage.usedPercent)) return undefined;
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
  const status = statusRank(left.status) - statusRank(right.status);
  if (status !== 0) return status;
  const currency = (left.currency ?? "ZZZ").localeCompare(right.currency ?? "ZZZ");
  if (currency !== 0) return currency;
  const period = right.periodStartOn.localeCompare(left.periodStartOn);
  if (period !== 0) return period;
  return left.categoryName.localeCompare(right.categoryName, "pt-BR");
}

function statusRank(status: string): number {
  if (status === "active") return 0;
  if (status === "archived") return 1;
  return 2;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined;
}
