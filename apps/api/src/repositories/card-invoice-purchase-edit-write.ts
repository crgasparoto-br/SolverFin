import type { EntityId, TenantContext } from "@solverfin/domain";

import type { QueryExecutor } from "../db.js";
import { InvoiceContractError } from "./card-invoice-contracts-core.js";

const LOCKED_CARD_PURCHASE_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);

export function assertCardPurchaseInvoiceStatusEditable(status: string): void {
  if (LOCKED_CARD_PURCHASE_INVOICE_STATUSES.has(status)) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_LOCKED",
      "Compras de faturas fechadas, pagas ou canceladas nao podem ser editadas.",
      409,
    );
  }
}

/** Lock the invoice and commit an eligible delta or roll back the purchase edit. */
export async function applyEditableCardPurchaseInvoiceChangeInTransaction(
  executeQuery: QueryExecutor,
  context: TenantContext,
  cardId: EntityId,
  invoiceId: EntityId,
  currency: string,
  amountDelta: number,
  now: string,
): Promise<void> {
  const lockedInvoice = await executeQuery<{ id: string; status: string }>(
    `select "id", "status" from "Invoice"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "cardId" = $4 and "currency" = $5
      for update`,
    [invoiceId, context.organizationId, context.financialProfileId, cardId, currency],
  );
  if (!lockedInvoice[0] || LOCKED_CARD_PURCHASE_INVOICE_STATUSES.has(lockedInvoice[0].status)) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_LOCKED",
      "A fatura foi fechada ou alterada durante a edição.",
      409,
    );
  }

  if (amountDelta === 0) return;

  const adjustedInvoice = await executeQuery<{ id: string }>(
    `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4, "updatedAt" = $5
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "cardId" = $6 and "currency" = $7
        and "status" not in ('CLOSED', 'PAID', 'CANCELLED')
        and "totalAmountMinor" + $4 >= 0
      returning "id"`,
    [
      invoiceId,
      context.organizationId,
      context.financialProfileId,
      amountDelta,
      now,
      cardId,
      currency,
    ],
  );
  if (adjustedInvoice.length !== 1) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_TOTAL_INVALID",
      "A fatura foi alterada ou o saldo é incompatível com a edição.",
      409,
    );
  }
}
