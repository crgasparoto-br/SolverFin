import type { EntityId, TenantContext } from "@solverfin/domain";

import { query } from "../db.js";
import {
  closeInvoiceForContext as closeInvoiceForContextCore,
  InvoiceContractError,
  summarizeInvoiceForContext as summarizeInvoiceForContextCore,
  updateCardPurchaseForContext as updateCardPurchaseForContextCore,
  type InvoiceSummaryContract,
  type UpdateCardPurchasePayload,
  type UpdateCardPurchaseResult,
} from "./card-invoice-contracts-core.js";

export * from "./card-invoice-contracts-core.js";

interface InvoicePurchaseCurrencyRow {
  invoiceCurrency: string;
  purchaseCurrency: string | null;
}

interface PurchaseInvoiceIdRow {
  invoiceId: string | null;
}

export async function summarizeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  await assertInvoiceCurrencyIntegrity(context, invoiceId);
  return summarizeInvoiceForContextCore(context, invoiceId);
}

export async function updateCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: UpdateCardPurchasePayload,
): Promise<UpdateCardPurchaseResult> {
  const invoiceId = await findPurchaseInvoiceId(context, cardId, transactionId);

  if (invoiceId !== undefined) {
    await assertInvoiceCurrencyIntegrity(context, invoiceId);
  }

  return updateCardPurchaseForContextCore(context, cardId, transactionId, payload);
}

export async function closeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  await assertInvoiceCurrencyIntegrity(context, invoiceId);
  return closeInvoiceForContextCore(context, invoiceId);
}

async function findPurchaseInvoiceId(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<string | undefined> {
  const rows = await query<PurchaseInvoiceIdRow>(
    `select "invoiceId"
       from "Transaction"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "cardId" = $4 and "invoiceId" is not null and "accountId" is null and "kind" = 'EXPENSE'
      limit 1`,
    [transactionId, context.organizationId, context.financialProfileId, cardId],
  );

  return rows[0]?.invoiceId ?? undefined;
}

async function assertInvoiceCurrencyIntegrity(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<void> {
  const rows = await query<InvoicePurchaseCurrencyRow>(
    `select i."currency" as "invoiceCurrency", t."currency" as "purchaseCurrency"
       from "Invoice" i
       left join "Transaction" t
         on t."invoiceId" = i."id"
        and t."organizationId" = i."organizationId"
        and t."financialProfileId" = i."financialProfileId"
        and t."cardId" = i."cardId"
        and t."accountId" is null
        and t."kind" = 'EXPENSE'
      where i."id" = $1 and i."organizationId" = $2 and i."financialProfileId" = $3`,
    [invoiceId, context.organizationId, context.financialProfileId],
  );

  if (rows.length === 0) {
    return;
  }

  const invoiceCurrency = normalizeCurrency(rows[0]?.invoiceCurrency);
  const mismatch =
    invoiceCurrency === undefined ||
    rows.some(
      (row) =>
        row.purchaseCurrency !== null &&
        normalizeCurrency(row.purchaseCurrency) !== invoiceCurrency,
    );

  if (mismatch) {
    throw new InvoiceContractError(
      "CARD_INVOICE_CURRENCY_MISMATCH",
      "Purchase currency must match the invoice currency before invoice totals can be used.",
      409,
    );
  }
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}
