import type { InstallmentStatus, InvoiceStatus, TransactionStatus } from "@solverfin/domain";
import type { InstallmentHistoryItem, InstallmentEditBlockedReason } from "./installments.js";

type Row = Record<string, unknown>;

export function mapInstallmentHistoryRow(row: Row): InstallmentHistoryItem {
  const blockedReason = resolveEditBlockedReason(row);
  const installment: InstallmentHistoryItem = {
    id: text(row.id),
    organizationId: text(row.organizationId),
    financialProfileId: text(row.financialProfileId),
    ...(row.recurrenceId ? { recurrenceId: text(row.recurrenceId) } : {}),
    status: lower(row.status) as InstallmentStatus,
    sequenceNumber: numberValue(row.sequenceNumber),
    totalInstallments: numberValue(row.totalInstallments),
    dueOn: dateOnly(row.dueOn),
    amountMinor: numberValue(row.amountMinor),
    currency: text(row.currency),
    editable: blockedReason === undefined,
    amountEditable: canEditInstallmentAmount(row),
  };

  if (row.initialSequenceNumber !== null && row.initialSequenceNumber !== undefined) {
    installment.initialSequenceNumber = numberValue(row.initialSequenceNumber);
  }

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
  if (!row.transactionId) {
    return;
  }

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
    note: text(row.transactionNote),
    ...optionalId("accountId", row.transactionAccountId),
    ...optionalId("cardId", row.transactionCardId),
    ...optionalId("cardInstrumentId", row.transactionCardInstrumentId),
    ...optionalId("invoiceId", row.transactionInvoiceId),
    ...optionalId("categoryId", row.transactionCategoryId),
    ...optionalId("recurrenceId", row.transactionRecurrenceId),
  };
}

function attachRecurrence(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.recurrenceId) {
    return;
  }

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
  if (!row.invoiceId) {
    return;
  }

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
  if (!row.cardId || !row.cardName) {
    return;
  }

  installment.card = {
    id: text(row.cardId),
    name: text(row.cardName),
    status: lower(row.cardStatus),
  };
}

function attachCardInstrument(installment: InstallmentHistoryItem, row: Row): void {
  if (!row.cardInstrumentId) {
    return;
  }

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
  if (!row.categoryId || !row.categoryName) {
    return;
  }

  installment.category = {
    id: text(row.categoryId),
    name: text(row.categoryName),
    kind: lower(row.categoryKind),
    status: lower(row.categoryStatus),
  };
}

/**
 * Amount adjustment has its own eligibility: posted-but-unreconciled parcels may
 * be corrected without enabling generic edits to posted transaction metadata.
 */
export function canEditInstallmentAmount(row: Readonly<Record<string, unknown>>): boolean {
  if (
    !row.transactionId ||
    !row.transactionStatus ||
    row.invoiceId ||
    row.cardId ||
    row.transactionCardId ||
    lower(row.recurrenceStatus) === "cancelled"
  )
    return false;
  const installmentStatus = lower(row.status);
  const transactionStatus = lower(row.transactionStatus);
  return (
    (installmentStatus === "planned" && transactionStatus === "planned") ||
    (installmentStatus === "posted" && transactionStatus === "posted")
  );
}

export function resolveEditBlockedReason(
  row: Readonly<Record<string, unknown>>,
): InstallmentEditBlockedReason | undefined {
  if (!row.transactionId || !row.transactionStatus) {
    return "linked_transaction_missing";
  }

  if (row.invoiceId) {
    return "invoice_linked";
  }

  if (lower(row.recurrenceStatus) === "cancelled") {
    return "recurrence_cancelled";
  }

  if (lower(row.status) !== "planned") {
    return "installment_status_locked";
  }

  if (lower(row.transactionStatus) !== "planned") {
    return "transaction_status_locked";
  }

  return undefined;
}

export function readNestedId(record: Record<string, unknown> | undefined): string | undefined {
  return typeof record?.id === "string" && record.id.trim() ? record.id : undefined;
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
