import type { Budget, EntityId, FutureCommitment, ISODate, Transaction } from "./index.js";
import { listBudgets, summarizeBudgetUsage, type BudgetUsageStatus } from "./budgets.js";
import type { TenantContext } from "./tenant.js";
import { listTenantScopedResources } from "./tenant-authorization.js";

export type OperationalBudgetSource = "budget" | "unbudgeted" | "uncategorized";
export type BudgetConsumptionState = "realized" | "committed";

export interface BudgetConsumptionItem {
  id: string;
  state: BudgetConsumptionState;
  description: string;
  date: ISODate;
  amountMinor: number;
  currency: string;
  categoryId?: EntityId;
  transactionId?: EntityId;
  commitmentId?: string;
}

export interface OperationalBudgetUsageSummary {
  source: OperationalBudgetSource;
  categoryId?: EntityId;
  periodStartOn: ISODate;
  periodEndOn: ISODate;
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
  status: BudgetUsageStatus | "uncategorized";
  currency: string;
  budgetId?: EntityId;
  realizedItems: BudgetConsumptionItem[];
  committedItems: BudgetConsumptionItem[];
}

export interface SummarizeOperationalBudgetUsageInput {
  context: TenantContext;
  budget: Budget | undefined;
  transactions: readonly Transaction[];
  commitments?: readonly FutureCommitment[];
}

export interface SummarizeOperationalBudgetDashboardInput {
  context: TenantContext;
  budgets: readonly Budget[];
  transactions: readonly Transaction[];
  commitments?: readonly FutureCommitment[];
  periodStartOn: ISODate;
  periodEndOn: ISODate;
  currency?: string;
}

export function summarizeOperationalBudgetUsage(
  input: SummarizeOperationalBudgetUsageInput,
): OperationalBudgetUsageSummary {
  const baseline = summarizeBudgetUsage({
    context: input.context,
    budget: input.budget,
    transactions: input.transactions,
  });
  const budget = input.budget;
  if (!budget) {
    // summarizeBudgetUsage already throws the canonical tenant/not-found error.
    throw new Error("Budget is required.");
  }

  const realizedItems = collectRealizedItems(
    input.context,
    input.transactions,
    budget.periodStartOn,
    budget.periodEndOn,
    budget.currency,
    budget.categoryId,
  );
  const committedItems = collectCommittedItems(
    input.context,
    input.transactions,
    input.commitments ?? [],
    budget.periodStartOn,
    budget.periodEndOn,
    budget.currency,
    budget.categoryId,
  );
  const committedAmountMinor = sumItems(committedItems);
  const projectedAmountMinor = baseline.actualAmountMinor + committedAmountMinor;
  const availableAmountMinor = budget.plannedAmountMinor - projectedAmountMinor;

  return {
    source: "budget",
    budgetId: budget.id,
    categoryId: budget.categoryId,
    periodStartOn: budget.periodStartOn,
    periodEndOn: budget.periodEndOn,
    plannedAmountMinor: budget.plannedAmountMinor,
    actualAmountMinor: baseline.actualAmountMinor,
    realizedAmountMinor: baseline.actualAmountMinor,
    committedAmountMinor,
    projectedAmountMinor,
    remainingAmountMinor: baseline.remainingAmountMinor,
    availableAmountMinor,
    overBudgetAmountMinor: Math.max(0, -availableAmountMinor),
    usedPercent: baseline.usedPercent,
    alertThresholdPercent: baseline.alertThresholdPercent,
    status: baseline.status,
    currency: budget.currency,
    realizedItems,
    committedItems,
  };
}

export function summarizeOperationalBudgetDashboard(
  input: SummarizeOperationalBudgetDashboardInput,
): OperationalBudgetUsageSummary[] {
  const periodStartOn = validateDate(input.periodStartOn);
  const periodEndOn = validateDate(input.periodEndOn);
  if (periodEndOn < periodStartOn) {
    throw new Error("Budget dashboard period must end on or after it starts.");
  }
  const currency = input.currency ? normalizeCurrency(input.currency) : undefined;

  const budgets = listBudgets(input.context, input.budgets, {
    status: "active",
    periodStartOn,
    periodEndOn,
  }).filter((budget) => currency === undefined || budget.currency === currency);

  const summaries = budgets.map((budget) =>
    summarizeOperationalBudgetUsage({
      context: input.context,
      budget,
      transactions: input.transactions,
      commitments: input.commitments ?? [],
    }),
  );

  const budgetCoverage = new Map<string, Budget[]>();
  for (const budget of budgets) {
    const key = categoryCurrencyKey(budget.categoryId, budget.currency);
    const current = budgetCoverage.get(key);
    if (current) {
      current.push(budget);
    } else {
      budgetCoverage.set(key, [budget]);
    }
  }
  const grouped = new Map<
    string,
    {
      categoryId?: EntityId;
      currency: string;
      realizedItems: BudgetConsumptionItem[];
      committedItems: BudgetConsumptionItem[];
    }
  >();

  const candidateCurrencies = new Set<string>();
  for (const transaction of listTenantScopedResources(input.context, input.transactions)) {
    const normalized = safeCurrency(transaction.currency);
    if (normalized && (currency === undefined || normalized === currency)) {
      candidateCurrencies.add(normalized);
    }
  }
  for (const commitment of input.commitments ?? []) {
    for (const effect of commitment.monetaryEffects) {
      const normalized = safeCurrency(effect.currency);
      if (normalized && (currency === undefined || normalized === currency)) {
        candidateCurrencies.add(normalized);
      }
    }
  }

  for (const candidateCurrency of candidateCurrencies) {
    for (const categoryId of collectRelevantCategories(
      input.context,
      input.transactions,
      input.commitments ?? [],
      periodStartOn,
      periodEndOn,
      candidateCurrency,
    )) {
      const coverage =
        categoryId === undefined
          ? []
          : (budgetCoverage.get(categoryCurrencyKey(categoryId, candidateCurrency)) ?? []);

      const realizedItems = collectRealizedItems(
        input.context,
        input.transactions,
        periodStartOn,
        periodEndOn,
        candidateCurrency,
        categoryId,
      ).filter((item) => !isCoveredByBudget(item, coverage));
      const committedItems = collectCommittedItems(
        input.context,
        input.transactions,
        input.commitments ?? [],
        periodStartOn,
        periodEndOn,
        candidateCurrency,
        categoryId,
      ).filter((item) => !isCoveredByBudget(item, coverage));
      if (realizedItems.length === 0 && committedItems.length === 0) continue;

      grouped.set(categoryCurrencyKey(categoryId, candidateCurrency), {
        ...(categoryId ? { categoryId } : {}),
        currency: candidateCurrency,
        realizedItems,
        committedItems,
      });
    }
  }

  for (const item of grouped.values()) {
    const realizedAmountMinor = sumItems(item.realizedItems);
    const committedAmountMinor = sumItems(item.committedItems);
    const projectedAmountMinor = realizedAmountMinor + committedAmountMinor;
    const source: OperationalBudgetSource =
      item.categoryId === undefined ? "uncategorized" : "unbudgeted";

    summaries.push({
      source,
      ...(item.categoryId ? { categoryId: item.categoryId } : {}),
      periodStartOn,
      periodEndOn,
      plannedAmountMinor: null,
      actualAmountMinor: realizedAmountMinor,
      realizedAmountMinor,
      committedAmountMinor,
      projectedAmountMinor,
      remainingAmountMinor: null,
      availableAmountMinor: null,
      overBudgetAmountMinor: null,
      usedPercent: null,
      alertThresholdPercent: null,
      status: source === "uncategorized" ? "uncategorized" : "unbudgeted",
      currency: item.currency,
      realizedItems: item.realizedItems,
      committedItems: item.committedItems,
    });
  }

  return summaries.sort((left, right) => {
    const currencyOrder = left.currency.localeCompare(right.currency);
    if (currencyOrder !== 0) return currencyOrder;
    const categoryOrder = (left.categoryId ?? "\uffff").localeCompare(right.categoryId ?? "\uffff");
    if (categoryOrder !== 0) return categoryOrder;
    return sourceRank(left.source) - sourceRank(right.source);
  });
}

function collectRelevantCategories(
  context: TenantContext,
  transactions: readonly Transaction[],
  commitments: readonly FutureCommitment[],
  periodStartOn: ISODate,
  periodEndOn: ISODate,
  currency: string,
): Array<EntityId | undefined> {
  const keys = new Set<string>();

  for (const transaction of listTenantScopedResources(context, transactions)) {
    if (
      transaction.kind === "expense" &&
      !isInvoiceCashTransaction(transaction) &&
      transaction.currency === currency &&
      ((isRealized(transaction) &&
        transaction.occurredOn >= periodStartOn &&
        transaction.occurredOn <= periodEndOn) ||
        (isCommittedTransaction(transaction) &&
          transaction.plannedOn >= periodStartOn &&
          transaction.plannedOn <= periodEndOn))
    ) {
      keys.add(transaction.categoryId ?? "");
    }
  }

  for (const commitment of commitments) {
    if (
      commitment.source.kind !== "invoice" &&
      commitment.source.kind !== "transaction" &&
      commitment.plannedOn >= periodStartOn &&
      commitment.plannedOn <= periodEndOn &&
      committedAmountForCurrency(commitment, currency) > 0
    ) {
      keys.add(commitment.categoryId ?? "");
    }
  }

  return [...keys].map((value) => (value === "" ? undefined : value));
}

function collectRealizedItems(
  context: TenantContext,
  transactions: readonly Transaction[],
  periodStartOn: ISODate,
  periodEndOn: ISODate,
  currency: string,
  categoryId: EntityId | undefined,
): BudgetConsumptionItem[] {
  return listTenantScopedResources(context, transactions)
    .filter(
      (transaction) =>
        transaction.kind === "expense" &&
        !isInvoiceCashTransaction(transaction) &&
        isRealized(transaction) &&
        transaction.occurredOn >= periodStartOn &&
        transaction.occurredOn <= periodEndOn &&
        transaction.currency === currency &&
        transaction.categoryId === categoryId,
    )
    .map(
      (transaction): BudgetConsumptionItem => ({
        id: `realized:${transaction.id}`,
        state: "realized",
        description: transaction.description,
        date: transaction.occurredOn,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
        transactionId: transaction.id,
      }),
    )
    .sort(compareItems);
}

function collectCommittedItems(
  context: TenantContext,
  transactions: readonly Transaction[],
  commitments: readonly FutureCommitment[],
  periodStartOn: ISODate,
  periodEndOn: ISODate,
  currency: string,
  categoryId: EntityId | undefined,
): BudgetConsumptionItem[] {
  const items: BudgetConsumptionItem[] = [];
  const scopedTransactions = listTenantScopedResources(context, transactions);

  for (const transaction of scopedTransactions) {
    if (
      !isCommittedTransaction(transaction) ||
      isInvoiceCashTransaction(transaction) ||
      transaction.plannedOn < periodStartOn ||
      transaction.plannedOn > periodEndOn ||
      transaction.currency !== currency ||
      transaction.categoryId !== categoryId
    ) {
      continue;
    }

    items.push({
      id: `committed:transaction:${transaction.id}`,
      state: "committed",
      description: transaction.description,
      date: transaction.plannedOn,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
      transactionId: transaction.id,
      commitmentId: `transaction:${transaction.id}`,
    });
  }

  for (const commitment of commitments) {
    if (
      commitment.source.kind === "invoice" ||
      commitment.source.kind === "transaction" ||
      commitment.plannedOn < periodStartOn ||
      commitment.plannedOn > periodEndOn ||
      commitment.categoryId !== categoryId
    ) {
      continue;
    }

    for (const effect of commitment.monetaryEffects) {
      if (effect.currency !== currency || effect.amountMinor >= 0) continue;
      items.push({
        id: `committed:${commitment.id}:${effect.id}`,
        state: "committed",
        description: commitment.description,
        date: commitment.plannedOn,
        amountMinor: -effect.amountMinor,
        currency: effect.currency,
        ...(commitment.categoryId ? { categoryId: commitment.categoryId } : {}),
        commitmentId: commitment.id,
      });
    }
  }

  return items.sort(compareItems);
}

function isCoveredByBudget(item: BudgetConsumptionItem, budgets: readonly Budget[]): boolean {
  return budgets.some(
    (budget) => item.date >= budget.periodStartOn && item.date <= budget.periodEndOn,
  );
}

function isInvoiceCashTransaction(transaction: Transaction): boolean {
  return (
    transaction.invoiceId !== undefined &&
    transaction.cardId !== undefined &&
    transaction.accountId !== undefined
  );
}

function isRealized(transaction: Transaction): boolean {
  return transaction.status === "posted" || transaction.status === "reconciled";
}

function isCommittedTransaction(transaction: Transaction): boolean {
  return (
    transaction.kind === "expense" &&
    transaction.status === "planned" &&
    transaction.effectiveOn === undefined
  );
}

function committedAmountForCurrency(commitment: FutureCommitment, currency: string): number {
  if (commitment.source.kind === "invoice" || commitment.source.kind === "transaction") {
    return 0;
  }
  return commitment.monetaryEffects
    .filter((effect) => effect.currency === currency && effect.amountMinor < 0)
    .reduce((total, effect) => total - effect.amountMinor, 0);
}

function sumItems(items: readonly BudgetConsumptionItem[]): number {
  return items.reduce((total, item) => total + item.amountMinor, 0);
}

function compareItems(left: BudgetConsumptionItem, right: BudgetConsumptionItem): number {
  const dateOrder = left.date.localeCompare(right.date);
  return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
}

function categoryCurrencyKey(categoryId: EntityId | undefined, currency: string): string {
  return `${currency}\u0000${categoryId ?? ""}`;
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Budget currency must use ISO 4217 format.");
  }
  return normalized;
}

function safeCurrency(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
}

function validateDate(value: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Budget dashboard period must use YYYY-MM-DD.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Budget dashboard period contains an invalid date.");
  }
  return value;
}

function sourceRank(source: OperationalBudgetSource): number {
  if (source === "budget") return 0;
  if (source === "unbudgeted") return 1;
  return 2;
}
