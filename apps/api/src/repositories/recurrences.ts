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
  type Category,
  type CreateRecurrencePayload,
  type EntityId,
  type Installment,
  type InstallmentStatus,
  type ISODate,
  type ListRecurrencesFilters,
  type Recurrence,
  type RecurrenceFrequency,
  type RecurrenceMutationResult,
  type RecurrenceStatus,
  type TenantContext,
  type UpdateRecurrencePayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

interface RecurrenceRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string;
  categoryId: string | null;
  status: string;
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

const RECURRENCE_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "categoryId",
  "status", "frequency", "interval", "startOn", "endOn", "amountMinor", "currency", "description",
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
  const account = await findAccountRow(context, payload.accountId);
  const category = payload.categoryId
    ? await findCategoryRow(context, payload.categoryId)
    : undefined;

  const result = createRecurrenceDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
  });

  await persistRecurrenceMutation(result);

  return result.recurrence;
}

export async function updateRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
  payload: UpdateRecurrencePayload,
): Promise<Recurrence> {
  const currentRecurrence = await findRecurrenceRow(context, recurrenceId);
  const accountId = payload.accountId ?? currentRecurrence?.accountId;
  const categoryId = payload.categoryId ?? currentRecurrence?.categoryId;
  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;

  const result = updateRecurrenceDomain({
    context,
    recurrence: currentRecurrence,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
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
): Promise<Installment[]> {
  const recurrence = await findRecurrenceRow(context, recurrenceId);
  const existingInstallments = await listInstallmentsByRecurrence(context, recurrenceId);
  const now = new Date().toISOString();

  const installments = generateRecurrenceInstallmentsDomain({
    context,
    recurrence,
    existingInstallments,
    now,
    through,
    makeInstallmentId: () => randomUUID(),
    ...(maxOccurrences !== undefined ? { maxOccurrences } : {}),
  });

  if (installments.length === 0) {
    return installments;
  }

  await withTransaction(async (executeQuery) => {
    for (const installment of installments) {
      await executeQuery(
        `insert into "Installment"
          ("id", "organizationId", "financialProfileId", "recurrenceId", "cardId", "status",
           "sequenceNumber", "totalInstallments", "dueOn", "amountMinor", "currency", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        buildInstallmentParams(installment),
      );
    }
  });

  return installments;
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
        ("id", "organizationId", "financialProfileId", "accountId", "categoryId", "status", "frequency",
         "interval", "startOn", "endOn", "amountMinor", "currency", "description", "createdAt", "updatedAt",
         "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       on conflict ("id") do update set
         "accountId" = excluded."accountId", "categoryId" = excluded."categoryId",
         "status" = excluded."status", "frequency" = excluded."frequency", "interval" = excluded."interval",
         "startOn" = excluded."startOn",
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
    recurrence.accountId,
    recurrence.categoryId ?? null,
    recurrence.status.toUpperCase(),
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
    accountId: row.accountId,
    status: row.status.toLowerCase() as RecurrenceStatus,
    frequency: row.frequency.toLowerCase() as RecurrenceFrequency,
    interval: row.interval,
    startOn: toDateOnly(row.startOn),
    amountMinor: row.amountMinor,
    currency: row.currency,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

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
