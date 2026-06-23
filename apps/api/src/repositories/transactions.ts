import { randomUUID } from "node:crypto";

import {
  createTransaction as createTransactionDomain,
  getTransaction as getTransactionDomain,
  listTransactions as listTransactionsDomain,
  updateTransaction as updateTransactionDomain,
  voidTransaction as voidTransactionDomain,
  type Account,
  type Category,
  type CreateTransactionPayload,
  type EntityId,
  type ListTransactionsFilters,
  type Transaction,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
  type TenantContext,
  type UpdateTransactionPayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

interface TransactionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  cardId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  importBatchId: string | null;
  aiSuggestionId: string | null;
  transferGroupId: string | null;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  effectiveOn: Date | null;
  description: string;
  reconciledAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

interface AccountRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  name: string;
  kind: string;
  status: string;
  currency: string;
  openingBalanceMinor: number;
  maskedIdentifier: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  parentCategoryId: string | null;
  name: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
  "categoryId", "cardId", "invoiceId", "recurrenceId", "installmentId", "importBatchId", "aiSuggestionId",
  "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
  "effectiveOn", "description", "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

export async function listTransactionsForContext(
  context: TenantContext,
  filters: ListTransactionsFilters = {},
): Promise<Transaction[]> {
  const rows = await query<TransactionRow>(
    `select ${SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "plannedOn" desc, "effectiveOn" desc nulls last, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return listTransactionsDomain(context, rows.map(mapTransactionRow), filters);
}

export async function getTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
): Promise<Transaction> {
  const transaction = await findTransactionRow(context, transactionId);

  return getTransactionDomain(context, transaction);
}

export async function createTransactionForContext(
  context: TenantContext,
  payload: CreateTransactionPayload,
): Promise<Transaction> {
  const account = await findAccountRow(context, payload.accountId);
  const destinationAccount = payload.destinationAccountId
    ? await findAccountRow(context, payload.destinationAccountId)
    : undefined;
  const category = payload.categoryId
    ? await findCategoryRow(context, payload.categoryId)
    : undefined;

  const result = createTransactionDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(destinationAccount ? { destinationAccount } : {}),
    ...(category ? { category } : {}),
  });

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildInsertTransactionSql(), buildTransactionParams(result.transaction));
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return result.transaction;
}

export async function updateTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
  payload: UpdateTransactionPayload,
): Promise<Transaction> {
  const currentTransaction = await findTransactionRow(context, transactionId);
  const accountId = payload.accountId ?? currentTransaction?.accountId;
  const destinationAccountId =
    payload.destinationAccountId ?? currentTransaction?.destinationAccountId;
  const categoryId = payload.categoryId ?? currentTransaction?.categoryId;

  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const destinationAccount = destinationAccountId
    ? await findAccountRow(context, destinationAccountId)
    : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;

  const result = updateTransactionDomain({
    context,
    transaction: currentTransaction,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(destinationAccount ? { destinationAccount } : {}),
    ...(category ? { category } : {}),
  });

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildUpdateTransactionSql(), buildTransactionParams(result.transaction));
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return result.transaction;
}

export async function voidTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
): Promise<Transaction> {
  const currentTransaction = await findTransactionRow(context, transactionId);
  const result = voidTransactionDomain(context, currentTransaction, new Date().toISOString());

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildUpdateTransactionSql(), buildTransactionParams(result.transaction));
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return result.transaction;
}

function buildInsertTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId",
     "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
     "effectiveOn", "description", "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`;
}

function buildUpdateTransactionSql(): string {
  return `update "Transaction" set
      "accountId" = $4, "destinationAccountId" = $5, "categoryId" = $6, "transferGroupId" = $7,
      "kind" = $8, "status" = $9, "source" = $10, "amountMinor" = $11, "currency" = $12,
      "occurredOn" = $13, "plannedOn" = $14, "effectiveOn" = $15, "description" = $16,
      "reconciledAt" = $17, "voidedAt" = $18, "createdAt" = $19, "updatedAt" = $20,
      "createdByUserId" = $21, "updatedByUserId" = $22
    where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`;
}

function buildTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.destinationAccountId ?? null,
    transaction.categoryId ?? null,
    transaction.transferGroupId ?? null,
    transaction.kind.toUpperCase(),
    transaction.status.toUpperCase(),
    transaction.source.toUpperCase(),
    transaction.amountMinor,
    transaction.currency,
    transaction.occurredOn,
    transaction.plannedOn,
    transaction.effectiveOn ?? null,
    transaction.description,
    transaction.reconciledAt ?? null,
    transaction.voidedAt ?? null,
    transaction.createdAt,
    transaction.updatedAt,
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
  ];
}

async function findTransactionRow(
  context: TenantContext,
  transactionId: EntityId,
): Promise<Transaction | undefined> {
  const rows = await query<TransactionRow>(
    `select ${SELECT_COLUMNS} from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [transactionId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapTransactionRow(rows[0]) : undefined;
}

async function findAccountRow(
  context: TenantContext,
  accountId: EntityId,
): Promise<Account | undefined> {
  const rows = await query<AccountRow>(
    `select "id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
            "openingBalanceMinor", "maskedIdentifier", "createdAt", "updatedAt"
     from "Account" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const account: Account = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as Account["kind"],
    status: row.status.toLowerCase() as Account["status"],
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.maskedIdentifier !== null) {
    account.maskedIdentifier = row.maskedIdentifier;
  }

  return account;
}

async function findCategoryRow(
  context: TenantContext,
  categoryId: EntityId,
): Promise<Category | undefined> {
  const rows = await query<CategoryRow>(
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

function mapTransactionRow(row: TransactionRow): Transaction {
  const transaction: Transaction = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as TransactionKind,
    status: row.status.toLowerCase() as TransactionStatus,
    source: row.source.toLowerCase() as TransactionSource,
    amountMinor: row.amountMinor,
    currency: row.currency,
    occurredOn: toDateOnly(row.occurredOn),
    plannedOn: toDateOnly(row.plannedOn),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.effectiveOn !== null) transaction.effectiveOn = toDateOnly(row.effectiveOn);
  if (row.accountId !== null) transaction.accountId = row.accountId;
  if (row.destinationAccountId !== null)
    transaction.destinationAccountId = row.destinationAccountId;
  if (row.categoryId !== null) transaction.categoryId = row.categoryId;
  if (row.cardId !== null) transaction.cardId = row.cardId;
  if (row.invoiceId !== null) transaction.invoiceId = row.invoiceId;
  if (row.recurrenceId !== null) transaction.recurrenceId = row.recurrenceId;
  if (row.installmentId !== null) transaction.installmentId = row.installmentId;
  if (row.importBatchId !== null) transaction.importBatchId = row.importBatchId;
  if (row.aiSuggestionId !== null) transaction.aiSuggestionId = row.aiSuggestionId;
  if (row.transferGroupId !== null) transaction.transferGroupId = row.transferGroupId;
  if (row.reconciledAt !== null) transaction.reconciledAt = row.reconciledAt.toISOString();
  if (row.voidedAt !== null) transaction.voidedAt = row.voidedAt.toISOString();
  if (row.createdByUserId !== null) transaction.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) transaction.updatedByUserId = row.updatedByUserId;

  return transaction;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
