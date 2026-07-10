import {
  TenantAuthorizationError,
  addRecurrenceFrequency,
  type EntityId,
  type RecurrenceFrequency,
  type TenantContext,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

export interface RecurringAccountTransactionEditPayload {
  kind?: string;
  status?: string;
  amountMinor?: number;
  occurredOn?: string;
  plannedOn?: string;
  effectiveOn?: string | null;
  description?: string;
  note?: string | null;
  accountId?: EntityId;
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  currency?: string;
}

export interface RecurringAccountTransactionEditResult {
  transactionUpdated: true;
  transaction: {
    id: EntityId;
    recurrenceId: EntityId;
    installmentId?: EntityId;
    plannedOn: string;
    effectiveOn?: string;
    amountMinor: number;
    description: string;
  };
  recurrence: {
    id: EntityId;
    startOn: string;
  };
  updatedCount: number;
  skippedCount: number;
  skipped: Array<{
    transactionId: EntityId;
    installmentId?: EntityId;
    sequenceNumber?: number;
    reason: "transaction_not_planned" | "transaction_voided";
  }>;
}

interface SelectedTransactionRow {
  id: string;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  effectiveOn: Date | null;
  description: string;
  note: string | null;
  voidedAt: Date | null;
  sequenceNumber: number | null;
  frequency: string | null;
  interval: number | null;
  recurrenceStartOn: Date | null;
}

interface FutureTransactionRow {
  id: string;
  installmentId: string | null;
  sequenceNumber: number | null;
  status: string;
  plannedOn: Date;
  voidedAt: Date | null;
}

class RecurringAccountEditError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "RecurringAccountEditError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function updateRecurringAccountTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
  payload: RecurringAccountTransactionEditPayload,
): Promise<RecurringAccountTransactionEditResult> {
  return withTransaction(async (executeQuery) => {
    const selected = await findSelectedForUpdate(executeQuery, context, transactionId);

    if (!selected) {
      throw new TenantAuthorizationError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Lancamento recorrente nao encontrado.",
        404,
      );
    }
    if (
      selected.recurrenceId === null ||
      selected.frequency === null ||
      selected.recurrenceStartOn === null
    ) {
      throw new RecurringAccountEditError(
        "TRANSACTION_RECURRENCE_REQUIRED",
        "Este lancamento nao pertence a uma recorrencia editavel.",
        409,
      );
    }
    if (selected.voidedAt !== null || selected.status === "VOIDED") {
      throw new RecurringAccountEditError(
        "TRANSACTION_VOIDED",
        "Lancamentos anulados nao podem ser editados.",
        409,
      );
    }

    const accountId = payload.accountId ?? selected.accountId;
    if (!accountId) {
      throw new RecurringAccountEditError(
        "TRANSACTION_ACCOUNT_REQUIRED",
        "Selecione uma conta para o lancamento.",
      );
    }
    await assertActiveAccount(executeQuery, context, accountId);

    const destinationAccountId = payload.destinationAccountId ?? selected.destinationAccountId;
    if (destinationAccountId) {
      await assertActiveAccount(executeQuery, context, destinationAccountId);
    }

    const kind = normalizeKind(payload.kind ?? selected.kind);
    const status = normalizeStatus(payload.status ?? selected.status);
    const amountMinor = validateAmount(payload.amountMinor ?? selected.amountMinor);
    const plannedOn = payload.plannedOn ?? toDateOnly(selected.plannedOn);
    const occurredOn = payload.occurredOn ?? payload.effectiveOn ?? plannedOn;
    const effectiveOn =
      payload.effectiveOn === undefined
        ? selected.effectiveOn
          ? toDateOnly(selected.effectiveOn)
          : null
        : payload.effectiveOn;
    const description = normalizeDescription(payload.description ?? selected.description);
    const note = payload.note === undefined ? selected.note : normalizeOptionalText(payload.note);
    const currency = normalizeCurrency(payload.currency ?? selected.currency);
    const categoryId = payload.categoryId ?? selected.categoryId;

    assertIsoDate(plannedOn, "TRANSACTION_PLANNED_DATE_INVALID");
    assertIsoDate(occurredOn, "TRANSACTION_OCCURRED_DATE_INVALID");
    if (effectiveOn !== null) assertIsoDate(effectiveOn, "TRANSACTION_EFFECTIVE_DATE_INVALID");
    if (categoryId) await assertCategory(executeQuery, context, categoryId, kind);

    const frequency = normalizeFrequency(selected.frequency);
    const interval = Math.max(1, selected.interval ?? 1);
    const recurrenceStartOn =
      plannedOn !== toDateOnly(selected.plannedOn)
        ? addRecurrenceFrequency(
            plannedOn,
            frequency,
            -(Math.max(1, selected.sequenceNumber ?? 1) - 1),
            interval,
          )
        : toDateOnly(selected.recurrenceStartOn);
    const futureRows = await findFutureForUpdate(
      executeQuery,
      context,
      selected.recurrenceId,
      selected.id,
      selected.sequenceNumber,
      toDateOnly(selected.plannedOn),
    );
    const now = new Date().toISOString();
    const skipped: RecurringAccountTransactionEditResult["skipped"] = [];
    const eligible: FutureTransactionRow[] = [];

    for (const row of futureRows) {
      if (row.voidedAt !== null || row.status === "VOIDED") {
        skipped.push(buildSkipped(row, "transaction_voided"));
      } else if (row.status !== "PLANNED") {
        skipped.push(buildSkipped(row, "transaction_not_planned"));
      } else {
        eligible.push(row);
      }
    }

    await executeQuery(
      `update "Transaction" set
         "accountId" = $4, "destinationAccountId" = $5, "categoryId" = $6,
         "kind" = $7, "status" = $8, "amountMinor" = $9, "currency" = $10,
         "occurredOn" = $11, "plannedOn" = $12, "effectiveOn" = $13,
         "description" = $14, "note" = $15, "updatedAt" = $16, "updatedByUserId" = $17
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        selected.id,
        context.organizationId,
        context.financialProfileId,
        accountId,
        destinationAccountId,
        categoryId,
        kind,
        status,
        amountMinor,
        currency,
        occurredOn,
        plannedOn,
        effectiveOn,
        description,
        note,
        now,
        context.userId,
      ],
    );

    if (selected.installmentId !== null) {
      await syncInstallment(
        executeQuery,
        context,
        selected.installmentId,
        plannedOn,
        amountMinor,
        currency,
        now,
      );
    }

    await executeQuery(
      `update "Recurrence" set
         "accountId" = $4, "categoryId" = $5, "kind" = $6,
         "amountMinor" = $7, "currency" = $8, "description" = $9,
         "startOn" = $10, "updatedAt" = $11, "updatedByUserId" = $12
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        selected.recurrenceId,
        context.organizationId,
        context.financialProfileId,
        accountId,
        categoryId,
        kind,
        amountMinor,
        currency,
        description,
        recurrenceStartOn,
        now,
        context.userId,
      ],
    );

    let legacyOffset = 0;
    for (const row of eligible) {
      legacyOffset += 1;
      const nextPlannedOn =
        row.sequenceNumber !== null
          ? addRecurrenceFrequency(
              recurrenceStartOn,
              frequency,
              row.sequenceNumber - 1,
              interval,
            )
          : addRecurrenceFrequency(plannedOn, frequency, legacyOffset, interval);

      await executeQuery(
        `update "Transaction" set
           "accountId" = $4, "destinationAccountId" = $5, "categoryId" = $6,
           "kind" = $7, "amountMinor" = $8, "currency" = $9,
           "occurredOn" = $10, "plannedOn" = $10, "effectiveOn" = null,
           "description" = $11, "note" = $12,
           "updatedAt" = $13, "updatedByUserId" = $14
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [
          row.id,
          context.organizationId,
          context.financialProfileId,
          accountId,
          destinationAccountId,
          categoryId,
          kind,
          amountMinor,
          currency,
          nextPlannedOn,
          description,
          note,
          now,
          context.userId,
        ],
      );

      if (row.installmentId !== null) {
        await syncInstallment(
          executeQuery,
          context,
          row.installmentId,
          nextPlannedOn,
          amountMinor,
          currency,
          now,
        );
      }
    }

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "transaction",
      entityId: selected.id,
      redactedChanges: {
        recurringEditScope: "current_and_future",
        selectedOccurrence: "changed",
        futureOccurrences: eligible.length > 0 ? "changed" : "unchanged",
      },
    });
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "recurrence",
      entityId: selected.recurrenceId,
      redactedChanges: {
        schedule: recurrenceStartOn !== toDateOnly(selected.recurrenceStartOn) ? "changed" : "unchanged",
        futureOccurrences: eligible.length > 0 ? "changed" : "unchanged",
      },
    });

    return {
      transactionUpdated: true,
      transaction: {
        id: selected.id,
        recurrenceId: selected.recurrenceId,
        ...(selected.installmentId !== null ? { installmentId: selected.installmentId } : {}),
        plannedOn,
        ...(effectiveOn !== null ? { effectiveOn } : {}),
        amountMinor,
        description,
      },
      recurrence: { id: selected.recurrenceId, startOn: recurrenceStartOn },
      updatedCount: eligible.length,
      skippedCount: skipped.length,
      skipped,
    };
  });
}

async function findSelectedForUpdate(
  executeQuery: typeof query,
  context: TenantContext,
  transactionId: EntityId,
): Promise<SelectedTransactionRow | undefined> {
  const rows = await executeQuery<SelectedTransactionRow>(
    `select
       t."id", t."accountId", t."destinationAccountId", t."categoryId",
       t."recurrenceId", t."installmentId", t."kind", t."status", t."amountMinor",
       t."currency", t."occurredOn", t."plannedOn", t."effectiveOn",
       t."description", t."note", t."voidedAt",
       i."sequenceNumber", r."frequency", r."interval", r."startOn" as "recurrenceStartOn"
     from "Transaction" t
     join "Recurrence" r
       on r."id" = t."recurrenceId"
      and r."organizationId" = t."organizationId"
      and r."financialProfileId" = t."financialProfileId"
     left join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     where t."id" = $1 and t."organizationId" = $2 and t."financialProfileId" = $3
       and t."cardId" is null
     for update of t, r`,
    [transactionId, context.organizationId, context.financialProfileId],
  );

  return rows[0];
}

async function findFutureForUpdate(
  executeQuery: typeof query,
  context: TenantContext,
  recurrenceId: EntityId,
  selectedTransactionId: EntityId,
  selectedSequence: number | null,
  selectedPlannedOn: string,
): Promise<FutureTransactionRow[]> {
  return executeQuery<FutureTransactionRow>(
    `select t."id", t."installmentId", i."sequenceNumber", t."status", t."plannedOn", t."voidedAt"
     from "Transaction" t
     left join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     where t."organizationId" = $1 and t."financialProfileId" = $2
       and t."recurrenceId" = $3 and t."id" <> $4 and t."cardId" is null
       and (($5::int is not null and i."sequenceNumber" > $5)
         or ($5::int is null and t."plannedOn" > $6))
     order by coalesce(i."sequenceNumber", 2147483647), t."plannedOn", t."createdAt"
     for update of t`,
    [
      context.organizationId,
      context.financialProfileId,
      recurrenceId,
      selectedTransactionId,
      selectedSequence,
      selectedPlannedOn,
    ],
  );
}

async function syncInstallment(
  executeQuery: typeof query,
  context: TenantContext,
  installmentId: EntityId,
  dueOn: string,
  amountMinor: number,
  currency: string,
  now: string,
): Promise<void> {
  await executeQuery(
    `update "Installment" set "dueOn" = $4, "amountMinor" = $5, "currency" = $6, "updatedAt" = $7
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [installmentId, context.organizationId, context.financialProfileId, dueOn, amountMinor, currency, now],
  );
}

async function assertActiveAccount(
  executeQuery: typeof query,
  context: TenantContext,
  accountId: EntityId,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `select "id" from "Account"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "status" = 'ACTIVE'`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  if (!rows[0]) {
    throw new RecurringAccountEditError(
      "TRANSACTION_ACCOUNT_INVALID",
      "Selecione uma conta ativa.",
    );
  }
}

async function assertCategory(
  executeQuery: typeof query,
  context: TenantContext,
  categoryId: EntityId,
  kind: string,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `select "id" from "Category"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "status" = 'ACTIVE' and "kind" = $4`,
    [categoryId, context.organizationId, context.financialProfileId, kind],
  );
  if (!rows[0]) {
    throw new RecurringAccountEditError(
      "TRANSACTION_CATEGORY_INVALID",
      "Selecione uma categoria ativa compativel com o tipo do lancamento.",
    );
  }
}

function buildSkipped(
  row: FutureTransactionRow,
  reason: "transaction_not_planned" | "transaction_voided",
): RecurringAccountTransactionEditResult["skipped"][number] {
  return {
    transactionId: row.id,
    reason,
    ...(row.installmentId !== null ? { installmentId: row.installmentId } : {}),
    ...(row.sequenceNumber !== null ? { sequenceNumber: row.sequenceNumber } : {}),
  };
}

function normalizeKind(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized !== "INCOME" && normalized !== "EXPENSE") {
    throw new RecurringAccountEditError(
      "TRANSACTION_KIND_INVALID",
      "O tipo do lancamento recorrente deve ser entrada ou saida.",
    );
  }
  return normalized;
}

function normalizeStatus(value: string): string {
  const normalized = value.toUpperCase();
  if (!new Set(["PLANNED", "POSTED", "RECONCILED"]).has(normalized)) {
    throw new RecurringAccountEditError(
      "TRANSACTION_STATUS_INVALID",
      "O status informado para o lancamento e invalido.",
    );
  }
  return normalized;
}

function validateAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RecurringAccountEditError(
      "TRANSACTION_AMOUNT_INVALID",
      "Informe um valor positivo para o lancamento.",
    );
  }
  return value;
}

function normalizeDescription(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new RecurringAccountEditError(
      "TRANSACTION_DESCRIPTION_REQUIRED",
      "Informe uma descricao para o lancamento.",
    );
  }
  return normalized;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new RecurringAccountEditError(
      "TRANSACTION_CURRENCY_INVALID",
      "Informe uma moeda valida.",
    );
  }
  return normalized;
}

function assertIsoDate(value: string, code: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new RecurringAccountEditError(code, "Informe uma data valida para o lancamento.");
  }
}

function normalizeFrequency(value: string): RecurrenceFrequency {
  const normalized = value.toLowerCase();
  if (
    normalized === "daily" ||
    normalized === "weekly" ||
    normalized === "monthly" ||
    normalized === "yearly"
  ) {
    return normalized;
  }
  return "monthly";
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
