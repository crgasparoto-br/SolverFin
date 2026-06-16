import type {
  AuditLogEntryDraft,
  Budget,
  BudgetStatus,
  Category,
  EntityId,
  ISODate,
  ISODateTime,
  Transaction,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  applyTenantScope,
  getTenantScopedResource,
  listTenantScopedResources,
  updateTenantScopedResource,
} from "./tenant-authorization.js";

export type BudgetErrorCode =
  | "BUDGET_CATEGORY_REQUIRED"
  | "BUDGET_CATEGORY_INVALID"
  | "BUDGET_CATEGORY_ARCHIVED"
  | "BUDGET_CATEGORY_KIND_INVALID"
  | "BUDGET_STATUS_INVALID"
  | "BUDGET_PERIOD_INVALID"
  | "BUDGET_AMOUNT_INVALID"
  | "BUDGET_CURRENCY_INVALID"
  | "BUDGET_ALERT_THRESHOLD_INVALID";

export class BudgetError extends Error {
  readonly code: BudgetErrorCode;
  readonly statusCode = 400;

  constructor(code: BudgetErrorCode, message: string) {
    super(message);
    this.name = "BudgetError";
    this.code = code;
  }
}

export type BudgetUsageStatus =
  | "no_activity"
  | "on_track"
  | "approaching"
  | "exceeded"
  | "unbudgeted";

export interface BudgetMutationResult {
  budget: Budget;
  auditEntry: AuditLogEntryDraft;
}

export interface BudgetUsageSummary {
  categoryId: EntityId;
  periodStartOn: ISODate;
  periodEndOn: ISODate;
  plannedAmountMinor: number;
  actualAmountMinor: number;
  remainingAmountMinor: number;
  usedPercent: number;
  alertThresholdPercent: number;
  status: BudgetUsageStatus;
  currency: string;
  budgetId?: EntityId;
}

export interface CreateBudgetInput {
  id: EntityId;
  context: TenantContext;
  now: ISODateTime;
  payload: CreateBudgetPayload;
  category?: Category;
}

export interface CreateBudgetPayload {
  categoryId: EntityId;
  periodStartOn: ISODate;
  periodEndOn?: ISODate;
  plannedAmountMinor: number;
  currency?: string;
  alertThresholdPercent?: number;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface UpdateBudgetInput {
  context: TenantContext;
  budget: Budget | undefined;
  now: ISODateTime;
  payload: UpdateBudgetPayload;
  category?: Category;
}

export interface UpdateBudgetPayload {
  status?: BudgetStatus;
  categoryId?: EntityId;
  periodStartOn?: ISODate;
  periodEndOn?: ISODate;
  plannedAmountMinor?: number;
  currency?: string;
  alertThresholdPercent?: number;
  organizationId?: EntityId;
  financialProfileId?: EntityId;
}

export interface ListBudgetsFilters {
  status?: BudgetStatus | "all";
  categoryId?: EntityId;
  activeOn?: ISODate;
  periodStartOn?: ISODate;
  periodEndOn?: ISODate;
}

export interface SummarizeBudgetUsageInput {
  context: TenantContext;
  budget: Budget | undefined;
  transactions: readonly Transaction[];
}

export interface SummarizeBudgetDashboardInput {
  context: TenantContext;
  budgets: readonly Budget[];
  transactions: readonly Transaction[];
  periodStartOn: ISODate;
  periodEndOn?: ISODate;
  currency?: string;
}

const ALLOWED_BUDGET_STATUSES: readonly BudgetStatus[] = ["active", "archived"];
const DEFAULT_ALERT_THRESHOLD_PERCENT = 80;
const REALIZED_TRANSACTION_STATUSES = ["posted", "reconciled"] as const;

export function getMonthlyBudgetPeriod(month: string): Pick<Budget, "periodStartOn" | "periodEndOn"> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new BudgetError("BUDGET_PERIOD_INVALID", "Budget month must use YYYY-MM format.");
  }

  const [year, monthNumber] = month.split("-").map(Number) as [number, number];

  if (monthNumber < 1 || monthNumber > 12) {
    throw new BudgetError("BUDGET_PERIOD_INVALID", "Budget month must be between 01 and 12.");
  }

  return {
    periodStartOn: formatDateParts(year, monthNumber, 1),
    periodEndOn: formatDateParts(year, monthNumber, getLastDayOfMonth(year, monthNumber)),
  };
}

export function createBudget(input: CreateBudgetInput): BudgetMutationResult {
  const payload = applyTenantScope(input.context, input.payload);
  const category = assertBudgetCategory(input.context, input.category, payload.categoryId);
  const period = normalizePeriod(payload.periodStartOn, payload.periodEndOn);
  const budget: Budget = {
    id: input.id,
    organizationId: payload.organizationId,
    financialProfileId: payload.financialProfileId,
    status: "active",
    categoryId: category.id,
    periodStartOn: period.periodStartOn,
    periodEndOn: period.periodEndOn,
    plannedAmountMinor: validatePlannedAmount(payload.plannedAmountMinor),
    currency: normalizeCurrency(payload.currency),
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
  };

  if (payload.alertThresholdPercent !== undefined) {
    budget.alertThresholdPercent = validateAlertThreshold(payload.alertThresholdPercent);
  }

  return {
    budget,
    auditEntry: buildBudgetAuditEntry("create", input.context.userId, input.now, undefined, budget),
  };
}

export function listBudgets(
  context: TenantContext,
  budgets: readonly Budget[],
  filters: ListBudgetsFilters = {},
): Budget[] {
  return listTenantScopedResources(context, budgets).filter((budget) => {
    const statusMatches =
      filters.status === undefined || filters.status === "all" || budget.status === filters.status;
    const categoryMatches = filters.categoryId === undefined || budget.categoryId === filters.categoryId;
    const activeOnMatches =
      filters.activeOn === undefined ||
      (budget.periodStartOn <= filters.activeOn && budget.periodEndOn >= filters.activeOn);
    const periodStartMatches =
      filters.periodStartOn === undefined || budget.periodEndOn >= filters.periodStartOn;
    const periodEndMatches =
      filters.periodEndOn === undefined || budget.periodStartOn <= filters.periodEndOn;

    return (
      statusMatches &&
      categoryMatches &&
      activeOnMatches &&
      periodStartMatches &&
      periodEndMatches
    );
  });
}

export function getBudget(context: TenantContext, budget: Budget | undefined): Budget {
  return getTenantScopedResource(context, budget);
}

export function updateBudget(input: UpdateBudgetInput): BudgetMutationResult {
  const currentBudget = updateTenantScopedResource(input.context, input.budget, input.payload);
  const nextCategoryId = input.payload.categoryId ?? currentBudget.categoryId;
  const category = assertBudgetCategory(input.context, input.category, nextCategoryId);
  const nextPeriodStartOn = input.payload.periodStartOn ?? currentBudget.periodStartOn;
  const nextPeriodEndOn = input.payload.periodEndOn ?? currentBudget.periodEndOn;
  const period = normalizePeriod(nextPeriodStartOn, nextPeriodEndOn);
  const updatedBudget: Budget = {
    ...currentBudget,
    ...buildOptionalBudgetUpdate(input.payload),
    categoryId: category.id,
    periodStartOn: period.periodStartOn,
    periodEndOn: period.periodEndOn,
    updatedAt: input.now,
    updatedByUserId: input.context.userId,
  };

  return {
    budget: updatedBudget,
    auditEntry: buildBudgetAuditEntry(
      "update",
      input.context.userId,
      input.now,
      currentBudget,
      updatedBudget,
    ),
  };
}

export function archiveBudget(
  context: TenantContext,
  budget: Budget | undefined,
  now: ISODateTime,
): BudgetMutationResult {
  const currentBudget = getTenantScopedResource(context, budget);
  const archivedBudget: Budget = {
    ...currentBudget,
    status: "archived",
    updatedAt: now,
    updatedByUserId: context.userId,
  };

  return {
    budget: archivedBudget,
    auditEntry: buildBudgetAuditEntry("update", context.userId, now, currentBudget, archivedBudget),
  };
}

export function summarizeBudgetUsage(input: SummarizeBudgetUsageInput): BudgetUsageSummary {
  const budget = getTenantScopedResource(input.context, input.budget);
  const actualAmountMinor = sumActualAmount(
    input.context,
    input.transactions,
    budget.categoryId,
    budget.periodStartOn,
    budget.periodEndOn,
  );

  return buildBudgetUsageSummary(budget, actualAmountMinor);
}

export function summarizeBudgetDashboard(input: SummarizeBudgetDashboardInput): BudgetUsageSummary[] {
  const period = normalizePeriod(input.periodStartOn, input.periodEndOn);
  const scopedBudgets = listBudgets(input.context, input.budgets, {
    status: "active",
    periodStartOn: period.periodStartOn,
    periodEndOn: period.periodEndOn,
  });
  const summaries = scopedBudgets.map((budget) =>
    buildBudgetUsageSummary(
      budget,
      sumActualAmount(
        input.context,
        input.transactions,
        budget.categoryId,
        budget.periodStartOn,
        budget.periodEndOn,
      ),
    ),
  );
  const budgetedCategoryIds = new Set(scopedBudgets.map((budget) => budget.categoryId));
  const unbudgetedAmounts = sumUnbudgetedActualAmounts(
    input.context,
    input.transactions,
    budgetedCategoryIds,
    period.periodStartOn,
    period.periodEndOn,
  );

  for (const [categoryId, actualAmountMinor] of unbudgetedAmounts) {
    summaries.push({
      categoryId,
      periodStartOn: period.periodStartOn,
      periodEndOn: period.periodEndOn,
      plannedAmountMinor: 0,
      actualAmountMinor,
      remainingAmountMinor: -actualAmountMinor,
      usedPercent: actualAmountMinor > 0 ? 100 : 0,
      alertThresholdPercent: DEFAULT_ALERT_THRESHOLD_PERCENT,
      status: "unbudgeted",
      currency: normalizeCurrency(input.currency),
    });
  }

  return summaries;
}

function buildOptionalBudgetUpdate(payload: UpdateBudgetPayload): Partial<Budget> {
  const update: Partial<Budget> = {};

  if (payload.status !== undefined) {
    update.status = validateBudgetStatus(payload.status);
  }

  if (payload.plannedAmountMinor !== undefined) {
    update.plannedAmountMinor = validatePlannedAmount(payload.plannedAmountMinor);
  }

  if (payload.currency !== undefined) {
    update.currency = normalizeCurrency(payload.currency);
  }

  if (payload.alertThresholdPercent !== undefined) {
    update.alertThresholdPercent = validateAlertThreshold(payload.alertThresholdPercent);
  }

  return update;
}

function buildBudgetUsageSummary(budget: Budget, actualAmountMinor: number): BudgetUsageSummary {
  const alertThresholdPercent = budget.alertThresholdPercent ?? DEFAULT_ALERT_THRESHOLD_PERCENT;
  const usedPercent = calculateUsedPercent(actualAmountMinor, budget.plannedAmountMinor);

  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    periodStartOn: budget.periodStartOn,
    periodEndOn: budget.periodEndOn,
    plannedAmountMinor: budget.plannedAmountMinor,
    actualAmountMinor,
    remainingAmountMinor: budget.plannedAmountMinor - actualAmountMinor,
    usedPercent,
    alertThresholdPercent,
    status: getBudgetUsageStatus(actualAmountMinor, budget.plannedAmountMinor, alertThresholdPercent),
    currency: budget.currency,
  };
}

function getBudgetUsageStatus(
  actualAmountMinor: number,
  plannedAmountMinor: number,
  alertThresholdPercent: number,
): BudgetUsageStatus {
  if (actualAmountMinor === 0) {
    return "no_activity";
  }

  if (plannedAmountMinor === 0 || actualAmountMinor > plannedAmountMinor) {
    return "exceeded";
  }

  const usedPercent = calculateUsedPercent(actualAmountMinor, plannedAmountMinor);

  if (usedPercent >= 100) {
    return "exceeded";
  }

  if (usedPercent >= alertThresholdPercent) {
    return "approaching";
  }

  return "on_track";
}

function calculateUsedPercent(actualAmountMinor: number, plannedAmountMinor: number): number {
  if (plannedAmountMinor === 0) {
    return actualAmountMinor > 0 ? 100 : 0;
  }

  return Math.round((actualAmountMinor / plannedAmountMinor) * 10000) / 100;
}

function sumActualAmount(
  context: TenantContext,
  transactions: readonly Transaction[],
  categoryId: EntityId,
  periodStartOn: ISODate,
  periodEndOn: ISODate,
): number {
  return listTenantScopedResources(context, transactions)
    .filter((transaction) => isBudgetTransaction(transaction, periodStartOn, periodEndOn))
    .filter((transaction) => transaction.categoryId === categoryId)
    .reduce((total, transaction) => total + transaction.amountMinor, 0);
}

function sumUnbudgetedActualAmounts(
  context: TenantContext,
  transactions: readonly Transaction[],
  budgetedCategoryIds: ReadonlySet<EntityId>,
  periodStartOn: ISODate,
  periodEndOn: ISODate,
): Map<EntityId, number> {
  const totals = new Map<EntityId, number>();

  for (const transaction of listTenantScopedResources(context, transactions)) {
    if (!isBudgetTransaction(transaction, periodStartOn, periodEndOn)) {
      continue;
    }

    if (transaction.categoryId === undefined || budgetedCategoryIds.has(transaction.categoryId)) {
      continue;
    }

    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + transaction.amountMinor);
  }

  return totals;
}

function isBudgetTransaction(
  transaction: Transaction,
  periodStartOn: ISODate,
  periodEndOn: ISODate,
): boolean {
  return (
    transaction.kind === "expense" &&
    REALIZED_TRANSACTION_STATUSES.includes(transaction.status as (typeof REALIZED_TRANSACTION_STATUSES)[number]) &&
    transaction.occurredOn >= periodStartOn &&
    transaction.occurredOn <= periodEndOn
  );
}

function assertBudgetCategory(
  context: TenantContext,
  category: Category | undefined,
  categoryId: EntityId | undefined,
): Category {
  if (categoryId === undefined || !categoryId.trim()) {
    throw new BudgetError("BUDGET_CATEGORY_REQUIRED", "Budget category is required.");
  }

  const scopedCategory = getTenantScopedResource(context, category);

  if (scopedCategory.id !== categoryId) {
    throw new BudgetError("BUDGET_CATEGORY_INVALID", "Budget category id does not match.");
  }

  if (scopedCategory.status !== "active") {
    throw new BudgetError("BUDGET_CATEGORY_ARCHIVED", "Budget category must be active.");
  }

  if (scopedCategory.kind !== "expense") {
    throw new BudgetError(
      "BUDGET_CATEGORY_KIND_INVALID",
      "Budget category must be an expense category in the MVP.",
    );
  }

  return scopedCategory;
}

function normalizePeriod(
  periodStartOn: ISODate,
  periodEndOn: ISODate | undefined,
): Pick<Budget, "periodStartOn" | "periodEndOn"> {
  const startOn = validateDate(periodStartOn);
  const endOn = periodEndOn ?? getMonthEnd(startOn);
  const normalizedEndOn = validateDate(endOn);

  if (normalizedEndOn < startOn) {
    throw new BudgetError("BUDGET_PERIOD_INVALID", "Budget period must end on or after it starts.");
  }

  return {
    periodStartOn: startOn,
    periodEndOn: normalizedEndOn,
  };
}

function validateBudgetStatus(status: BudgetStatus): BudgetStatus {
  if (!ALLOWED_BUDGET_STATUSES.includes(status)) {
    throw new BudgetError("BUDGET_STATUS_INVALID", "Budget status is not supported.");
  }

  return status;
}

function validatePlannedAmount(plannedAmountMinor: number): number {
  if (!Number.isInteger(plannedAmountMinor) || plannedAmountMinor < 0) {
    throw new BudgetError(
      "BUDGET_AMOUNT_INVALID",
      "Budget amount must be a non-negative integer minor-unit amount.",
    );
  }

  return plannedAmountMinor;
}

function validateAlertThreshold(alertThresholdPercent: number): number {
  if (
    !Number.isInteger(alertThresholdPercent) ||
    alertThresholdPercent < 1 ||
    alertThresholdPercent > 100
  ) {
    throw new BudgetError(
      "BUDGET_ALERT_THRESHOLD_INVALID",
      "Budget alert threshold must be an integer between 1 and 100.",
    );
  }

  return alertThresholdPercent;
}

function validateDate(date: ISODate): ISODate {
  if (!date.trim()) {
    throw new BudgetError("BUDGET_PERIOD_INVALID", "Budget period date is required.");
  }

  return date;
}

function normalizeCurrency(currency = "BRL"): string {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new BudgetError("BUDGET_CURRENCY_INVALID", "Budget currency must use ISO 4217 format.");
  }

  return normalizedCurrency;
}

function getMonthEnd(date: ISODate): ISODate {
  const [year, month] = date.split("-").map(Number) as [number, number];

  return formatDateParts(year, month, getLastDayOfMonth(year, month));
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDateParts(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildBudgetAuditEntry(
  action: "create" | "update",
  actorId: EntityId,
  occurredAt: ISODateTime,
  before: Budget | undefined,
  after: Budget,
): AuditLogEntryDraft {
  const auditEntry: AuditLogEntryDraft = {
    organizationId: after.organizationId,
    financialProfileId: after.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId,
    action,
    entityKind: "budget",
    entityId: after.id,
  };
  const redactedChanges = buildRedactedBudgetChanges(before, after);

  if (redactedChanges !== undefined) {
    auditEntry.redactedChanges = redactedChanges;
  }

  return auditEntry;
}

function buildRedactedBudgetChanges(
  before: Budget | undefined,
  after: Budget,
): Record<string, "changed" | "added" | "removed"> | undefined {
  const fields = [
    "status",
    "categoryId",
    "periodStartOn",
    "periodEndOn",
    "plannedAmountMinor",
    "currency",
    "alertThresholdPercent",
  ] as const satisfies readonly (keyof Budget)[];
  const changes: Record<string, "changed" | "added" | "removed"> = {};

  for (const field of fields) {
    const beforeValue = before?.[field];
    const afterValue = after[field];

    if (beforeValue === afterValue) {
      continue;
    }

    if (beforeValue === undefined) {
      changes[field] = "added";
      continue;
    }

    if (afterValue === undefined) {
      changes[field] = "removed";
      continue;
    }

    changes[field] = "changed";
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
