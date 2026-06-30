import { TenantAuthorizationError, type EntityId, type TenantContext } from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

export type PurchaseReconciliationFilter = "all" | "reconciled" | "unreconciled";

export interface CardPurchaseFilters {
  invoiceId?: EntityId;
  cardId?: EntityId;
  occurredFrom?: string;
  occurredTo?: string;
  reconciliation?: PurchaseReconciliationFilter;
  search?: string;
}

export interface CardPurchaseContract {
  id: EntityId;
  financialProfileId: EntityId;
  cardId: EntityId;
  invoiceId?: EntityId;
  categoryId?: EntityId;
  recurrenceId?: EntityId;
  occurredOn: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
  reconciledAt?: string;
}

export interface InvoiceSummaryContract {
  invoiceId: EntityId;
  financialProfileId: EntityId;
  cardId: EntityId;
  cardName: string;
  cardMaskedIdentifier?: string;
  status: string;
  periodStartOn: string;
  closingOn: string;
  dueOn: string;
  previousBalanceMinor: number;
  totalExpensesMinor: number;
  totalPaidMinor: number;
  amountDueMinor: number;
  reconciledExpensesMinor: number;
  unreconciledExpensesMinor: number;
  purchasesCount: number;
  cardTotals: readonly InvoiceCardTotalContract[];
}

export interface InvoiceCardTotalContract {
  cardId: EntityId;
  cardName: string;
  maskedIdentifier?: string;
  limitTotalMinor: number;
  limitUsedMinor: number;
  limitAvailableMinor: number;
  invoiceTotalMinor: number;
  invoiceAmountDueMinor: number;
}

interface InvoiceContractRow {
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

interface CardContractRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  name: string;
  maskedIdentifier: string | null;
  creditLimitMinor: number | null;
}

interface CardPurchaseRow {
  id: string;
  financialProfileId: string;
  cardId: string;
  invoiceId: string | null;
  categoryId: string | null;
  recurrenceId: string | null;
  occurredOn: Date;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
  reconciledAt: Date | null;
}

interface PurchaseTotalsRow {
  purchasesCount: number | string;
  reconciledExpensesMinor: number | string | null;
  unreconciledExpensesMinor: number | string | null;
}

interface LimitUsedRow {
  limitUsedMinor: number | string | null;
}

export class InvoiceContractError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "InvoiceContractError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function summarizeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  const invoice = await findInvoice(context, invoiceId);
  const card = await findCard(context, invoice.cardId);
  const [totals] = await query<PurchaseTotalsRow>(
    `select
        count(*)::int as "purchasesCount",
        coalesce(sum(case when "status" = 'RECONCILED' then "amountMinor" else 0 end), 0)::int as "reconciledExpensesMinor",
        coalesce(sum(case when "status" <> 'RECONCILED' then "amountMinor" else 0 end), 0)::int as "unreconciledExpensesMinor"
       from "Transaction"
       where "organizationId" = $1 and "financialProfileId" = $2 and "invoiceId" = $3 and "cardId" = $4
         and "accountId" is null`,
    [context.organizationId, context.financialProfileId, invoice.id, invoice.cardId],
  );
  const amountDueMinor = calculateAmountDue(invoice);
  const familyCardIds = await resolveFamilyCardIds(context, invoice.cardId);
  const cardTotals = await buildCardTotals(context, familyCardIds, invoice);

  return {
    invoiceId: invoice.id,
    financialProfileId: invoice.financialProfileId,
    cardId: invoice.cardId,
    cardName: card.name,
    ...(card.maskedIdentifier !== null ? { cardMaskedIdentifier: card.maskedIdentifier } : {}),
    status: invoice.status.toLowerCase(),
    periodStartOn: toDateOnly(invoice.periodStartOn),
    closingOn: toDateOnly(invoice.periodEndOn),
    dueOn: toDateOnly(invoice.dueOn),
    previousBalanceMinor: 0,
    totalExpensesMinor: invoice.totalAmountMinor,
    totalPaidMinor: invoice.status === "PAID" ? invoice.totalAmountMinor : 0,
    amountDueMinor,
    reconciledExpensesMinor: toNumber(totals?.reconciledExpensesMinor),
    unreconciledExpensesMinor: toNumber(totals?.unreconciledExpensesMinor),
    purchasesCount: toNumber(totals?.purchasesCount),
    cardTotals,
  };
}

async function resolveFamilyCardIds(context: TenantContext, cardId: EntityId): Promise<EntityId[]> {
  const [membership] = await query<{ groupCardId: string }>(
    `select "groupCardId" from "CardAdditionalLink"
       where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3`,
    [context.organizationId, context.financialProfileId, cardId],
  );
  const groupCardId = membership?.groupCardId ?? cardId;
  const rows = await query<{ cardId: string }>(
    `select "cardId" from "CardAdditionalLink"
       where "organizationId" = $1 and "financialProfileId" = $2 and "groupCardId" = $3`,
    [context.organizationId, context.financialProfileId, groupCardId],
  );

  return rows.length > 0 ? rows.map((row) => row.cardId) : [cardId];
}

async function buildCardTotals(
  context: TenantContext,
  familyCardIds: readonly EntityId[],
  sharedInvoice: InvoiceContractRow,
): Promise<InvoiceCardTotalContract[]> {
  const invoiceTotalMinor = sharedInvoice.totalAmountMinor;
  const invoiceAmountDueMinor = calculateAmountDue(sharedInvoice);

  return Promise.all(
    familyCardIds.map(async (familyCardId) => {
      const familyCard = await findCard(context, familyCardId);
      const limitUsedMinor = await calculateLimitUsedForCard(context, familyCardId);
      const limitTotalMinor = familyCard.creditLimitMinor ?? 0;

      return {
        cardId: familyCard.id,
        cardName: familyCard.name,
        ...(familyCard.maskedIdentifier !== null
          ? { maskedIdentifier: familyCard.maskedIdentifier }
          : {}),
        limitTotalMinor,
        limitUsedMinor,
        limitAvailableMinor: Math.max(0, limitTotalMinor - limitUsedMinor),
        invoiceTotalMinor,
        invoiceAmountDueMinor,
      };
    }),
  );
}

export async function listCardPurchasesForContext(
  context: TenantContext,
  filters: CardPurchaseFilters = {},
): Promise<CardPurchaseContract[]> {
  const where: string[] = [
    `"organizationId" = $1`,
    `"financialProfileId" = $2`,
    `"cardId" is not null`,
    `"accountId" is null`,
    `"kind" = 'EXPENSE'`,
  ];
  const params: unknown[] = [context.organizationId, context.financialProfileId];

  addOptionalFilter(where, params, filters.invoiceId, `"invoiceId"`);
  addOptionalFilter(where, params, filters.cardId, `"cardId"`);

  if (filters.occurredFrom !== undefined) {
    params.push(filters.occurredFrom);
    where.push(`"occurredOn" >= $${params.length}`);
  }

  if (filters.occurredTo !== undefined) {
    params.push(filters.occurredTo);
    where.push(`"occurredOn" <= $${params.length}`);
  }

  if (filters.reconciliation === "reconciled") {
    where.push(`"status" = 'RECONCILED'`);
  }

  if (filters.reconciliation === "unreconciled") {
    where.push(`"status" <> 'RECONCILED'`);
  }

  if (filters.search !== undefined && filters.search.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`"description" ilike $${params.length}`);
  }

  const rows = await query<CardPurchaseRow>(
    `select "id", "financialProfileId", "cardId", "invoiceId", "categoryId", "recurrenceId", "occurredOn",
            "description", "amountMinor", "currency", "status", "reconciledAt"
       from "Transaction"
       where ${where.join(" and ")}
       order by "occurredOn" desc, "createdAt" desc`,
    params,
  );

  return rows.map(mapPurchaseRow);
}

export async function closeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  const invoice = await findInvoice(context, invoiceId);

  if (invoice.status !== "OPEN") {
    throw new InvoiceContractError("CARD_INVOICE_NOT_OPEN", "Only open invoices can be closed.");
  }

  const now = new Date().toISOString();

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `update "Invoice" set "status" = 'CLOSED', "updatedAt" = $4
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [invoice.id, context.organizationId, context.financialProfileId, now],
    );
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "invoice",
      entityId: invoice.id,
      redactedChanges: { status: "changed" },
    });
  });

  return summarizeInvoiceForContext(context, invoice.id);
}

async function findInvoice(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceContractRow> {
  const rows = await query<InvoiceContractRow>(
    `select "id", "organizationId", "financialProfileId", "cardId", "status", "periodStartOn",
            "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt", "paymentTransactionId",
            "updatedAt"
       from "Invoice"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [invoiceId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    throw notFoundError();
  }

  return row;
}

async function findCard(context: TenantContext, cardId: EntityId): Promise<CardContractRow> {
  const rows = await query<CardContractRow>(
    `select "id", "organizationId", "financialProfileId", "name", "maskedIdentifier", "creditLimitMinor"
       from "Card"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    throw notFoundError();
  }

  return row;
}

async function calculateLimitUsedForCard(
  context: TenantContext,
  cardId: EntityId,
): Promise<number> {
  const [row] = await query<LimitUsedRow>(
    `select coalesce(sum(t."amountMinor"), 0)::int as "limitUsedMinor"
       from "Transaction" t
       join "Invoice" i on i."id" = t."invoiceId"
       where t."organizationId" = $1 and t."financialProfileId" = $2 and t."cardId" = $3
         and t."accountId" is null and t."kind" = 'EXPENSE'
         and i."status" in ('OPEN', 'CLOSED', 'OVERDUE')`,
    [context.organizationId, context.financialProfileId, cardId],
  );

  return toNumber(row?.limitUsedMinor);
}

function addOptionalFilter(
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

function calculateAmountDue(invoice: InvoiceContractRow): number {
  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return 0;
  }

  return invoice.totalAmountMinor;
}

function mapPurchaseRow(row: CardPurchaseRow): CardPurchaseContract {
  return {
    id: row.id,
    financialProfileId: row.financialProfileId,
    cardId: row.cardId,
    ...(row.invoiceId !== null ? { invoiceId: row.invoiceId } : {}),
    ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
    ...(row.recurrenceId !== null ? { recurrenceId: row.recurrenceId } : {}),
    occurredOn: toDateOnly(row.occurredOn),
    description: row.description,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status.toLowerCase(),
    ...(row.reconciledAt !== null ? { reconciledAt: row.reconciledAt.toISOString() } : {}),
  };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function notFoundError(): TenantAuthorizationError {
  return new TenantAuthorizationError(
    "TENANT_RESOURCE_NOT_FOUND",
    "Resource was not found in the active financial context.",
    404,
  );
}
