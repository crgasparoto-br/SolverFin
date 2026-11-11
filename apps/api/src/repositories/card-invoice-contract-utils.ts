import { TenantAuthorizationError } from "@solverfin/domain";
import { InvoiceContractError } from "./card-invoice-contract-error.js";
import { toDateOnly } from "./repository-date-utils.js";
import type { CardPurchaseContract, CardPurchaseRow, InvoiceContractRow } from "./card-invoice-contracts-core.js";

export function addOptionalFilter(
  where: string[],
  params: unknown[],
  value: string | undefined,
  column: string,
): void {
  if (value === undefined || value.trim() === "") {
    return;
  }

  params.push(value);
  where.push(`${column} = $${params.length}`);
}

export function calculateAmountDue(invoice: InvoiceContractRow): number {
  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return 0;
  }

  return invoice.totalAmountMinor;
}

export function mapPurchaseRow(row: CardPurchaseRow): CardPurchaseContract {
  return {
    kind: row.kind === "INCOME" ? "income" : "expense",
    id: row.id,
    financialProfileId: row.financialProfileId,
    cardId: row.cardId,
    ...(row.cardInstrumentId !== null ? { cardInstrumentId: row.cardInstrumentId } : {}),
    ...(row.invoiceId !== null ? { invoiceId: row.invoiceId } : {}),
    ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
    ...(row.recurrenceId !== null ? { recurrenceId: row.recurrenceId } : {}),
    ...(row.installmentId !== null ? { installmentId: row.installmentId } : {}),
    occurredOn: toDateOnly(row.occurredOn),
    plannedOn: toDateOnly(row.plannedOn),
    description: row.description,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status.toLowerCase(),
    ...(row.reconciledAt !== null ? { reconciledAt: row.reconciledAt.toISOString() } : {}),
  };
}

export function buildPurchaseAuditChanges(
  current: CardPurchaseRow,
  next: {
    amountMinor: number;
    occurredOn: string;
    description: string;
    categoryId: string | null;
    cardInstrumentId: string | null;
    status: string;
  },
) {
  return {
    ...(current.amountMinor !== next.amountMinor ? { amountMinor: "changed" as const } : {}),
    ...(toDateOnly(current.occurredOn) !== next.occurredOn
      ? { occurredOn: "changed" as const }
      : {}),
    ...(current.description !== next.description ? { description: "changed" as const } : {}),
    ...(current.categoryId !== next.categoryId ? { categoryId: "changed" as const } : {}),
    ...(current.cardInstrumentId !== next.cardInstrumentId
      ? { cardInstrumentId: "changed" as const }
      : {}),
    ...(current.status !== next.status ? { status: "changed" as const } : {}),
  };
}

export function validatePositiveAmount(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_AMOUNT_INVALID",
      "Valor da compra deve ser maior que zero.",
    );
  }

  return value;
}

export function normalizeDescription(value: string): string {
  const description = value.trim();

  if (!description) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_DESCRIPTION_REQUIRED",
      "Descricao da compra e obrigatoria.",
    );
  }

  return description;
}

export function normalizeOptionalId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized ? normalized : null;
}

export function normalizePurchaseStatus(status: string): string {
  const normalized = status.trim().toUpperCase();

  if (normalized === "POSTED" || normalized === "RECONCILED" || normalized === "PLANNED") {
    return normalized;
  }

  throw new InvoiceContractError(
    "CARD_PURCHASE_STATUS_INVALID",
    "Status da compra de cartao invalido.",
  );
}

export function resolveReconciledAt(status: string, current: Date | null, now: string): string | null {
  if (status === "RECONCILED") {
    return current?.toISOString() ?? now;
  }

  return null;
}

export function mapTransactionStatusToInstallmentStatus(status: string): string {
  if (status === "RECONCILED") {
    return "RECONCILED";
  }

  if (status === "PLANNED") {
    return "PLANNED";
  }

  return "POSTED";
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

export function notFoundError(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Resource was not found in the active financial context.",
    404,
  );
}
