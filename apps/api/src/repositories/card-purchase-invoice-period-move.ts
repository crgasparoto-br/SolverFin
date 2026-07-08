import { randomUUID } from "node:crypto";

import {
  calculateInvoicePeriod,
  type EntityId,
  type InvoicePeriod,
  type TenantContext,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import {
  InvoiceContractError,
  summarizeInvoiceForContext,
  type CardPurchaseContract,
  type InvoiceSummaryContract,
} from "./card-invoice-contracts.js";

export interface MoveCardPurchaseInvoicePeriodPayload {
  invoicePeriod: string;
}

export interface MoveCardPurchaseInvoicePeriodResult {
  transaction: CardPurchaseContract;
  originInvoice: InvoiceSummaryContract;
  destinationInvoice: InvoiceSummaryContract;
  installmentScope: "selected_purchase";
  recurrenceScope: "materialized_occurrence_only";
}

interface CardForMoveRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  closingDay: number;
  dueDay: number;
}

interface InvoiceForMoveRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  cardId: string;
  status: string;
  periodStartOn: Date;
  periodEndOn: Date;
  dueOn: Date;
  totalAmountMinor: number;
  currency: string;
  paidAt: Date | null;
  paymentTransactionId: string | null;
  updatedAt: Date;
}

interface PurchaseForMoveRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  cardId: string;
  cardInstrumentId: string | null;
  invoiceId: string | null;
  categoryId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  occurredOn: Date;
  plannedOn: Date;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
  reconciledAt: Date | null;
  updatedAt: Date;
}

interface InstallmentAmountForMoveRow {
  amountMinor: number;
}

const LOCKED_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);
const invoicePeriodPattern = /^\d{4}-\d{2}$/;

export async function moveCardPurchaseInvoicePeriodForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: MoveCardPurchaseInvoicePeriodPayload,
): Promise<MoveCardPurchaseInvoicePeriodResult> {
  const [card, current] = await Promise.all([
    findCardForMove(context, cardId),
    findPurchaseForMove(context, cardId, transactionId),
  ]);
  const originInvoice = current.invoiceId
    ? await findInvoiceForMove(context, current.invoiceId)
    : undefined;

  if (!originInvoice || originInvoice.cardId !== cardId || current.invoiceId === null) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_INVALID",
      "Compra nao pertence a fatura informada.",
      409,
    );
  }

  assertInvoiceEditable(originInvoice, "CARD_PURCHASE_INVOICE_LOCKED");

  const destinationPeriod = resolveDestinationPeriod(card, payload.invoicePeriod);

  if (
    toDateOnly(originInvoice.periodStartOn) === destinationPeriod.periodStartOn &&
    toDateOnly(originInvoice.periodEndOn) === destinationPeriod.periodEndOn
  ) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_PERIOD_UNCHANGED",
      "A compra ja pertence ao periodo de fatura informado.",
      409,
    );
  }

  const existingDestinationInvoice = await findInvoiceByPeriodForMove(
    context,
    cardId,
    destinationPeriod,
  );

  if (existingDestinationInvoice !== undefined) {
    assertInvoiceEditable(existingDestinationInvoice, "CARD_PURCHASE_DESTINATION_INVOICE_LOCKED");
  }

  const destinationInvoice =
    existingDestinationInvoice ?? buildNewInvoice(context, cardId, destinationPeriod, current);
  const invoiceMoveAmountMinor = await resolveInvoiceMoveAmountMinor(
    context,
    current,
    originInvoice,
  );
  const destinationOccurredOn = resolveMovedPurchaseDate(current, destinationPeriod);
  const now = new Date().toISOString();

  await withTransaction(async (executeQuery) => {
    if (existingDestinationInvoice === undefined) {
      await executeQuery(
        `insert into "Invoice"
          ("id", "organizationId", "financialProfileId", "cardId", "paymentTransactionId", "status",
           "periodStartOn", "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, null, 'OPEN', $5, $6, $7, 0, $8, null, $9, $9)`,
        [
          destinationInvoice.id,
          context.organizationId,
          context.financialProfileId,
          cardId,
          destinationPeriod.periodStartOn,
          destinationPeriod.periodEndOn,
          destinationPeriod.dueOn,
          current.currency,
          now,
        ],
      );
    }

    await executeQuery(
      `update "Transaction" set
         "invoiceId" = $4, "occurredOn" = $5, "plannedOn" = $5,
         "updatedAt" = $6, "updatedByUserId" = $7
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        current.id,
        context.organizationId,
        context.financialProfileId,
        destinationInvoice.id,
        destinationOccurredOn,
        now,
        context.userId,
      ],
    );

    if (current.installmentId !== null) {
      await executeQuery(
        `update "Installment" set "dueOn" = $4, "updatedAt" = $5
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [
          current.installmentId,
          context.organizationId,
          context.financialProfileId,
          destinationPeriod.dueOn,
          now,
        ],
      );
    }

    await executeQuery(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" - $4, "updatedAt" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        originInvoice.id,
        context.organizationId,
        context.financialProfileId,
        invoiceMoveAmountMinor,
        now,
      ],
    );

    await executeQuery(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4, "updatedAt" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        destinationInvoice.id,
        context.organizationId,
        context.financialProfileId,
        invoiceMoveAmountMinor,
        now,
      ],
    );

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "transaction",
      entityId: current.id,
      redactedChanges: {
        invoiceId: "changed",
        invoicePeriod: "changed",
        occurredOn: "changed",
        ...(current.installmentId !== null ? { installmentId: "changed" as const } : {}),
        ...(current.recurrenceId !== null ? { recurrenceId: "changed" as const } : {}),
      },
    });
  });

  return {
    transaction: await findPurchaseForMove(context, cardId, transactionId).then(mapPurchaseForMove),
    originInvoice: await summarizeInvoiceForContext(context, originInvoice.id),
    destinationInvoice: await summarizeInvoiceForContext(context, destinationInvoice.id),
    installmentScope: "selected_purchase",
    recurrenceScope: "materialized_occurrence_only",
  };
}

async function findCardForMove(context: TenantContext, cardId: EntityId): Promise<CardForMoveRow> {
  const rows = await query<CardForMoveRow>(
    `select "id", "organizationId", "financialProfileId", "closingDay", "dueDay"
       from "Card"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (row === undefined) {
    throw notFoundError();
  }

  return row;
}

async function findPurchaseForMove(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<PurchaseForMoveRow> {
  const rows = await query<PurchaseForMoveRow>(
    `select "id", "organizationId", "financialProfileId", "cardId", "cardInstrumentId", "invoiceId",
            "categoryId", "recurrenceId", "installmentId", "occurredOn", "plannedOn", "description",
            "amountMinor", "currency", "status", "reconciledAt", "updatedAt"
       from "Transaction"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "cardId" = $4 and "invoiceId" is not null and "accountId" is null and "kind" = 'EXPENSE'`,
    [transactionId, context.organizationId, context.financialProfileId, cardId],
  );
  const row = rows[0];

  if (row === undefined) {
    throw notFoundError();
  }

  return row;
}

async function findInvoiceForMove(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceForMoveRow> {
  const rows = await query<InvoiceForMoveRow>(
    `select "id", "organizationId", "financialProfileId", "cardId", "status", "periodStartOn",
            "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt", "paymentTransactionId",
            "updatedAt"
       from "Invoice"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [invoiceId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (row === undefined) {
    throw notFoundError();
  }

  return row;
}

async function findInvoiceByPeriodForMove(
  context: TenantContext,
  cardId: EntityId,
  period: InvoicePeriod,
): Promise<InvoiceForMoveRow | undefined> {
  const rows = await query<InvoiceForMoveRow>(
    `select "id", "organizationId", "financialProfileId", "cardId", "status", "periodStartOn",
            "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt", "paymentTransactionId",
            "updatedAt"
       from "Invoice"
      where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
        and "periodStartOn" = $4 and "periodEndOn" = $5
      limit 1`,
    [
      context.organizationId,
      context.financialProfileId,
      cardId,
      period.periodStartOn,
      period.periodEndOn,
    ],
  );

  return rows[0];
}

async function resolveInvoiceMoveAmountMinor(
  context: TenantContext,
  purchase: PurchaseForMoveRow,
  originInvoice: InvoiceForMoveRow,
): Promise<number> {
  if (purchase.installmentId !== null) {
    return findInstallmentAmountMinor(context, purchase.installmentId);
  }

  const installmentAmountMinor = await findInstallmentAmountMinorByDueOn(
    context,
    purchase,
    toDateOnly(originInvoice.dueOn),
  );

  return installmentAmountMinor ?? purchase.amountMinor;
}

async function findInstallmentAmountMinor(
  context: TenantContext,
  installmentId: EntityId,
): Promise<number> {
  const rows = await query<InstallmentAmountForMoveRow>(
    `select "amountMinor"
       from "Installment"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [installmentId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (row === undefined) {
    throw notFoundError();
  }

  return row.amountMinor;
}

async function findInstallmentAmountMinorByDueOn(
  context: TenantContext,
  purchase: PurchaseForMoveRow,
  dueOn: string,
): Promise<number | undefined> {
  const rows = await query<InstallmentAmountForMoveRow>(
    `select "amountMinor"
       from "Installment"
      where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
        and ($4::uuid is null or "cardInstrumentId" = $4)
        and "recurrenceId" is null and "dueOn" = $5 and "totalInstallments" > 1
        and "amountMinor" <= $6
      order by "updatedAt" desc
      limit 1`,
    [
      context.organizationId,
      context.financialProfileId,
      purchase.cardId,
      purchase.cardInstrumentId,
      dueOn,
      purchase.amountMinor,
    ],
  );

  return rows[0]?.amountMinor;
}

function buildNewInvoice(
  context: TenantContext,
  cardId: EntityId,
  period: InvoicePeriod,
  purchase: PurchaseForMoveRow,
): InvoiceForMoveRow {
  return {
    id: randomUUID(),
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    cardId,
    status: "OPEN",
    periodStartOn: new Date(`${period.periodStartOn}T00:00:00.000Z`),
    periodEndOn: new Date(`${period.periodEndOn}T00:00:00.000Z`),
    dueOn: new Date(`${period.dueOn}T00:00:00.000Z`),
    totalAmountMinor: 0,
    currency: purchase.currency,
    paidAt: null,
    paymentTransactionId: null,
    updatedAt: new Date(),
  };
}

function resolveDestinationPeriod(card: CardForMoveRow, invoicePeriod: string): InvoicePeriod {
  if (!invoicePeriodPattern.test(invoicePeriod)) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_PERIOD_INVALID",
      "Informe o periodo da fatura no formato AAAA-MM.",
    );
  }

  const [year, month] = invoicePeriod.split("-").map(Number) as [number, number];

  if (month < 1 || month > 12) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_PERIOD_INVALID",
      "Informe o periodo da fatura no formato AAAA-MM.",
    );
  }

  const closingDay = Math.min(card.closingDay, lastDayOfMonth(year, month));
  const closingDate = `${invoicePeriod}-${String(closingDay).padStart(2, "0")}`;

  return calculateInvoicePeriod(card, closingDate);
}

function resolveMovedPurchaseDate(
  purchase: PurchaseForMoveRow,
  destinationPeriod: InvoicePeriod,
): string {
  const originalDay = Number(toDateOnly(purchase.occurredOn).slice(8, 10));
  const destinationYearMonth = destinationPeriod.periodEndOn.slice(0, 7);
  const [year, month] = destinationYearMonth.split("-").map(Number) as [number, number];
  const candidate = `${destinationYearMonth}-${String(Math.min(originalDay, lastDayOfMonth(year, month))).padStart(2, "0")}`;

  if (candidate < destinationPeriod.periodStartOn) {
    return destinationPeriod.periodStartOn;
  }

  if (candidate > destinationPeriod.periodEndOn) {
    return destinationPeriod.periodEndOn;
  }

  return candidate;
}

function assertInvoiceEditable(invoice: InvoiceForMoveRow, code: string): void {
  if (LOCKED_INVOICE_STATUSES.has(invoice.status)) {
    throw new InvoiceContractError(
      code,
      "Compras de faturas fechadas, pagas ou canceladas nao podem ser movidas.",
      409,
    );
  }
}

function mapPurchaseForMove(row: PurchaseForMoveRow): CardPurchaseContract {
  return {
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

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function notFoundError(): InvoiceContractError {
  return new InvoiceContractError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Resource was not found in the active financial context.",
    404,
  );
}
