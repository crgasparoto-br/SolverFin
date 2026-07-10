import {
  TenantAuthorizationError,
  addRecurrenceFrequency,
  type EntityId,
  type RecurrenceFrequency,
  type TenantContext,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import {
  InvoiceContractError,
  type UpdateCardPurchasePayload,
} from "./card-invoice-contracts.js";

export type RecurringCardPurchaseSkipReason =
  | "installment_locked"
  | "transaction_missing"
  | "transaction_locked"
  | "invoice_missing"
  | "invoice_locked"
  | "invoice_period_mismatch";

export interface RecurringCardPurchaseSkippedItem {
  sequenceNumber?: number;
  transactionId?: EntityId;
  installmentId?: EntityId;
  invoiceId?: EntityId;
  reason: RecurringCardPurchaseSkipReason;
}

export interface RecurringCardPurchaseEditResult {
  transactionUpdated: true;
  transaction: {
    id: EntityId;
    recurrenceId: EntityId;
    installmentId?: EntityId;
    invoiceId: EntityId;
    occurredOn: string;
    amountMinor: number;
    description: string;
    categoryId?: EntityId;
    cardInstrumentId?: EntityId;
  };
  recurrence: {
    id: EntityId;
    startOn: string;
    amountMinor: number;
    description: string;
    categoryId?: EntityId;
    cardInstrumentId?: EntityId;
  };
  updatedCount: number;
  skippedCount: number;
  skipped: RecurringCardPurchaseSkippedItem[];
}

interface SelectedRecurringPurchaseRow {
  id: string;
  cardId: string;
  categoryId: string | null;
  cardInstrumentId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  description: string;
  status: string;
  invoiceStatus: string | null;
  periodStartOn: Date | null;
  periodEndOn: Date | null;
  sequenceNumber: number | null;
  installmentStatus: string | null;
  recurrenceFrequency: string | null;
  recurrenceInterval: number | null;
  recurrenceStartOn: Date | null;
}

interface FutureRecurringPurchaseRow {
  transactionId: string | null;
  transactionStatus: string | null;
  transactionAmountMinor: number | null;
  transactionPlannedOn: Date | null;
  installmentId: string | null;
  installmentStatus: string | null;
  sequenceNumber: number | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  periodStartOn: Date | null;
  periodEndOn: Date | null;
}

const LOCKED_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);
const LOCKED_TRANSACTION_STATUSES = new Set(["RECONCILED", "VOIDED", "CANCELLED"]);
const LOCKED_INSTALLMENT_STATUSES = new Set(["RECONCILED", "CANCELLED"]);

export async function updateRecurringCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: UpdateCardPurchasePayload,
): Promise<RecurringCardPurchaseEditResult> {
  return withTransaction(async (executeQuery) => {
    const selected = await findSelectedPurchaseForUpdate(
      executeQuery,
      context,
      cardId,
      transactionId,
    );

    if (!selected) {
      throw new TenantAuthorizationError(
        "TENANT_RESOURCE_NOT_FOUND",
        "Compra recorrente nao encontrada.",
        404,
      );
    }

    if (
      selected.recurrenceId === null ||
      selected.recurrenceFrequency === null ||
      selected.recurrenceStartOn === null
    ) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_RECURRENCE_REQUIRED",
        "Esta compra nao pertence a uma recorrencia editavel.",
        409,
      );
    }

    if (
      selected.invoiceId === null ||
      selected.invoiceStatus === null ||
      selected.periodStartOn === null ||
      selected.periodEndOn === null
    ) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_INVOICE_INVALID",
        "Compra nao pertence a uma fatura valida.",
        409,
      );
    }

    if (LOCKED_INVOICE_STATUSES.has(selected.invoiceStatus)) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_INVOICE_LOCKED",
        "Compras de faturas fechadas, pagas ou canceladas nao podem ser editadas.",
        409,
      );
    }

    if (payload.invoiceId !== undefined && payload.invoiceId !== selected.invoiceId) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_INVOICE_INVALID",
        "A edicao recorrente nao pode mover a compra para outra fatura.",
        409,
      );
    }

    const occurredOn = payload.occurredOn ?? toDateOnly(selected.occurredOn);
    assertIsoDate(occurredOn);

    const selectedPeriodStart = toDateOnly(selected.periodStartOn);
    const selectedPeriodEnd = toDateOnly(selected.periodEndOn);
    if (occurredOn < selectedPeriodStart || occurredOn > selectedPeriodEnd) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_DATE_OUT_OF_INVOICE_PERIOD",
        "A data da compra precisa permanecer dentro do periodo da fatura atual.",
        409,
      );
    }

    const amountMinor =
      payload.amountMinor === undefined
        ? selected.amountMinor
        : validatePositiveAmount(payload.amountMinor);
    const description =
      payload.description === undefined
        ? selected.description
        : normalizeDescription(payload.description);
    const categoryId =
      payload.categoryId === undefined ? selected.categoryId : normalizeOptionalId(payload.categoryId);
    const cardInstrumentId = payload.cardInstrumentId ?? selected.cardInstrumentId;

    if (payload.cardInstrumentId !== undefined) {
      await assertCardInstrument(executeQuery, context, cardId, payload.cardInstrumentId);
    }
    if (payload.categoryId !== undefined && categoryId !== null) {
      await assertExpenseCategory(executeQuery, context, categoryId);
    }

    const frequency = normalizeFrequency(selected.recurrenceFrequency);
    const interval = Math.max(1, selected.recurrenceInterval ?? 1);
    const selectedSequence = selected.sequenceNumber;
    const recurrenceStartOn =
      occurredOn !== toDateOnly(selected.occurredOn)
        ? addRecurrenceFrequency(
            occurredOn,
            frequency,
            -(Math.max(1, selectedSequence ?? 1) - 1),
            interval,
          )
        : toDateOnly(selected.recurrenceStartOn);
    const now = new Date().toISOString();

    const futureRows = await listFutureOccurrencesForUpdate(
      executeQuery,
      context,
      selected.recurrenceId,
      selected.id,
      selectedSequence,
      toDateOnly(selected.plannedOn),
    );

    const skipped: RecurringCardPurchaseSkippedItem[] = [];
    const updates: Array<{ row: FutureRecurringPurchaseRow; dueOn: string }> = [];
    let legacyOffset = 0;

    for (const row of futureRows) {
      legacyOffset += 1;
      const dueOn =
        row.sequenceNumber !== null
          ? addRecurrenceFrequency(
              recurrenceStartOn,
              frequency,
              row.sequenceNumber - 1,
              interval,
            )
          : addRecurrenceFrequency(occurredOn, frequency, legacyOffset, interval);
      const reason = futureSkipReason(row, dueOn);

      if (reason) {
        skipped.push(toSkippedItem(row, reason));
        continue;
      }

      updates.push({ row, dueOn });
    }

    await executeQuery(
      `update "Transaction" set
         "categoryId" = $4, "cardInstrumentId" = $5, "amountMinor" = $6,
         "occurredOn" = $7, "plannedOn" = $7, "description" = $8,
         "updatedAt" = $9, "updatedByUserId" = $10
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        selected.id,
        context.organizationId,
        context.financialProfileId,
        categoryId,
        cardInstrumentId,
        amountMinor,
        occurredOn,
        description,
        now,
        context.userId,
      ],
    );

    if (selected.installmentId !== null) {
      await executeQuery(
        `update "Installment" set
           "cardInstrumentId" = $4, "dueOn" = $5, "amountMinor" = $6,
           "currency" = $7, "updatedAt" = $8
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [
          selected.installmentId,
          context.organizationId,
          context.financialProfileId,
          cardInstrumentId,
          occurredOn,
          amountMinor,
          selected.currency,
          now,
        ],
      );
    }

    const selectedAmountDelta = amountMinor - selected.amountMinor;
    if (selectedAmountDelta !== 0) {
      await adjustInvoiceTotal(
        executeQuery,
        context,
        selected.invoiceId,
        selectedAmountDelta,
        now,
      );
    }

    await executeQuery(
      `update "Recurrence" set
         "cardInstrumentId" = $4, "categoryId" = $5, "startOn" = $6,
         "amountMinor" = $7, "description" = $8,
         "updatedAt" = $9, "updatedByUserId" = $10
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        selected.recurrenceId,
        context.organizationId,
        context.financialProfileId,
        cardInstrumentId,
        categoryId,
        recurrenceStartOn,
        amountMinor,
        description,
        now,
        context.userId,
      ],
    );

    for (const update of updates) {
      const row = update.row;
      const futureTransactionId = row.transactionId as string;
      const futureInvoiceId = row.invoiceId as string;
      const amountDelta = amountMinor - (row.transactionAmountMinor ?? 0);

      await executeQuery(
        `update "Transaction" set
           "cardInstrumentId" = $4, "categoryId" = $5, "amountMinor" = $6,
           "occurredOn" = $7, "plannedOn" = $7, "description" = $8,
           "updatedAt" = $9, "updatedByUserId" = $10
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [
          futureTransactionId,
          context.organizationId,
          context.financialProfileId,
          cardInstrumentId,
          categoryId,
          amountMinor,
          update.dueOn,
          description,
          now,
          context.userId,
        ],
      );

      if (row.installmentId !== null) {
        await executeQuery(
          `update "Installment" set
             "cardInstrumentId" = $4, "dueOn" = $5, "amountMinor" = $6,
             "currency" = $7, "updatedAt" = $8
           where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
          [
            row.installmentId,
            context.organizationId,
            context.financialProfileId,
            cardInstrumentId,
            update.dueOn,
            amountMinor,
            selected.currency,
            now,
          ],
        );
      }

      if (amountDelta !== 0) {
        await adjustInvoiceTotal(executeQuery, context, futureInvoiceId, amountDelta, now);
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
        futureOccurrences: updates.length > 0 ? "changed" : "unchanged",
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
        amountMinor: amountMinor !== selected.amountMinor ? "changed" : "unchanged",
        schedule: recurrenceStartOn !== toDateOnly(selected.recurrenceStartOn) ? "changed" : "unchanged",
        futureOccurrences: updates.length > 0 ? "changed" : "unchanged",
      },
    });

    return {
      transactionUpdated: true,
      transaction: {
        id: selected.id,
        recurrenceId: selected.recurrenceId,
        ...(selected.installmentId !== null ? { installmentId: selected.installmentId } : {}),
        invoiceId: selected.invoiceId,
        occurredOn,
        amountMinor,
        description,
        ...(categoryId !== null ? { categoryId } : {}),
        ...(cardInstrumentId !== null ? { cardInstrumentId } : {}),
      },
      recurrence: {
        id: selected.recurrenceId,
        startOn: recurrenceStartOn,
        amountMinor,
        description,
        ...(categoryId !== null ? { categoryId } : {}),
        ...(cardInstrumentId !== null ? { cardInstrumentId } : {}),
      },
      updatedCount: updates.length,
      skippedCount: skipped.length,
      skipped,
    };
  });
}

async function findSelectedPurchaseForUpdate(
  executeQuery: typeof query,
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<SelectedRecurringPurchaseRow | undefined> {
  const rows = await executeQuery<SelectedRecurringPurchaseRow>(
    `select
       t."id", t."cardId", t."categoryId", t."cardInstrumentId", t."invoiceId",
       t."recurrenceId", t."installmentId", t."amountMinor", t."currency",
       t."occurredOn", t."plannedOn", t."description", t."status",
       inv."status" as "invoiceStatus", inv."periodStartOn", inv."periodEndOn",
       i."sequenceNumber", i."status" as "installmentStatus",
       r."frequency" as "recurrenceFrequency", r."interval" as "recurrenceInterval",
       r."startOn" as "recurrenceStartOn"
     from "Transaction" t
     left join "Invoice" inv
       on inv."id" = t."invoiceId"
      and inv."organizationId" = t."organizationId"
      and inv."financialProfileId" = t."financialProfileId"
     left join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     left join "Recurrence" r
       on r."id" = t."recurrenceId"
      and r."organizationId" = t."organizationId"
      and r."financialProfileId" = t."financialProfileId"
     where t."id" = $1 and t."cardId" = $2
       and t."organizationId" = $3 and t."financialProfileId" = $4
       and t."accountId" is null
     for update of t, inv, r`,
    [transactionId, cardId, context.organizationId, context.financialProfileId],
  );

  return rows[0];
}

async function listFutureOccurrencesForUpdate(
  executeQuery: typeof query,
  context: TenantContext,
  recurrenceId: EntityId,
  selectedTransactionId: EntityId,
  selectedSequence: number | null,
  selectedPlannedOn: string,
): Promise<FutureRecurringPurchaseRow[]> {
  return executeQuery<FutureRecurringPurchaseRow>(
    `select
       t."id" as "transactionId", t."status" as "transactionStatus",
       t."amountMinor" as "transactionAmountMinor", t."plannedOn" as "transactionPlannedOn",
       i."id" as "installmentId", i."status" as "installmentStatus", i."sequenceNumber",
       t."invoiceId", inv."status" as "invoiceStatus", inv."periodStartOn", inv."periodEndOn"
     from "Transaction" t
     left join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     left join "Invoice" inv
       on inv."id" = t."invoiceId"
      and inv."organizationId" = t."organizationId"
      and inv."financialProfileId" = t."financialProfileId"
     where t."organizationId" = $1 and t."financialProfileId" = $2
       and t."recurrenceId" = $3 and t."id" <> $4
       and t."cardId" is not null and t."accountId" is null
       and (($5::int is not null and i."sequenceNumber" > $5)
         or ($5::int is null and t."plannedOn" > $6))
     order by coalesce(i."sequenceNumber", 2147483647), t."plannedOn", t."createdAt"
     for update of t, inv`,
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

function futureSkipReason(
  row: FutureRecurringPurchaseRow,
  dueOn: string,
): RecurringCardPurchaseSkipReason | undefined {
  if (row.installmentStatus !== null && LOCKED_INSTALLMENT_STATUSES.has(row.installmentStatus)) {
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

function toSkippedItem(
  row: FutureRecurringPurchaseRow,
  reason: RecurringCardPurchaseSkipReason,
): RecurringCardPurchaseSkippedItem {
  return {
    reason,
    ...(row.sequenceNumber !== null ? { sequenceNumber: row.sequenceNumber } : {}),
    ...(row.transactionId !== null ? { transactionId: row.transactionId } : {}),
    ...(row.installmentId !== null ? { installmentId: row.installmentId } : {}),
    ...(row.invoiceId !== null ? { invoiceId: row.invoiceId } : {}),
  };
}

async function adjustInvoiceTotal(
  executeQuery: typeof query,
  context: TenantContext,
  invoiceId: EntityId,
  amountDelta: number,
  now: string,
): Promise<void> {
  await executeQuery(
    `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4, "updatedAt" = $5
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [invoiceId, context.organizationId, context.financialProfileId, amountDelta, now],
  );
}

async function assertCardInstrument(
  executeQuery: typeof query,
  context: TenantContext,
  cardId: EntityId,
  cardInstrumentId: EntityId,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `select "id" from "CardInstrument"
     where "id" = $1 and "cardId" = $2 and "organizationId" = $3
       and "financialProfileId" = $4 and "status" = 'ACTIVE'`,
    [cardInstrumentId, cardId, context.organizationId, context.financialProfileId],
  );

  if (!rows[0]) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INSTRUMENT_INVALID",
      "Selecione um instrumento ativo deste cartao.",
    );
  }
}

async function assertExpenseCategory(
  executeQuery: typeof query,
  context: TenantContext,
  categoryId: EntityId,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `select "id" from "Category"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "status" = 'ACTIVE' and "kind" = 'EXPENSE'`,
    [categoryId, context.organizationId, context.financialProfileId],
  );

  if (!rows[0]) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_CATEGORY_INVALID",
      "Selecione uma categoria de despesa ativa.",
    );
  }
}

function validatePositiveAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_AMOUNT_INVALID",
      "Informe um valor positivo para a compra.",
    );
  }

  return value;
}

function normalizeDescription(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_DESCRIPTION_REQUIRED",
      "Informe uma descricao para a compra.",
    );
  }

  return normalized;
}

function normalizeOptionalId(value: EntityId | null): EntityId | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_DATE_INVALID",
      "Informe uma data valida para a compra.",
    );
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
