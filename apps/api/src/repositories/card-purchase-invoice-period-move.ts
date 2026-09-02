import {
  calculateInvoicePeriod,
  type EntityId,
  type InvoicePeriod,
  type TenantContext,
} from "@solverfin/domain";

import { query } from "../db.js";
import { InvoiceContractError } from "./card-invoice-contracts.js";
import {
  moveCardPurchaseInvoicePeriodForContext as moveCardPurchaseInvoicePeriodForContextCore,
  type MoveCardPurchaseInvoicePeriodPayload,
  type MoveCardPurchaseInvoicePeriodResult,
} from "./card-purchase-invoice-period-move-core.js";

export * from "./card-purchase-invoice-period-move-core.js";

interface MoveCurrencyContextRow {
  purchaseCurrency: string;
  originInvoiceCurrency: string;
  originInvoiceStatus: string;
  closingDay: number;
  dueDay: number;
}

interface DestinationCurrencyRow {
  currency: string;
  status: string;
}

const LOCKED_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);
const INVOICE_PERIOD_PATTERN = /^\d{4}-\d{2}$/;

export async function moveCardPurchaseInvoicePeriodForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: MoveCardPurchaseInvoicePeriodPayload,
): Promise<MoveCardPurchaseInvoicePeriodResult> {
  await assertMoveCurrencyIntegrity(context, cardId, transactionId, payload);
  return moveCardPurchaseInvoicePeriodForContextCore(context, cardId, transactionId, payload);
}

async function assertMoveCurrencyIntegrity(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: MoveCardPurchaseInvoicePeriodPayload,
): Promise<void> {
  const rows = await query<MoveCurrencyContextRow>(
    `select
        t."currency" as "purchaseCurrency",
        i."currency" as "originInvoiceCurrency",
        i."status" as "originInvoiceStatus",
        c."closingDay",
        c."dueDay"
       from "Transaction" t
       join "Invoice" i
         on i."id" = t."invoiceId"
        and i."organizationId" = t."organizationId"
        and i."financialProfileId" = t."financialProfileId"
       join "Card" c
         on c."id" = t."cardId"
        and c."organizationId" = t."organizationId"
        and c."financialProfileId" = t."financialProfileId"
      where t."id" = $1 and t."organizationId" = $2 and t."financialProfileId" = $3
        and t."cardId" = $4 and t."accountId" is null and t."kind" = 'EXPENSE'
      limit 1`,
    [transactionId, context.organizationId, context.financialProfileId, cardId],
  );
  const row = rows[0];

  if (row === undefined || LOCKED_INVOICE_STATUSES.has(row.originInvoiceStatus)) {
    return;
  }

  assertSameCurrency(row.purchaseCurrency, row.originInvoiceCurrency);

  const destinationPeriod = tryResolveDestinationPeriod(row, payload.invoicePeriod);

  if (destinationPeriod === undefined) {
    return;
  }

  const destinationRows = await query<DestinationCurrencyRow>(
    `select "currency", "status"
       from "Invoice"
      where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
        and "periodStartOn" = $4 and "periodEndOn" = $5
      limit 1`,
    [
      context.organizationId,
      context.financialProfileId,
      cardId,
      destinationPeriod.periodStartOn,
      destinationPeriod.periodEndOn,
    ],
  );
  const destination = destinationRows[0];

  if (destination === undefined || LOCKED_INVOICE_STATUSES.has(destination.status)) {
    return;
  }

  assertSameCurrency(row.purchaseCurrency, destination.currency);
}

function assertSameCurrency(purchaseCurrency: string, invoiceCurrency: string): void {
  const purchase = normalizeCurrency(purchaseCurrency);
  const invoice = normalizeCurrency(invoiceCurrency);

  if (purchase === undefined || invoice === undefined || purchase !== invoice) {
    throw new InvoiceContractError(
      "CARD_INVOICE_CURRENCY_MISMATCH",
      "Purchase currency must match the invoice currency before moving invoice periods.",
      409,
    );
  }
}

function tryResolveDestinationPeriod(
  card: Pick<MoveCurrencyContextRow, "closingDay" | "dueDay">,
  invoicePeriod: string,
): InvoicePeriod | undefined {
  if (!INVOICE_PERIOD_PATTERN.test(invoicePeriod)) {
    return undefined;
  }

  const [year, month] = invoicePeriod.split("-").map(Number) as [number, number];

  if (month < 1 || month > 12) {
    return undefined;
  }

  const closingDay = Math.min(card.closingDay, lastDayOfMonth(year, month));
  const closingDate = `${invoicePeriod}-${String(closingDay).padStart(2, "0")}`;
  return calculateInvoicePeriod(card, closingDate);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}
