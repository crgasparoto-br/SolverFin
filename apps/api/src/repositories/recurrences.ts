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
import { toDateOnly } from "./repository-date-utils.js";

type CreateRecurrenceForContextPayload = CreateRecurrencePayload & {
  cardInstrumentId?: EntityId;
};

type UpdateRecurrenceForContextPayload = UpdateRecurrencePayload & {
  cardInstrumentId?: EntityId;
  editScope?: string;
};

export interface RecurrenceFuturePendingUpdateSkippedItem {
  installmentId: EntityId;
  sequenceNumber: number;
  reason: string;
  transactionId?: EntityId;
  invoiceId?: EntityId;
}

export interface RecurrenceFuturePendingUpdateSummary {
  updatedCount: number;
  skippedCount: number;
  skipped: RecurrenceFuturePendingUpdateSkippedItem[];
}

export interface UpdateRecurrenceForContextResult {
  recurrence: Recurrence;
  futurePendingUpdate?: RecurrenceFuturePendingUpdateSummary;
}

interface RecurrenceRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  cardId: string | null;
  cardInstrumentId: string | null;
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
  cardInstrumentId: string | null;
  status: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: Date;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FuturePendingCardOccurrenceRow {
  installmentId: string;
  installmentStatus: string;
  sequenceNumber: number;
  dueOn: Date;
  installmentAmountMinor: number;
  transactionId: string | null;
  transactionStatus: string | null;
  transactionAmountMinor: number | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  periodStartOn: Date | null;
  periodEndOn: Date | null;
}

interface FuturePendingCardOccurrenceUpdate {
  row: FuturePendingCardOccurrenceRow;
  dueOn: ISODate;
}

const RECURRENCE_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "cardId", "cardInstrumentId", "categoryId",
  "status", "kind", "frequency", "interval", "startOn", "endOn", "amountMinor", "currency", "description",
  "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

const INSTALLMENT_COLUMNS = `"id", "organizationId", "financialProfileId", "recurrenceId", "cardId", "cardInstrumentId",
  "status", "sequenceNumber", "totalInstallments", "dueOn", "amountMinor", "currency", "createdAt", "updatedAt"`;

const LOCKED_INSTALLMENT_STATUSES = new Set(["RECONCILED", "CANCELLED"]);
const LOCKED_TRANSACTION_STATUSES = new Set(["RECONCILED", "VOIDED"]);
const LOCKED_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);

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
  payload: CreateRecurrenceForContextPayload,
): Promise<Recurrence> {
  const account = payload.accountId ? await findAccountRow(context, payload.accountId) : undefined;
  const card = payload.cardId ? await findCardRow(context, payload.cardId) : undefined;
  const category = payload.categoryId
    ? await findCategoryRow(context, payload.categoryId)
    : undefined;

  await assertRecurrenceCardInstrumentTarget(context, card, payload.cardInstrumentId);

  const result = createRecurrenceDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(account ? { account } : {}),
    ...(card ? { card } : {}),
    ...(category ? { category } : {}),
  });

  if (payload.cardInstrumentId !== undefined) {
    result.recurrence.cardInstrumentId = payload.cardInstrumentId;
  }

  await persistRecurrenceMutation(result);

  if (result.recurrence.startOn <= todayIso()) {
    await generateInstallmentsForContext(
      context,
      result.recurrence.id,
      result.recurrence.startOn,
      1,
    );
  }

  return result.recurrence;
}

export async function updateRecurrenceForContext(
  context: TenantContext,
  recurrenceId: EntityId,
  payload: UpdateRecurrenceForContextPayload,
): Promise<UpdateRecurrenceForContextResult> {
  const { editScope = "recurrence_only", ...recurrencePayload } = payload;
  const currentRecurrence = await findRecurrenceRow(context, recurrenceId);
  const accountId =
    recurrencePayload.accountId ??
    (recurrencePayload.cardId !== undefined ? undefined : currentRecurrence?.accountId);
  const cardId =
    recurrencePayload.cardId ??
    (recurrencePayload.accountId !== undefined ? undefined : currentRecurrence?.cardId);
  const categoryId = recurrencePayload.categoryId ?? currentRecurrence?.categoryId;
  const account = accountId ? await findAccountRow(context, accountId) : undefined;
  const card = cardId ? await findCardRow(context, cardId) : undefined;
  const category = categoryId ? await findCategoryRow(context, categoryId) : undefined;

  await assertRecurrenceCardInstrumentTarget(context, card, recurrencePayload.cardInstrumentId);

  const result = updateRecurrenceDomain({
    context,
    recurrence: currentRecurrence,
    now: new Date().toISOString(),
    payload: recurrencePayload,
    ...(account ? { account } : {}),
    ...(card ? { card } : {}),
    ...(category ? { category } : {}),
  });

  if (
    recurrencePayload.accountId !== undefined ||
    (recurrencePayload.cardId !== undefined && recurrencePayload.cardInstrumentId === undefined)
  ) {
    delete result.recurrence.cardInstrumentId;
  }

  if (recurrencePayload.cardInstrumentId !== undefined) {
    result.recurrence.cardInstrumentId = recurrencePayload.cardInstrumentId;
  }

  await persistRecurrenceMutation(result);

  if (editScope !== "recurrence_and_future_pending" || result.recurrence.cardId === undefined) {
    return { recurrence: result.recurrence };
  }

  const futurePendingUpdate = await updateFuturePendingCardOccurrencesForContext(
    context,
    result.recurrence,
  );

  return { recurrence: result.recurrence, futurePendingUpdate };
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
  const cardInstrumentId =
    recurrence?.cardId !== undefined ? recurrence.cardInstrumentId : undefined;
  const installments =
    cardInstrumentId !== undefined
      ? result.installments.map((installment) => ({ ...installment, cardInstrumentId }))
      : result.installments;

  if (installments.length === 0) {
    return { ...result, installments };
  }

  await withTransaction(async (executeQuery) => {
    for (const installment of installments) {
      await executeQuery(
        `insert into "Installment"
          ("id", "organizationId", "financialProfileId", "recurrenceId", "cardId", "cardInstrumentId", "status",
           "sequenceNumber", "totalInstallments", "dueOn", "amountMinor", "currency", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
    const generatedInstallmentIds = installments.map((installment) => installment.id);

    try {
      for (const installment of installments) {
        const purchase = await registerCardPurchaseForContext(context, cardId, {
          occurredOn: installment.dueOn,
          amountMinor: installment.amountMinor,
          description: recurrence.description,
          ...(recurrence.cardInstrumentId !== undefined
            ? { cardInstrumentId: recurrence.cardInstrumentId }
            : {}),
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
    } catch (error) {
      await deleteUnmaterializedCardInstallmentsForContext(context, generatedInstallmentIds);
      throw error;
    }

    return { installments, transactions };
  }

  await withTransaction(async (executeQuery) => {
    for (const transaction of result.transactions) {
      await executeQuery(
        buildInsertRecurrenceTransactionSql(),
        buildRecurrenceTransactionParams(transaction),
      );
    }
  });

  return { ...result, installments };
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

async function deleteUnmaterializedCardInstallmentsForContext(
  context: TenantContext,
  installmentIds: readonly EntityId[],
): Promise<void> {
  if (installmentIds.length === 0) {
    return;
  }

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `delete from "Installment" i
       where i."organizationId" = $1
         and i."financialProfileId" = $2
         and i."id" = any($3::uuid[])
         and i."cardId" is not null
         and not exists (
           select 1 from "Transaction" t
            where t."organizationId" = i."organizationId"
              and t."financialProfileId" = i."financialProfileId"
              and t."installmentId" = i."id"
              and t."cardId" = i."cardId"
              and t."accountId" is null
         )`,
      [context.organizationId, context.financialProfileId, installmentIds],
    );
  });
}

function todayIso(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

async function listInstallmentsByRecurrence(
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

async function updateFuturePendingCardOccurrencesForContext(
  context: TenantContext,
  recurrence: Recurrence,
): Promise<RecurrenceFuturePendingUpdateSummary> {
  const rows = await query<FuturePendingCardOccurrenceRow>(
    `select
        i."id" as "installmentId",
        i."status" as "installmentStatus",
        i."sequenceNumber",
        i."dueOn",
        i."amountMinor" as "installmentAmountMinor",
        t."id" as "transactionId",
        t."status" as "transactionStatus",
        t."amountMinor" as "transactionAmountMinor",
        t."invoiceId",
        inv."status" as "invoiceStatus",
        inv."periodStartOn",
        inv."periodEndOn"
       from "Installment" i
       left join "Transaction" t
         on t."installmentId" = i."id"
        and t."organizationId" = i."organizationId"
        and t."financialProfileId" = i."financialProfileId"
        and t."cardId" = i."cardId"
        and t."accountId" is null
       left join "Invoice" inv
         on inv."id" = t."invoiceId"
        and inv."organizationId" = i."organizationId"
        and inv."financialProfileId" = i."financialProfileId"
       where i."organizationId" = $1
         and i."financialProfileId" = $2
         and i."recurrenceId" = $3
         and i."cardId" is not null
         and i."dueOn" >= $4
       order by i."sequenceNumber" asc`,
    [context.organizationId, context.financialProfileId, recurrence.id, todayIso()],
  );

  const skipped: RecurrenceFuturePendingUpdateSkippedItem[] = [];
  const updates: FuturePendingCardOccurrenceUpdate[] = [];

  for (const row of rows) {
    const dueOn = calculateRecurrenceDueOn(recurrence, row.sequenceNumber);
    const reason = getFuturePendingSkipReason(row, dueOn);

    if (reason !== undefined) {
      skipped.push({
        installmentId: row.installmentId,
        sequenceNumber: row.sequenceNumber,
        reason,
        ...(row.transactionId !== null ? { transactionId: row.transactionId } : {}),
        ...(row.invoiceId !== null ? { invoiceId: row.invoiceId } : {}),
      });
      continue;
    }

    updates.push({ row, dueOn });
  }

  if (updates.length > 0) {
    const now = new Date().toISOString();

    await withTransaction(async (executeQuery) => {
      for (const update of updates) {
        const transactionId = update.row.transactionId as string;
        const invoiceId = update.row.invoiceId as string;
        const currentTransactionAmount = update.row.transactionAmountMinor ?? 0;
        const amountDelta = recurrence.amountMinor - currentTransactionAmount;

        await executeQuery(
          `update "Installment"
             set "cardInstrumentId" = $1,
                 "dueOn" = $2,
                 "amountMinor" = $3,
                 "currency" = $4,
                 "updatedAt" = $5
           where "id" = $6 and "organizationId" = $7 and "financialProfileId" = $8`,
          [
            recurrence.cardInstrumentId ?? null,
            update.dueOn,
            recurrence.amountMinor,
            recurrence.currency,
            now,
            update.row.installmentId,
            context.organizationId,
            context.financialProfileId,
          ],
        );

        await executeQuery(
          `update "Transaction"
             set "cardInstrumentId" = $1,
                 "categoryId" = $2,
                 "amountMinor" = $3,
                 "currency" = $4,
                 "description" = $5,
                 "occurredOn" = $6,
                 "plannedOn" = $7,
                 "updatedAt" = $8,
                 "updatedByUserId" = $9
           where "id" = $10 and "organizationId" = $11 and "financialProfileId" = $12`,
          [
            recurrence.cardInstrumentId ?? null,
            recurrence.categoryId ?? null,
            recurrence.amountMinor,
            recurrence.currency,
            recurrence.description,
            update.dueOn,
            update.dueOn,
            now,
            context.userId,
            transactionId,
            context.organizationId,
            context.financialProfileId,
          ],
        );

        if (amountDelta !== 0) {
          await executeQuery(
            `update "Invoice"
               set "totalAmountMinor" = "totalAmountMinor" + $1,
                   "updatedAt" = $2
             where "id" = $3 and "organizationId" = $4 and "financialProfileId" = $5`,
            [amountDelta, now, invoiceId, context.organizationId, context.financialProfileId],
          );
        }
      }
    });
  }

  return {
    updatedCount: updates.length,
    skippedCount: skipped.length,
    skipped,
  };
}

function getFuturePendingSkipReason(
  row: FuturePendingCardOccurrenceRow,
  dueOn: ISODate,
): string | undefined {
  if (LOCKED_INSTALLMENT_STATUSES.has(row.installmentStatus)) {
    return "installment_locked";
  }

  if (row.transactionId === null) {
    return "transaction_missing";
  }

  if (row.transactionStatus === null || LOCKED_TRANSACTION_STATUSES.has(row.transactionStatus)) {
    return "transaction_locked";
  }

  if (row.invoiceId === null || row.invoiceStatus === null) {
    return "invoice_missing";
  }

  if (LOCKED_INVOICE_STATUSES.has(row.invoiceStatus)) {
    return "invoice_locked";
  }

  if (
    row.periodStartOn !== null &&
    row.periodEndOn !== null &&
    (dueOn < toDateOnly(row.periodStartOn) || dueOn > toDateOnly(row.periodEndOn))
  ) {
    return "invoice_period_mismatch";
  }

  return undefined;
}

function calculateRecurrenceDueOn(recurrence: Recurrence, sequenceNumber: number): ISODate {
  return addFrequency(
    recurrence.startOn,
    recurrence.frequency,
    sequenceNumber - 1,
    recurrence.interval,
  );
}

function addFrequency(
  startOn: ISODate,
  frequency: RecurrenceFrequency,
  offset: number,
  interval = 1,
): ISODate {
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

function addDays(startOn: ISODate, days: number): ISODate {
  const date = parseDate(startOn);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDate(date);
}

function addMonths(startOn: ISODate, months: number): ISODate {
  const [year, month, day] = startOn.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = getLastDayOfMonth(targetYear, normalizedMonthIndex + 1);
  const date = new Date(Date.UTC(targetYear, normalizedMonthIndex, Math.min(day, lastDay)));

  return formatDate(date);
}

function parseDate(date: ISODate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

async function persistRecurrenceMutation(result: RecurrenceMutationResult): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "Recurrence"
        ("id", "organizationId", "financialProfileId", "accountId", "cardId", "cardInstrumentId", "categoryId", "status", "kind",
         "frequency", "interval", "startOn", "endOn", "amountMinor", "currency", "description", "createdAt",
         "updatedAt", "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       on conflict ("id") do update set
         "accountId" = excluded."accountId", "cardId" = excluded."cardId", "cardInstrumentId" = excluded."cardInstrumentId",
         "categoryId" = excluded."categoryId", "status" = excluded."status", "kind" = excluded."kind",
         "frequency" = excluded."frequency", "interval" = excluded."interval", "startOn" = excluded."startOn",
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
    recurrence.cardInstrumentId ?? null,
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
    ("id", "organizationId", "financialProfileId", "accountId", "cardId", "cardInstrumentId", "categoryId", "recurrenceId",
     "installmentId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
     "description", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`;
}

function buildRecurrenceTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.accountId ?? null,
    transaction.cardId ?? null,
    transaction.cardInstrumentId ?? null,
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
    installment.cardInstrumentId ?? null,
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

async function assertRecurrenceCardInstrumentTarget(
  context: TenantContext,
  card: Card | undefined,
  cardInstrumentId: EntityId | undefined,
): Promise<void> {
  if (cardInstrumentId === undefined) {
    return;
  }

  if (card === undefined) {
    throwRecurrenceCardInstrumentInvalid();
  }

  await assertActiveCardInstrumentBelongsToCard(context, card.id, cardInstrumentId);
}

async function assertActiveCardInstrumentBelongsToCard(
  context: TenantContext,
  cardId: EntityId,
  cardInstrumentId: EntityId,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `select "id" from "CardInstrument"
     where "id" = $1 and "cardId" = $2 and "organizationId" = $3 and "financialProfileId" = $4 and "status" = 'ACTIVE'
     limit 1`,
    [cardInstrumentId, cardId, context.organizationId, context.financialProfileId],
  );

  if (rows[0] === undefined) {
    throwRecurrenceCardInstrumentInvalid();
  }
}

function throwRecurrenceCardInstrumentInvalid(): never {
  throw Object.assign(
    new Error("Instrumento de cartao da recorrencia deve estar ativo e pertencer ao cartao."),
    { code: "RECURRENCE_CARD_INSTRUMENT_INVALID", statusCode: 400 },
  );
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
  if (row.cardInstrumentId !== null) recurrence.cardInstrumentId = row.cardInstrumentId;
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
  if (row.cardInstrumentId !== null) installment.cardInstrumentId = row.cardInstrumentId;

  return installment;
}
