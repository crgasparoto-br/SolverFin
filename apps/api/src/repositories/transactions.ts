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
  note: string | null;
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

interface RecurrenceScheduleRow {
  frequency: string;
  interval: number;
}

interface InstallmentSequenceRow {
  sequenceNumber: number;
}

type TransactionWithNote = Transaction & { note?: string };
type CreateTransactionPayloadWithMetadata = CreateTransactionPayload & { description?: string };
type UpdateTransactionPayloadWithMetadata = UpdateTransactionPayload & { description?: string };

type TransactionMetadata = {
  note?: string;
  applyToFuturePlanned?: boolean;
};

const TRANSACTION_METADATA_PREFIX = "\n\n[[solverfin:transaction-meta:";
const TRANSACTION_METADATA_SUFFIX = "]]";
const SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
  "categoryId", "cardId", "invoiceId", "recurrenceId", "installmentId", "importBatchId", "aiSuggestionId",
  "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
  "effectiveOn", "description", "note", "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

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
  payload: CreateTransactionPayloadWithMetadata,
): Promise<Transaction> {
  const prepared = prepareTransactionPayload(payload);
  const account = await findAccountRow(context, prepared.payload.accountId);
  const destinationAccount = prepared.payload.destinationAccountId
    ? await findAccountRow(context, prepared.payload.destinationAccountId)
    : undefined;
  const category = prepared.payload.categoryId
    ? await findCategoryRow(context, prepared.payload.categoryId)
    : undefined;

  const result = createTransactionDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload: prepared.payload,
    ...(account ? { account } : {}),
    ...(destinationAccount ? { destinationAccount } : {}),
    ...(category ? { category } : {}),
  });
  const transaction = attachNote(result.transaction, prepared.note);

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildInsertTransactionSql(), buildTransactionParams(transaction));
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return transaction;
}

export async function updateTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
  payload: UpdateTransactionPayloadWithMetadata,
): Promise<Transaction> {
  const currentTransaction = await findTransactionRow(context, transactionId);
  const prepared = prepareTransactionPayload(payload, getTransactionNote(currentTransaction));
  const accountId = prepared.payload.accountId ?? currentTransaction?.accountId;
  const destinationAccountId =
    prepared.payload.destinationAccountId ?? currentTransaction?.destinationAccountId;
  const categoryId = prepared.payload.categoryId ?? currentTransaction?.categoryId;

  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const destinationAccount = destinationAccountId
    ? await findAccountRow(context, destinationAccountId)
    : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;

  const result = updateTransactionDomain({
    context,
    transaction: currentTransaction,
    now: new Date().toISOString(),
    payload: prepared.payload,
    ...(account ? { account } : {}),
    ...(destinationAccount ? { destinationAccount } : {}),
    ...(category ? { category } : {}),
  });
  const transaction = attachNote(result.transaction, prepared.note);

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildUpdateTransactionSql(), buildTransactionParams(transaction));
    await syncInstallmentFromTransaction(executeQuery, context, transaction);
    await insertAuditLogEntry(executeQuery, result.auditEntry);

    if (prepared.metadata.applyToFuturePlanned === true) {
      await updateFuturePlannedTransactions(executeQuery, context, currentTransaction, transaction);
    }
  });

  return transaction;
}

export async function voidTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
): Promise<Transaction> {
  const currentTransaction = await findTransactionRow(context, transactionId);
  const result = voidTransactionDomain(context, currentTransaction, new Date().toISOString());
  const transaction = attachNote(result.transaction, getTransactionNote(currentTransaction));

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildUpdateTransactionSql(), buildTransactionParams(transaction));
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });

  return transaction;
}

function buildInsertTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId",
     "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
     "effectiveOn", "description", "note", "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`;
}

function buildUpdateTransactionSql(): string {
  return `update "Transaction" set
      "accountId" = $4, "destinationAccountId" = $5, "categoryId" = $6, "transferGroupId" = $7,
      "kind" = $8, "status" = $9, "source" = $10, "amountMinor" = $11, "currency" = $12,
      "occurredOn" = $13, "plannedOn" = $14, "effectiveOn" = $15, "description" = $16,
      "note" = $17, "reconciledAt" = $18, "voidedAt" = $19, "createdAt" = $20, "updatedAt" = $21,
      "createdByUserId" = $22, "updatedByUserId" = $23
    where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`;
}

function buildTransactionParams(transaction: TransactionWithNote): unknown[] {
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
    transaction.note ?? null,
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
  const transaction: TransactionWithNote = {
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

  if (row.note !== null) transaction.note = row.note;
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

function prepareTransactionPayload<TPayload extends { description?: string }>(
  payload: TPayload,
  fallbackNote?: string,
): { payload: TPayload; metadata: TransactionMetadata; note?: string } {
  const parsed = parseTransactionMetadata(payload.description);
  const nextPayload = { ...payload };

  if (parsed.description !== undefined) {
    nextPayload.description = parsed.description;
  }

  return {
    payload: nextPayload,
    metadata: parsed.metadata,
    note: parsed.metadata.note !== undefined ? normalizeOptionalText(parsed.metadata.note) : fallbackNote,
  };
}

function parseTransactionMetadata(description: string | undefined): {
  description?: string;
  metadata: TransactionMetadata;
} {
  if (description === undefined) {
    return { metadata: {} };
  }

  const markerIndex = description.lastIndexOf(TRANSACTION_METADATA_PREFIX);

  if (markerIndex < 0 || !description.endsWith(TRANSACTION_METADATA_SUFFIX)) {
    return { description, metadata: {} };
  }

  const encodedMetadata = description.slice(
    markerIndex + TRANSACTION_METADATA_PREFIX.length,
    -TRANSACTION_METADATA_SUFFIX.length,
  );

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedMetadata)) as TransactionMetadata;

    return {
      description: description.slice(0, markerIndex),
      metadata: {
        ...(typeof parsed.note === "string" ? { note: parsed.note } : {}),
        ...(parsed.applyToFuturePlanned === true ? { applyToFuturePlanned: true } : {}),
      },
    };
  } catch {
    return { description, metadata: {} };
  }
}

function attachNote(transaction: Transaction, note: string | undefined): TransactionWithNote {
  const transactionWithNote: TransactionWithNote = { ...transaction };

  if (note !== undefined) {
    transactionWithNote.note = note;
  }

  return transactionWithNote;
}

function getTransactionNote(transaction: Transaction | undefined): string | undefined {
  return (transaction as TransactionWithNote | undefined)?.note;
}

function normalizeOptionalText(value: string): string | undefined {
  const normalized = value.trim();

  return normalized ? normalized : undefined;
}

async function updateFuturePlannedTransactions(
  executeQuery: typeof query,
  context: TenantContext,
  currentTransaction: Transaction | undefined,
  updatedTransaction: TransactionWithNote,
): Promise<void> {
  if (!currentTransaction?.recurrenceId) {
    return;
  }

  const futureRows = await executeQuery<TransactionRow>(
    `select ${SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "recurrenceId" = $3
       and "status" = 'PLANNED' and "plannedOn" > $4
     order by "plannedOn" asc, "createdAt" asc`,
    [
      context.organizationId,
      context.financialProfileId,
      currentTransaction.recurrenceId,
      currentTransaction.plannedOn,
    ],
  );

  const schedule = await readRecurrenceSchedule(
    executeQuery,
    context,
    currentTransaction.recurrenceId,
  );
  const shouldRecalculateDates = updatedTransaction.plannedOn !== currentTransaction.plannedOn;
  const note = getTransactionNote(updatedTransaction) ?? null;
  const now = updatedTransaction.updatedAt;

  await updateRecurrenceRuleFromTransaction(
    executeQuery,
    context,
    currentTransaction,
    updatedTransaction,
    schedule,
  );

  for (const [index, row] of futureRows.entries()) {
    const plannedOn = shouldRecalculateDates
      ? addFrequency(updatedTransaction.plannedOn, schedule.frequency, index + 1, schedule.interval)
      : toDateOnly(row.plannedOn);

    await executeQuery(
      `update "Transaction" set
        "accountId" = $4, "destinationAccountId" = $5, "categoryId" = $6,
        "kind" = $7, "amountMinor" = $8, "currency" = $9,
        "occurredOn" = $10, "plannedOn" = $11, "effectiveOn" = null,
        "description" = $12, "note" = $13, "updatedAt" = $14, "updatedByUserId" = $15
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        row.id,
        context.organizationId,
        context.financialProfileId,
        updatedTransaction.accountId ?? null,
        updatedTransaction.destinationAccountId ?? null,
        updatedTransaction.categoryId ?? null,
        updatedTransaction.kind.toUpperCase(),
        updatedTransaction.amountMinor,
        updatedTransaction.currency,
        plannedOn,
        plannedOn,
        updatedTransaction.description,
        note,
        now,
        context.userId,
      ],
    );

    await syncInstallmentById(
      executeQuery,
      context,
      row.installmentId,
      plannedOn,
      updatedTransaction.amountMinor,
      updatedTransaction.currency,
      now,
    );
  }
}

async function readRecurrenceSchedule(
  executeQuery: typeof query,
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<{ frequency: string; interval: number }> {
  const rows = await executeQuery<RecurrenceScheduleRow>(
    `select "frequency", "interval" from "Recurrence"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [recurrenceId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  return {
    frequency: row?.frequency.toLowerCase() ?? "monthly",
    interval: row?.interval ?? 1,
  };
}

async function updateRecurrenceRuleFromTransaction(
  executeQuery: typeof query,
  context: TenantContext,
  currentTransaction: Transaction,
  updatedTransaction: TransactionWithNote,
  schedule: { frequency: string; interval: number },
): Promise<void> {
  if (!currentTransaction.recurrenceId) {
    return;
  }

  const sequenceNumber = await readInstallmentSequence(
    executeQuery,
    context,
    currentTransaction.installmentId,
  );
  const startOn =
    updatedTransaction.plannedOn !== currentTransaction.plannedOn
      ? addFrequency(
          updatedTransaction.plannedOn,
          schedule.frequency,
          -(Math.max(1, sequenceNumber ?? 1) - 1),
          schedule.interval,
        )
      : undefined;

  await executeQuery(
    `update "Recurrence" set
      "accountId" = $4, "categoryId" = $5, "kind" = $6, "amountMinor" = $7,
      "currency" = $8, "description" = $9,
      "startOn" = coalesce($10, "startOn"), "updatedAt" = $11, "updatedByUserId" = $12
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      currentTransaction.recurrenceId,
      context.organizationId,
      context.financialProfileId,
      updatedTransaction.accountId ?? null,
      updatedTransaction.categoryId ?? null,
      updatedTransaction.kind.toUpperCase(),
      updatedTransaction.amountMinor,
      updatedTransaction.currency,
      updatedTransaction.description,
      startOn ?? null,
      updatedTransaction.updatedAt,
      context.userId,
    ],
  );
}

async function readInstallmentSequence(
  executeQuery: typeof query,
  context: TenantContext,
  installmentId: EntityId | undefined,
): Promise<number | undefined> {
  if (!installmentId) {
    return undefined;
  }

  const rows = await executeQuery<InstallmentSequenceRow>(
    `select "sequenceNumber" from "Installment"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [installmentId, context.organizationId, context.financialProfileId],
  );

  return rows[0]?.sequenceNumber;
}

async function syncInstallmentFromTransaction(
  executeQuery: typeof query,
  context: TenantContext,
  transaction: Transaction,
): Promise<void> {
  await syncInstallmentById(
    executeQuery,
    context,
    transaction.installmentId,
    transaction.plannedOn,
    transaction.amountMinor,
    transaction.currency,
    transaction.updatedAt,
  );
}

async function syncInstallmentById(
  executeQuery: typeof query,
  context: TenantContext,
  installmentId: EntityId | undefined | null,
  dueOn: string,
  amountMinor: number,
  currency: string,
  updatedAt: string,
): Promise<void> {
  if (!installmentId) {
    return;
  }

  await executeQuery(
    `update "Installment" set "dueOn" = $4, "amountMinor" = $5, "currency" = $6, "updatedAt" = $7
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [installmentId, context.organizationId, context.financialProfileId, dueOn, amountMinor, currency, updatedAt],
  );
}

function addFrequency(startOn: string, frequency: string, offset: number, interval = 1): string {
  const steps = offset * interval;

  if (frequency === "daily") {
    return addDays(startOn, steps);
  }

  if (frequency === "weekly") {
    return addDays(startOn, steps * 7);
  }

  if (frequency === "yearly") {
    return addMonths(startOn, steps * 12);
  }

  return addMonths(startOn, steps);
}

function addDays(startOn: string, days: number): string {
  const date = parseDate(startOn);
  date.setUTCDate(date.getUTCDate() + days);

  return toIsoDate(date);
}

function addMonths(startOn: string, months: number): string {
  const [year, month, day] = startOn.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const targetMonth = normalizedMonthIndex + 1;
  const lastDay = getLastDayOfMonth(targetYear, targetMonth);
  const targetDay = isLastDayOfMonth(year, month, day) ? lastDay : Math.min(day, lastDay);

  return toIsoDate(new Date(Date.UTC(targetYear, normalizedMonthIndex, targetDay)));
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isLastDayOfMonth(year: number, month: number, day: number): boolean {
  return day === getLastDayOfMonth(year, month);
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
