import type { EntityId, TenantContext } from "@solverfin/domain";

import type { QueryExecutor } from "../db.js";
import { InvoiceContractError } from "./card-invoice-contracts-core.js";

/** Keep both invoice adjustments in the caller's transaction; rollback both on a stale invoice. */
export async function moveInvoiceTotalsInTransaction(
  executeQuery: QueryExecutor,
  context: TenantContext,
  cardId: EntityId,
  currency: string,
  originInvoiceId: EntityId,
  destinationInvoiceId: EntityId,
  amountMinor: number,
  now: string,
): Promise<void> {
  await updateOpenInvoiceTotal(
    executeQuery,
    context,
    cardId,
    originInvoiceId,
    currency,
    -amountMinor,
    now,
    "CARD_PURCHASE_INVOICE_LOCKED",
    "A fatura de origem mudou durante a transferência.",
  );
  await updateOpenInvoiceTotal(
    executeQuery,
    context,
    cardId,
    destinationInvoiceId,
    currency,
    amountMinor,
    now,
    "CARD_PURCHASE_DESTINATION_INVOICE_LOCKED",
    "A fatura de destino mudou durante a transferência.",
  );
}

async function updateOpenInvoiceTotal(
  executeQuery: QueryExecutor,
  context: TenantContext,
  cardId: EntityId,
  invoiceId: EntityId,
  currency: string,
  deltaMinor: number,
  now: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const updated = await executeQuery<{ id: string }>(
    `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $6, "updatedAt" = $7
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "cardId" = $4 and "status" = 'OPEN' and "currency" = $5
     returning "id"`,
    [
      invoiceId,
      context.organizationId,
      context.financialProfileId,
      cardId,
      currency,
      deltaMinor,
      now,
    ],
  );
  if (updated.length !== 1) {
    throw new InvoiceContractError(errorCode, errorMessage, 409);
  }
}
