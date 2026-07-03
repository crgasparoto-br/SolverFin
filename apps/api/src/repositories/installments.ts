import type {
  EntityId,
  InstallmentStatus,
  InvoiceStatus,
  TenantContext,
  TransactionStatus,
} from "@solverfin/domain";

import { query } from "../db.js";

export interface ListInstallmentsFilters {
  transactionId?: EntityId;
  recurrenceId?: EntityId;
  cardId?: EntityId;
  cardInstrumentId?: EntityId;
  invoiceId?: EntityId;
  categoryId?: EntityId;
  dueFrom?: string;
  dueTo?: string;
  status?: InstallmentStatus | "all";
}

export type InstallmentEditBlockedReason =
  | "linked_transaction_missing"
  | "installment_status_locked"
  | "transaction_status_locked"
  | "invoice_linked";

export interface InstallmentHistoryItem {
  id: EntityId;
  organizationId: EntityId;
  financialProfileId: EntityId;
  status: InstallmentStatus;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  currency: string;
  transaction?: Record<string, unknown>;
  recurrence?: Record<string, unknown>;
  invoice?: Record<string, unknown>;
  card?: Record<string, unknown>;
  cardInstrument?: Record<string, unknown>;
  category?: Record<string, unknown>;
  editable: boolean;
  editBlockedReason?: InstallmentEditBlockedReason;
}

type Row = Record<string, unknown>;

const VALID_INSTALLMENT_STATUSES: readonly InstallmentStatus[] = [
  "planned",
  "posted",
  "reconciled",
  "cancelled",
];

export async function listInstallmentsForContext(
  context: TenantContext,
  filters: ListInstallmentsFilters = {},
): Promise<InstallmentHistoryItem[]> {
  validateFilters(filters);
  const params: unknown[] = [context.organizationId, context.financialProfileId];
  const where = [`i."organizationId" = $1`, `i."financialProfileId" = $2`];

  addEqualsFilter(where, params, `t."id"`, filters.transactionId);
  addEqualsFilter(where, params, `i."recurrenceId"`, filters.recurrenceId);
  addEqualsFilter(where, params, `i."cardId"`, filters.cardId);
  addEqualsFilter(where, params, `i."cardInstrumentId"`, filters.cardInstrumentId);
  addEqualsFilter(where, params, `t."invoiceId"`, filters.invoiceId);
  addEqualsFilter(where, params, `coalesce(t."categoryId", r."categoryId")`, filters.categoryId);

  if (filters.status !== undefined && filters.status !== "all") {
    params.push(filters.status.toUpperCase());
    where.push(`i."status" = $${params.length}`);
  }

  if (filters.dueFrom !== undefined) {
    params.push(filters.dueFrom);
    where.push(`i."dueOn" >= $${params.length}`);
  }

  if (filters.dueTo !== undefined) {
    params.push(filters.dueTo);
    where.push(`i."dueOn" <= $${params.length}`);
  }

  const rows = await query<Row>(
    `select
       i."id", i."organizationId", i."financialProfileId", i."recurrenceId", i."cardId",
       i."cardInstrumentId", i."status", i."sequenceNumber", i."totalInstallments",
       i."dueOn", i."amountMinor", i."currency",
       t."id" as "transactionId", t."status" as "transactionStatus", t."kind" as "transactionKind",
       t."source" as "transactionSource", t."accountId" as "transactionAccountId",
       t."cardId" as "transactionCardId", t."cardInstrumentId" as "transactionCardInstrumentId",
       t."invoiceId" as "transactionInvoiceId", t."categoryId" as "transactionCategoryId",
       t."recurrenceId" as "transactionRecurrenceId", t."amountMinor" as "transactionAmountMinor",
       t."currency" as "transactionCurrency", t."occurredOn" as "transactionOccurredOn",
       t."plannedOn" as "transactionPlannedOn", t."description" as "transactionDescription",
       r."status" as "recurrenceStatus", r."kind" as "recurrenceKind",
       r."frequency" as "recurrenceFrequency", r."interval" as "recurrenceInterval",
       r."description" as "recurrenceDescription",
       inv."id" as "invoiceId", inv."status" as "invoiceStatus", inv."cardId" as "invoiceCardId",
       inv."periodStartOn" as "invoicePeriodStartOn", inv."periodEndOn" as "invoicePeriodEndOn",
       inv."dueOn" as "invoiceDueOn",
       c."name" as "cardName", c."status" as "cardStatus",
       ci."type" as "cardInstrumentType", ci."holder" as "cardInstrumentHolder",
       ci."status" as "cardInstrumentStatus", ci."isDefault" as "cardInstrumentIsDefault",
       ci."name" as "cardInstrumentName", ci."maskedIdentifier" as "cardInstrumentMaskedIdentifier",
       cat."id" as "categoryId", cat."name" as "categoryName", cat."kind" as "categoryKind",
       cat."status" as "categoryStatus"
     from "Installment" i
     left join "Transaction" t
       on t."installmentId" = i."id"
      and t."organizationId" = i."organizationId"
      and t."financialProfileId" = i."financialProfileId"
     left join "Recurrence" r
       on r."id" = i."recurrenceId"
      and r."organizationId" = i."organizationId"
      and r."financialProfileId" = i."financialProfileId"
     left join "Invoice" inv
       on inv."id" = t."invoiceId"
      and inv."organizationId" = i."organizationId"
      and inv."financialProfileId" = i."financialProfileId"
     left join "Card" c
       on c."id" = i."cardId"
      and c."organizationId" = i."organizationId"
      and c."financialProfileId" = i."financialProfileId"
     left join "CardInstrument" ci
       on ci."id" = i."cardInstrumentId"
      and ci."organizationId" = i."organizationId"
      and ci."financialProfileId" = i."financialProfileId"
     left join "Category" cat
       on cat."id" = coalesce(t."categoryId", r."categoryId")
      and cat."organizationId" = i."organizationId"
      and cat."financialProfileId" = i."financialProfileId"
     where ${where.join(" and ")}
     order by i."dueOn" desc, i."sequenceNumber" desc, i."createdAt" desc`,
    params,
  );

  return rows.map(mapInstallmentHistoryRow);
}

function addEqualsFilter(
  where: string[],
  params: unknown[],
  columnExpression: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  params.push(value);
  where.push(`${columnExpression} = $${params.length}`);
}

function validateFilters(filters: ListInstallmentsFilters): void {
  if (
    filters.status !== undefined &&
    filters.status !== "all" &&
    !VALID_INSTALLMENT_STATUSES.includes(filters.status)
  ) {
    throwInstallmentsFilterInvalid("Status de parcela invalido.");
  }

  if (filters.dueFrom !== undefined && !isIsoDate(filters.dueFrom)) {
    throwInstallmentsFilterInvalid("Data inicial de vencimento invalida.");
  }

  if (filters.dueTo !== undefined && !isIsoDate(filters.dueTo)) {
    throwInstallmentsFilterInvalid("Data final de vencimento invalida.");
  }

  if (filters.dueFrom !== undefined && filters.dueTo !== undefined && filters.dueFrom > filters.dueTo) {
    throwInstallmentsFilterInvalid("Periodo de vencimento invertido.");
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function throwInstallmentsFilterInvalid(message: string): never {
  throw Object.assign(new Error(message), {
    code: "INSTALLMENTS_FILTER_INVALID",
    statusCode: 400,
  });
}

function mapInstallmentHistoryRow(row: Row): InstallmentHistoryItem {
  const blockedReason = resolveEditBlockedReason(row);
  const installment: InstallmentHistoryItem = {
    id: text(row.id),
    organizationId: text(row.organizationId),
    financialProfileId: text(row.financialProfileId),
    status: lower(row.status) as InstallmentStatus,
    sequenceNumber: numberValue(row.sequenceNumber),
    totalInstallments: numberValue(row.totalInstallments),
    dueOn: dateOnly(row.dueOn),
    amountMinor: numberValue(row.amountMinor),
    currency: text(row.currency),
    editable: blockedReason === undefined,
  };

  if (blockedReason !== undefined) installment.editBlockedReason = blockedReason;
  attachTransaction(installment, row);
  attachRecurrence(installment, row);
  attachInvoice(installment, row);
  attachCard(installment, row);
  attachCardInstrument(installment, row);
  attachCategory(installment, row);

  return installment;
}

function attachTransaction(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.transactionId) return;
  installment.transaction = {
    id: text(row.transactionId),
    status: lower(row.transactionStatus) as TransactionStatus,
    kind: lower(row.transactionKind),
    source: lower(row.transactionSource),
    amountMinor: numberValue(row.transactionAmountMinor ?? row.amountMinor),
    currency: text(row.transactionCurrency ?? row.currency),
    occurredOn: dateOnly(row.transactionOccurredOn ?? row.dueOn),
    plannedOn: dateOnly(row.transactionPlannedOn ?? row.dueOn),
    description: text(row.transactionDescription),
    ...optionalId("accountId", row.transactionAccountId),
    ...optionalId("cardId", row.transactionCardId),
    ...optionalId("cardInstrumentId", row.transactionCardInstrumentId),
    ...optionalId("invoiceId", row.transactionInvoiceId),
    ...optionalId("categoryId", row.transactionCategoryId),
    ...optionalId("recurrenceId", row.transactionRecurrenceId),
  };
}

function attachRecurrence(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.recurrenceId) return;
  installment.recurrence = {
    id: text(row.recurrenceId),
    status: lower(row.recurrenceStatus),
    kind: lower(row.recurrenceKind),
    frequency: lower(row.recurrenceFrequency),
    interval: numberValue(row.recurrenceInterval ?? 1),
    description: text(row.recurrenceDescription),
  };
}

function attachInvoice(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.invoiceId) return;
  installment.invoice = {
    id: text(row.invoiceId),
    status: lower(row.invoiceStatus) as InvoiceStatus,
    cardId: text(row.invoiceCardId),
    periodStartOn: dateOnly(row.invoicePeriodStartOn ?? row.dueOn),
    periodEndOn: dateOnly(row.invoicePeriodEndOn ?? row.dueOn),
    dueOn: dateOnly(row.invoiceDueOn ?? row.dueOn),
  };
}

function attachCard(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.cardId || !row.cardName) return;
  installment.card = {
    id: text(row.cardId),
    name: text(row.cardName),
    status: lower(row.cardStatus),
  };
}

function attachCardInstrument(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.cardInstrumentId) return;
  installment.cardInstrument = {
    id: text(row.cardInstrumentId),
    cardId: text(row.cardId ?? row.transactionCardId),
    type: lower(row.cardInstrumentType),
    holder: lower(row.cardInstrumentHolder),
    status: lower(row.cardInstrumentStatus),
    isDefault: row.cardInstrumentIsDefault === true,
    ...optionalText("name", row.cardInstrumentName),
    ...optionalText("maskedIdentifier", row.cardInstrumentMaskedIdentifier),
  };
}

function attachCategory(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.categoryId || !row.categoryName) return;
  installment.category = {
    id: text(row.categoryId),
    name: text(row.categoryName),
    kind: lower(row.categoryKind),
    status: lower(row.categoryStatus),
  };
}

function resolveEditBlockedReason(row: Row): InstallmentEditBlockedReason | undefined {
  if (!row.transactionId || !row.transactionStatus) return "linked_transaction_missing";
  if (lower(row.status) !== "planned") return "installment_status_locked";
  if (lower(row.transactionStatus) !== "planned") return "transaction_status_locked";
  if (row.invoiceId) return "invoice_linked";

  return undefined;
}

function optionalId(key: string, value: unknown): Record<string, string> {
  return value ? { [key]: text(value) } : {};
}

function optionalText(key: string, value: unknown): Record<string, string> {
  return value ? { [key]: text(value) } : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function dateOnly(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : text(value);
}
