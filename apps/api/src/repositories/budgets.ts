import { randomUUID } from "node:crypto";

import {
  archiveBudget as archiveBudgetDomain,
  createBudget as createBudgetDomain,
  getBudget as getBudgetDomain,
  listBudgets as listBudgetsDomain,
  summarizeBudgetUsage as summarizeBudgetUsageDomain,
  updateBudget as updateBudgetDomain,
  type Budget,
  type BudgetMutationResult,
  type BudgetStatus,
  type BudgetUsageSummary,
  type Category,
  type CreateBudgetPayload,
  type EntityId,
  type ListBudgetsFilters,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionStatus,
  type UpdateBudgetPayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

interface BudgetRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  categoryId: string;
  status: string;
  periodStartOn: Date;
  periodEndOn: Date;
  plannedAmountMinor: number;
  currency: string;
  alertThresholdPercent: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

const BUDGET_COLUMNS = `"id", "organizationId", "financialProfileId", "categoryId", "status",
  "periodStartOn", "periodEndOn", "plannedAmountMinor", "currency", "alertThresholdPercent",
  "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

export async function listBudgetsForContext(
  context: TenantContext,
  filters: ListBudgetsFilters = {},
): Promise<Budget[]> {
  const rows = await query<BudgetRow>(
    `select ${BUDGET_COLUMNS} from "Budget"
     where "organizationId" = $1 and "financialProfileId" = $2 order by "periodStartOn" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return listBudgetsDomain(context, rows.map(mapBudgetRow), filters);
}

export async function getBudgetForContext(
  context: TenantContext,
  budgetId: EntityId,
): Promise<Budget> {
  return getBudgetDomain(context, await findBudgetRow(context, budgetId));
}

export async function createBudgetForContext(
  context: TenantContext,
  payload: CreateBudgetPayload,
): Promise<Budget> {
  const category = await findCategoryRow(context, payload.categoryId);
  const result = createBudgetDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(category ? { category } : {}),
  });

  await persistBudgetMutation(result);

  return result.budget;
}

export async function updateBudgetForContext(
  context: TenantContext,
  budgetId: EntityId,
  payload: UpdateBudgetPayload,
): Promise<Budget> {
  const currentBudget = await findBudgetRow(context, budgetId);
  const categoryId = payload.categoryId ?? currentBudget?.categoryId;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;
  const result = updateBudgetDomain({
    context,
    budget: currentBudget,
    now: new Date().toISOString(),
    payload,
    ...(category ? { category } : {}),
  });

  await persistBudgetMutation(result);

  return result.budget;
}

export async function archiveBudgetForContext(
  context: TenantContext,
  budgetId: EntityId,
): Promise<Budget> {
  const result = archiveBudgetDomain(
    context,
    await findBudgetRow(context, budgetId),
    new Date().toISOString(),
  );

  await persistBudgetMutation(result);

  return result.budget;
}

export async function summarizeBudgetUsageForContext(
  context: TenantContext,
  budgetId: EntityId,
): Promise<BudgetUsageSummary> {
  const budget = await findBudgetRow(context, budgetId);
  const transactions = budget
    ? await listTransactionsForCategoryPeriod(
        context,
        budget.categoryId,
        budget.periodStartOn,
        budget.periodEndOn,
      )
    : [];

  return summarizeBudgetUsageDomain({ context, budget, transactions });
}

async function persistBudgetMutation(result: BudgetMutationResult): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "Budget"
        ("id", "organizationId", "financialProfileId", "categoryId", "status", "periodStartOn",
         "periodEndOn", "plannedAmountMinor", "currency", "alertThresholdPercent", "createdAt", "updatedAt",
         "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict ("id") do update set
         "categoryId" = excluded."categoryId", "status" = excluded."status",
         "periodStartOn" = excluded."periodStartOn", "periodEndOn" = excluded."periodEndOn",
         "plannedAmountMinor" = excluded."plannedAmountMinor", "currency" = excluded."currency",
         "alertThresholdPercent" = excluded."alertThresholdPercent", "updatedAt" = excluded."updatedAt",
         "updatedByUserId" = excluded."updatedByUserId"`,
      [
        result.budget.id,
        result.budget.organizationId,
        result.budget.financialProfileId,
        result.budget.categoryId,
        result.budget.status.toUpperCase(),
        result.budget.periodStartOn,
        result.budget.periodEndOn,
        result.budget.plannedAmountMinor,
        result.budget.currency,
        result.budget.alertThresholdPercent ?? null,
        result.budget.createdAt,
        result.budget.updatedAt,
        result.budget.createdByUserId ?? null,
        result.budget.updatedByUserId ?? null,
      ],
    );
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });
}

async function listTransactionsForCategoryPeriod(
  context: TenantContext,
  categoryId: EntityId,
  periodStartOn: string,
  periodEndOn: string,
): Promise<Transaction[]> {
  const rows = await query<{
    id: string;
    organizationId: string;
    financialProfileId: string;
    accountId: string | null;
    categoryId: string | null;
    kind: string;
    status: string;
    source: string;
    amountMinor: number;
    currency: string;
    occurredOn: Date;
    plannedOn: Date;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `select "id", "organizationId", "financialProfileId", "accountId", "categoryId", "kind", "status",
            "source", "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdAt", "updatedAt"
     from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "categoryId" = $3
       and "occurredOn" >= $4 and "occurredOn" <= $5`,
    [context.organizationId, context.financialProfileId, categoryId, periodStartOn, periodEndOn],
  );

  return rows.map((row) => {
    const transaction: Transaction = {
      id: row.id,
      organizationId: row.organizationId,
      financialProfileId: row.financialProfileId,
      kind: row.kind.toLowerCase() as TransactionKind,
      status: row.status.toLowerCase() as TransactionStatus,
      source: row.source.toLowerCase() as Transaction["source"],
      amountMinor: row.amountMinor,
      currency: row.currency,
      occurredOn: row.occurredOn.toISOString().slice(0, 10),
      plannedOn: row.plannedOn.toISOString().slice(0, 10),
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };

    if (row.accountId !== null) transaction.accountId = row.accountId;
    if (row.categoryId !== null) transaction.categoryId = row.categoryId;

    return transaction;
  });
}

async function findBudgetRow(
  context: TenantContext,
  budgetId: EntityId,
): Promise<Budget | undefined> {
  const rows = await query<BudgetRow>(
    `select ${BUDGET_COLUMNS} from "Budget" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [budgetId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapBudgetRow(rows[0]) : undefined;
}

async function findCategoryRow(
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category | undefined> {
  const rows = await query<{
    id: string;
    organizationId: string;
    financialProfileId: string;
    parentCategoryId: string | null;
    name: string;
    kind: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `select "id", "organizationId", "financialProfileId", "parentCategoryId", "name", "kind", "status",
            "createdAt", "updatedAt"
     from "Category" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [categoryId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const category: Category = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as Category["kind"],
    status: row.status.toLowerCase() as Category["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.parentCategoryId !== null) {
    category.parentCategoryId = row.parentCategoryId;
  }

  return category;
}

function mapBudgetRow(row: BudgetRow): Budget {
  const budget: Budget = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    status: row.status.toLowerCase() as BudgetStatus,
    categoryId: row.categoryId,
    periodStartOn: row.periodStartOn.toISOString().slice(0, 10),
    periodEndOn: row.periodEndOn.toISOString().slice(0, 10),
    plannedAmountMinor: row.plannedAmountMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.alertThresholdPercent !== null) budget.alertThresholdPercent = row.alertThresholdPercent;
  if (row.createdByUserId !== null) budget.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) budget.updatedByUserId = row.updatedByUserId;

  return budget;
}
