import { randomUUID } from "node:crypto";

import {
  cancelPayableReceivable as cancelPayableReceivableDomain,
  createPayableReceivable as createPayableReceivableDomain,
  getPayableReceivable as getPayableReceivableDomain,
  listPayableReceivables as listPayableReceivablesDomain,
  settlePayableReceivable as settlePayableReceivableDomain,
  updatePayableReceivable as updatePayableReceivableDomain,
  type Account,
  type Category,
  type CreatePayableReceivablePayload,
  type EntityId,
  type ListPayableReceivablesFilters,
  type PayableReceivable,
  type PayableReceivableKind,
  type PayableReceivableStatus,
  type SettlePayableReceivablePayload,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
  type UpdatePayableReceivablePayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

interface PayableReceivableRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  categoryId: string | null;
  settlementTransactionId: string | null;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  dueOn: Date;
  description: string;
  settledAt: Date | null;
  cancelledAt: Date | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  description: string;
  reconciledAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "categoryId",
  "settlementTransactionId", "kind", "status", "amountMinor", "currency", "dueOn", "description",
  "settledAt", "cancelledAt", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"`;

const TRANSACTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
  "categoryId", "cardId", "invoiceId", "recurrenceId", "installmentId", "importBatchId", "aiSuggestionId",
  "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "description",
  "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

export async function listPayableReceivablesForContext(
  context: TenantContext,
  filters: ListPayableReceivablesFilters = {},
): Promise<PayableReceivable[]> {
  const rows = await query<PayableReceivableRow>(
    `select ${SELECT_COLUMNS} from "PayableReceivable"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "dueOn" asc, "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return listPayableReceivablesDomain(context, rows.map(mapPayableReceivableRow), filters);
}

export async function getPayableReceivableForContext(
  context: TenantContext,
  payableReceivableId: EntityId,
): Promise<PayableReceivable> {
  return getPayableReceivableDomain(
    context,
    await findPayableReceivableRow(context, payableReceivableId),
  );
}

export async function createPayableReceivableForContext(
  context: TenantContext,
  payload: CreatePayableReceivablePayload,
): Promise<PayableReceivable> {
  const account = payload.accountId ? await findAccountRow(context, payload.accountId) : undefined;
  const category = payload.categoryId
    ? await findCategoryRow(context, payload.categoryId)
    : undefined;
  const result = createPayableReceivableDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
  });

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      buildInsertPayableReceivableSql(),
      buildPayableReceivableParams(result.payableReceivable),
    );
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return result.payableReceivable;
}

export async function updatePayableReceivableForContext(
  context: TenantContext,
  payableReceivableId: EntityId,
  payload: UpdatePayableReceivablePayload,
): Promise<PayableReceivable> {
  const currentPayableReceivable = await findPayableReceivableRow(context, payableReceivableId);
  const accountId = payload.accountId ?? currentPayableReceivable?.accountId;
  const categoryId = payload.categoryId ?? currentPayableReceivable?.categoryId;
  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;
  const result = updatePayableReceivableDomain({
    context,
    payableReceivable: currentPayableReceivable,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
  });

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      buildUpdatePayableReceivableSql(),
      buildPayableReceivableParams(result.payableReceivable),
    );
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return result.payableReceivable;
}

export async function cancelPayableReceivableForContext(
  context: TenantContext,
  payableReceivableId: EntityId,
): Promise<PayableReceivable> {
  const result = cancelPayableReceivableDomain(
    context,
    await findPayableReceivableRow(context, payableReceivableId),
    new Date().toISOString(),
  );

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      buildUpdatePayableReceivableSql(),
      buildPayableReceivableParams(result.payableReceivable),
    );
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return result.payableReceivable;
}

export async function settlePayableReceivableForContext(
  context: TenantContext,
  payableReceivableId: EntityId,
  payload: SettlePayableReceivablePayload,
): Promise<{ payableReceivable: PayableReceivable; transaction: Transaction }> {
  const currentPayableReceivable = await findPayableReceivableRow(context, payableReceivableId);
  const accountId = payload.accountId ?? currentPayableReceivable?.accountId;
  const categoryId = payload.categoryId ?? currentPayableReceivable?.categoryId;
  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;
  const existingTransaction = payload.existingTransactionId
    ? await findTransactionRow(context, payload.existingTransactionId)
    : undefined;
  const result = settlePayableReceivableDomain({
    transactionId: randomUUID(),
    context,
    payableReceivable: currentPayableReceivable,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
    ...(existingTransaction ? { existingTransaction } : {}),
  });

  await withTransaction(async (executeQuery) => {
    if (payload.existingTransactionId === undefined) {
      await executeQuery(buildInsertTransactionSql(), buildTransactionParams(result.transaction));
    }

    await executeQuery(
      buildUpdatePayableReceivableSql(),
      buildPayableReceivableParams(result.payableReceivable),
    );

    for (const auditEntry of result.auditEntries) {
      await insertAuditLogEntry(executeQuery, auditEntry);
    }
  });

  return {
    payableReceivable: result.payableReceivable,
    transaction: result.transaction,
  };
}

function buildInsertPayableReceivableSql(): string {
  return `insert into "PayableReceivable"
    ("id", "organizationId", "financialProfileId", "accountId", "categoryId", "settlementTransactionId",
     "kind", "status", "amountMinor", "currency", "dueOn", "description", "settledAt", "cancelledAt",
     "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`;
}

function buildUpdatePayableReceivableSql(): string {
  return `update "PayableReceivable" set
      "accountId" = $4, "categoryId" = $5, "settlementTransactionId" = $6, "kind" = $7,
      "status" = $8, "amountMinor" = $9, "currency" = $10, "dueOn" = $11, "description" = $12,
      "settledAt" = $13, "cancelledAt" = $14, "updatedByUserId" = $16, "updatedAt" = $18
    where "id" = $1`;
}

function buildPayableReceivableParams(payableReceivable: PayableReceivable): unknown[] {
  return [
    payableReceivable.id,
    payableReceivable.organizationId,
    payableReceivable.financialProfileId,
    payableReceivable.accountId ?? null,
    payableReceivable.categoryId ?? null,
    payableReceivable.settlementTransactionId ?? null,
    payableReceivable.kind.toUpperCase(),
    payableReceivable.status.toUpperCase(),
    payableReceivable.amountMinor,
    payableReceivable.currency,
    payableReceivable.dueOn,
    payableReceivable.description,
    payableReceivable.settledAt ?? null,
    payableReceivable.cancelledAt ?? null,
    payableReceivable.createdByUserId ?? null,
    payableReceivable.updatedByUserId ?? null,
    payableReceivable.createdAt,
    payableReceivable.updatedAt,
  ];
}

function buildInsertTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "categoryId", "kind", "status",
     "source", "amountMinor", "currency", "occurredOn", "description", "createdAt", "updatedAt",
     "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`;
}

function buildTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.categoryId ?? null,
    transaction.kind.toUpperCase(),
    transaction.status.toUpperCase(),
    transaction.source.toUpperCase(),
    transaction.amountMinor,
    transaction.currency,
    transaction.occurredOn,
    transaction.description,
    transaction.createdAt,
    transaction.updatedAt,
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
  ];
}

async function findPayableReceivableRow(
  context: TenantContext,
  payableReceivableId: EntityId,
): Promise<PayableReceivable | undefined> {
  const rows = await query<PayableReceivableRow>(
    `select ${SELECT_COLUMNS} from "PayableReceivable"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [payableReceivableId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapPayableReceivableRow(rows[0]) : undefined;
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

async function findTransactionRow(
  context: TenantContext,
  transactionId: EntityId,
): Promise<Transaction | undefined> {
  const rows = await query<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [transactionId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapTransactionRow(rows[0]) : undefined;
}

function mapPayableReceivableRow(row: PayableReceivableRow): PayableReceivable {
  const payableReceivable: PayableReceivable = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as PayableReceivableKind,
    status: row.status.toLowerCase() as PayableReceivableStatus,
    amountMinor: row.amountMinor,
    currency: row.currency,
    dueOn: toDateOnly(row.dueOn),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.accountId !== null) {
    payableReceivable.accountId = row.accountId;
  }

  if (row.categoryId !== null) {
    payableReceivable.categoryId = row.categoryId;
  }

  if (row.settlementTransactionId !== null) {
    payableReceivable.settlementTransactionId = row.settlementTransactionId;
  }

  if (row.settledAt !== null) {
    payableReceivable.settledAt = row.settledAt.toISOString();
  }

  if (row.cancelledAt !== null) {
    payableReceivable.cancelledAt = row.cancelledAt.toISOString();
  }

  if (row.createdByUserId !== null) {
    payableReceivable.createdByUserId = row.createdByUserId;
  }

  if (row.updatedByUserId !== null) {
    payableReceivable.updatedByUserId = row.updatedByUserId;
  }

  return payableReceivable;
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
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.accountId !== null) {
    transaction.accountId = row.accountId;
  }

  if (row.destinationAccountId !== null) {
    transaction.destinationAccountId = row.destinationAccountId;
  }

  if (row.categoryId !== null) {
    transaction.categoryId = row.categoryId;
  }

  if (row.cardId !== null) {
    transaction.cardId = row.cardId;
  }

  if (row.invoiceId !== null) {
    transaction.invoiceId = row.invoiceId;
  }

  if (row.recurrenceId !== null) {
    transaction.recurrenceId = row.recurrenceId;
  }

  if (row.installmentId !== null) {
    transaction.installmentId = row.installmentId;
  }

  if (row.importBatchId !== null) {
    transaction.importBatchId = row.importBatchId;
  }

  if (row.aiSuggestionId !== null) {
    transaction.aiSuggestionId = row.aiSuggestionId;
  }

  if (row.transferGroupId !== null) {
    transaction.transferGroupId = row.transferGroupId;
  }

  if (row.reconciledAt !== null) {
    transaction.reconciledAt = row.reconciledAt.toISOString();
  }

  if (row.voidedAt !== null) {
    transaction.voidedAt = row.voidedAt.toISOString();
  }

  if (row.createdByUserId !== null) {
    transaction.createdByUserId = row.createdByUserId;
  }

  if (row.updatedByUserId !== null) {
    transaction.updatedByUserId = row.updatedByUserId;
  }

  return transaction;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
