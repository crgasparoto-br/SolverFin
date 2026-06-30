import { randomUUID } from "node:crypto";

import {
  cancelRecurrence as cancelRecurrenceDomain,
  createRecurrence as createRecurrenceDomain,
  generateRecurrenceInstallments as generateRecurrenceInstallmentsDomain,
  getRecurrence as getRecurrenceDomain,
  listRecurrences as listRecurrencesDomain,
  pauseRecurrence as pauseRecurrenceDomain,
  resumeRecurrence as resumeRecurrenceDomain,
  updateRecurrence as updateRecurrenceDomain,
  type Account,
  type Card,
  type Category,
  type CreateRecurrencePayload,
  type EntityId,
  type GenerateRecurrenceInstallmentsResult,
  type Installment,
  type InstallmentStatus,
  type ISODate,
  type ListRecurrencesFilters,
  type Recurrence,
  type RecurrenceFrequency,
  type RecurrenceMutationResult,
  type RecurrenceStatus,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type UpdateRecurrencePayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { registerCardPurchaseForContext } from "./cards.js";

interface RecurrenceRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  cardId: string | null;
  categoryId: string | null;
  status: string;
  kind: string;
  frequency: string;
  interval: number;
  startOn: Date;
  endOn: Date | null;
  amountMinor: number;
  currency: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

interface InstallmentRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  recurrenceId: string | null;
  cardId: string | null;
  status: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: Date;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const RECURRENCE_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "cardId", "categoryId",
  "status", "kind", "frequency", "interval", "startOn", "endOn", "amountMinor", "currency", "description",
  "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

const INSTALLMENT_COLUMNS = `"id", "organizationId", "financialProfileId", "recurrenceId", "cardId",
  "status", "sequenceNumber", "totalInstallments", "dueOn", "amountMinor", "currency", "createdAt", "updatedAt"`;

export async function listRecurrencesForContext(
  context: TenantContext,
  filters: ListRecurrencesFilters = {},
): Promise<Recurrence[]> {
  const rows = await query<RecurrenceRow>(
    `select ${RECURRENCE_COLUMNS} from "Recurrence"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "startOn" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return listRecurrencesDomain(context, rows.map(mapRecurrenceRow), filters);
}

export async function getRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<Recurrence> {
  return getRecurrenceDomain(context, await findRecurrenceRow(context, recurrenceId));
}

export async function createRecurrenceForContext(
  context: TenantContext,
  payload: CreateRecurrencePayload,
): Promise<Recurrence> {
  const account = payload.accountId ? await findAccountRow(context, payload.accountId) : undefined;
  const card = payload.cardId ? await findCardRow(context, payload.cardId) : undefined;
  const category = payload.categoryId
    ? await findCategoryRow(context, payload.categoryId)
    : undefined;

  const result = createRecurrenceDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(card ? { card } : {}),
    ...(category ? { category } : {}),
  });

  await persistRecurrenceMutation(result);
  await generateInstallmentsForContext(context, result.recurrence.id, todayIso());

  return result.recurrence;
}

export async function updateRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
  payload: UpdateRecurrencePayload,
): Promise<Recurrence> {
  const currentRecurrence = await findRecurrenceRow(context, recurrenceId);
  const accountId =
    payload.accountId ?? (payload.cardId !== undefined ? undefined : currentRecurrence?.accountId);
  const cardId =
    payload.cardId ?? (payload.accountId !== undefined ? undefined : currentRecurrence?.cardId);
  const categoryId = payload.categoryId ?? currentRecurrence?.categoryId;
  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const card = cardId ? await findCardRow(context, cardId) : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;

  const result = updateRecurrenceDomain({
    context,
    recurrence: currentRecurrence,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(card ? { card } : {}),
    ...(category ? { category } : {}),
  });

  await persistRecurrenceMutation(result);

  return result.recurrence;
}

export async function pauseRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<Recurrence> {
  const result = pauseRecurrenceDomain(
    context,
    await findRecurrenceRow(context, recurrenceId),
    new Date().toISOString(),
  );

  await persistRecurrenceMutation(result);

  return result.recurrence;
}

export async function resumeRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<Recurrence> {
  const result = resumeRecurrenceDomain(
    context,
    await findRecurrenceRow(context, recurrenceId),
    new Date().toISOString(),
  );

  await persistRecurrenceMutation(result);

  return result.recurrence;
}

export async function cancelRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<Recurrence> {
  const result = cancelRecurrenceDomain(
    context,
    await findRecurrenceRow(context, recurrenceId),
    new Date().toISOString(),
  );

  await persistRecurrenceMutation(result);

  return result.recurrence;
}

export async function generateInstallmentsForContext(
  context: TenantContext,
  recurrenceId: EntityId,
  through: ISODate,
  maxOccurrences?: number,
): Promise<GenerateRecurrenceInstallmentsResult> {
  const recurrence = await findRecurrenceRow(context, recurrenceId);
  const existingInstallments = await listInstallmentsByRecurrence(context, recurrenceId);
  const now = new Date().toISOString();

  const result = generateRecurrenceInstallmentsDomain({
    context,
    recurrence,
    existingInstallments,
    now,
    through,
    makeInstallmentId: () => randomUUID(),
    makeTransactionId: () => randomUUID(),
    ...(maxOccurrences !== undefined ? { maxOccurrences } : {}),
  });

  if (result.installments.length === 0) {
    return result;
  }

  await withTransaction(async (executeQuery) => {
    for (const installment of result.installments) {
      await executeQuery(
        `insert into "Installment"
          ("id", "organizationId", "financialProfileId", "recurrenceId", "cardId", "status",
           "sequenceNumber", "totalInstallments", "dueOn", "amountMinor", "currency", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        buildInstallmentParams(installment),
      );
    }
  });

  if (recurrence?.cardId !== undefined) {
    // Card-scoped recurrences materialize through the card purchase flow so each
    // occurrence gets resolved to the right Invoice (closing/due dates) the same way
    // any other card purchase does, instead of floating without an invoice.
    const cardId = recurrence.cardId;
    const transactions: Transaction[] = [];

    for (const installment of result.installments) {
      const purchase = await registerCardPurchaseForContext(context, cardId, {
        occurredOn: installment.dueOn,
        amountMinor: installment.amountMinor,
        description: recurrence.description,
        ...(recurrence.categoryId !== undefined ? { categoryId: recurrence.categoryId } : {}),
      });
      // registerCardPurchaseForContext does not know about recurrences, so backfill the
      // link afterwards: the web UI needs Transaction.recurrenceId to show the recurring
      // indicator and pause/resume/cancel/edit actions on the purchase row itself.
      await query(
        `update "Transaction" set "recurrenceId" = $1, "installmentId" = $2 where "id" = $3`,
        [recurrence.id, installment.id, purchase.transaction.id],
      );
      transactions.push({
        ...purchase.transaction,
        recurrenceId: recurrence.id,
        installmentId: installment.id,
      });
    }

    return { installments: result.installments, transactions };
  }

  await withTransaction(async (executeQuery) => {
    for (const transaction of result.transactions) {
      await executeQuery(
        buildInsertRecurrenceTransactionSql(),
        buildRecurrenceTransactionParams(transaction),
      );
    }
  });

  return result;
}

export async function catchUpRecurrenceInstallmentsForContext(
  context: TenantContext,
  filters: { accountId?: EntityId; cardId?: EntityId },
): Promise<void> {
  const recurrences = await listRecurrencesForContext(context, {
    status: "active",
    ...(filters.accountId !== undefined ? { accountId: filters.accountId } : {}),
    ...(filters.cardId !== undefined ? { cardId: filters.cardId } : {}),
  });
  const through = todayIso();

  for (const recurrence of recurrences) {
    await generateInstallmentsForContext(context, recurrence.id, through);
  }
}

function todayIso(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

export async function listInstallmentsByRecurrence(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<Installment[]> {
  const rows = await query<InstallmentRow>(
    `select ${INSTALLMENT_COLUMNS} from "Installment"
     where "organizationId" = $1 and "financialProfileId" = $2 and "recurrenceId" = $3
     order by "sequenceNumber" asc`,
    [context.organizationId, context.financialProfileId, recurrenceId],
  );

  return rows.map(mapInstallmentRow);
}

async function persistRecurrenceMutation(result: RecurrenceMutationResult): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "Recurrence"
        ("id", "organizationId", "financialProfileId", "accountId", "cardId", "categoryId", "status", "kind",
         "frequency", "interval", "startOn", "endOn", "amountMinor", "currency", "description", "createdAt",
         "updatedAt", "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       on conflict ("id") do update set
         "accountId" = excluded."accountId", "cardId" = excluded."cardId", "categoryId" = excluded."categoryId",
         "status" = excluded."status", "kind" = excluded."kind", "frequency" = excluded."frequency",
         "interval" = excluded."interval", "startOn" = excluded."startOn",
         "endOn" = excluded."endOn", "amountMinor" = excluded."amountMinor", "currency" = excluded."currency",
         "description" = excluded."description", "updatedAt" = excluded."updatedAt",
         "updatedByUserId" = excluded."updatedByUserId"`,
      buildRecurrenceParams(result.recurrence),
    );
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });
}

function buildRecurrenceParams(recurrence: Recurrence): unknown[] {
  return [
    recurrence.id,
    recurrence.organizationId,
    recurrence.financialProfileId,
    recurrence.accountId ?? null,
    recurrence.cardId ?? null,
    recurrence.categoryId ?? null,
    recurrence.status.toUpperCase(),
    recurrence.kind.toUpperCase(),
    recurrence.frequency.toUpperCase(),
    recurrence.interval,
    recurrence.startOn,
    recurrence.endOn ?? null,
    recurrence.amountMinor,
    recurrence.currency,
    recurrence.description,
    recurrence.createdAt,
    recurrence.updatedAt,
    recurrence.createdByUserId ?? null,
    recurrence.updatedByUserId ?? null,
  ];
}

function buildInsertRecurrenceTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "accountId", "cardId", "categoryId", "recurrenceId",
     "installmentId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
     "description", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`;
}

function buildRecurrenceTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.cardId ?? null,
    transaction.categoryId ?? null,
    transaction.recurrenceId ?? null,
    transaction.installmentId ?? null,
    transaction.kind.toUpperCase(),
    transaction.status.toUpperCase(),
    transaction.source.toUpperCase(),
    transaction.amountMinor,
    transaction.currency,
    transaction.occurredOn,
    transaction.plannedOn,
    transaction.description,
    transaction.createdAt,
    transaction.updatedAt,
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
  ];
}

function buildInstallmentParams(installment: Installment): unknown[] {
  return [
    installment.id,
    installment.organizationId,
    installment.financialProfileId,
    installment.recurrenceId ?? null,
    installment.cardId ?? null,
    installment.status.toUpperCase(),
    installment.sequenceNumber,
    installment.totalInstallments,
    installment.dueOn,
    installment.amountMinor,
    installment.currency,
    installment.createdAt,
    installment.updatedAt,
  ];
}

async function findRecurrenceRow(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<Recurrence | undefined> {
  const rows = await query<RecurrenceRow>(
    `select ${RECURRENCE_COLUMNS} from "Recurrence"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [recurrenceId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapRecurrenceRow(rows[0]) : undefined;
}

async function findAccountRow(
  context: TenantContext,
  accountId: EntityId,
): Promise<Account | undefined> {
  const rows = await query<{
    id: string;
    organizationId: string;
    financialProfileId: string;
    name: string;
    kind: string;
    status: string;
    currency: string;
    openingBalanceMinor: number;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `select "id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
            "openingBalanceMinor", "createdAt", "updatedAt"
     from "Account" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  return {
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
}

async function findCardRow(context: TenantContext, cardId: EntityId): Promise<Card | undefined> {
  const rows = await query<{
    id: string;
    organizationId: string;
    financialProfileId: string;
    name: string;
    status: string;
    closingDay: number;
    dueDay: number;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `select "id", "organizationId", "financialProfileId", "name", "status", "closingDay", "dueDay",
            "createdAt", "updatedAt"
     from "Card" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    status: row.status.toLowerCase() as Card["status"],
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

function mapRecurrenceRow(row: RecurrenceRow): Recurrence {
  const recurrence: Recurrence = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    status: row.status.toLowerCase() as RecurrenceStatus,
    kind: row.kind.toLowerCase() as TransactionKind,
    frequency: row.frequency.toLowerCase() as RecurrenceFrequency,
    interval: row.interval,
    startOn: toDateOnly(row.startOn),
    amountMinor: row.amountMinor,
    currency: row.currency,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.accountId !== null) recurrence.accountId = row.accountId;
  if (row.cardId !== null) recurrence.cardId = row.cardId;
  if (row.categoryId !== null) recurrence.categoryId = row.categoryId;
  if (row.endOn !== null) recurrence.endOn = toDateOnly(row.endOn);
  if (row.createdByUserId !== null) recurrence.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) recurrence.updatedByUserId = row.updatedByUserId;

  return recurrence;
}

function mapInstallmentRow(row: InstallmentRow): Installment {
  const installment: Installment = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    status: row.status.toLowerCase() as InstallmentStatus,
    sequenceNumber: row.sequenceNumber,
    totalInstallments: row.totalInstallments,
    dueOn: toDateOnly(row.dueOn),
    amountMinor: row.amountMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.recurrenceId !== null) installment.recurrenceId = row.recurrenceId;
  if (row.cardId !== null) installment.cardId = row.cardId;

  return installment;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
