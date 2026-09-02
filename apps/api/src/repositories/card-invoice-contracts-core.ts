import { TenantAuthorizationError, type EntityId, type TenantContext } from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { toDateOnly } from "./repository-date-utils.js";

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
  cardInstrumentId?: EntityId;
  invoiceId?: EntityId;
  categoryId?: EntityId;
  recurrenceId?: EntityId;
  installmentId?: EntityId;
  occurredOn: string;
  plannedOn: string;
  description: string;
  amountMinor: number;
  currency: string;
  status: string;
  reconciledAt?: string;
}

export interface UpdateCardPurchasePayload {
  invoiceId?: EntityId;
  amountMinor?: number;
  occurredOn?: string;
  description?: string;
  categoryId?: EntityId | null;
  cardInstrumentId?: EntityId;
  status?: string;
}

export interface UpdateCardPurchaseResult {
  transaction: CardPurchaseContract;
  invoice: InvoiceSummaryContract;
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

const LOCKED_CARD_PURCHASE_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);

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
  const cardTotals = await buildCardTotals(context, [invoice.cardId], invoice);

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
    `select "id", "organizationId", "financialProfileId", "cardId", "cardInstrumentId", "invoiceId",
            "categoryId", "recurrenceId", "installmentId", "occurredOn", "plannedOn", "description",
            "amountMinor", "currency", "status", "reconciledAt", "updatedAt"
       from "Transaction"
       where ${where.join(" and ")}
       order by "occurredOn" desc, "createdAt" desc`,
    params,
  );

  return rows.map(mapPurchaseRow);
}

export async function updateCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: UpdateCardPurchasePayload,
): Promise<UpdateCardPurchaseResult> {
  const current = await findCardPurchase(context, cardId, transactionId);
  const invoice = current.invoiceId ? await findInvoice(context, current.invoiceId) : undefined;

  if (!invoice || invoice.cardId !== cardId || current.invoiceId === null) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_INVALID",
      "Compra nao pertence a fatura informada.",
      409,
    );
  }

  if (payload.invoiceId !== undefined && payload.invoiceId !== invoice.id) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_INVALID",
      "Compra nao pertence a fatura informada.",
      409,
    );
  }

  if (LOCKED_CARD_PURCHASE_INVOICE_STATUSES.has(invoice.status)) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_LOCKED",
      "Compras de faturas fechadas, pagas ou canceladas nao podem ser editadas.",
      409,
    );
  }

  const occurredOn = payload.occurredOn ?? toDateOnly(current.occurredOn);

  if (!isIsoDate(occurredOn)) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_DATE_INVALID",
      "Informe uma data valida para a compra.",
    );
  }

  const periodStartOn = toDateOnly(invoice.periodStartOn);
  const periodEndOn = toDateOnly(invoice.periodEndOn);

  if (occurredOn < periodStartOn || occurredOn > periodEndOn) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_DATE_OUT_OF_INVOICE_PERIOD",
      "A data da compra precisa permanecer dentro do periodo da fatura atual.",
      409,
    );
  }

  const nextAmountMinor =
    payload.amountMinor !== undefined
      ? validatePositiveAmount(payload.amountMinor)
      : current.amountMinor;
  const nextDescription =
    payload.description !== undefined
      ? normalizeDescription(payload.description)
      : current.description;
  const nextStatus =
    payload.status !== undefined ? normalizePurchaseStatus(payload.status) : current.status;
  const nextCategoryId =
    payload.categoryId !== undefined ? normalizeOptionalId(payload.categoryId) : current.categoryId;
  const nextCardInstrumentId = payload.cardInstrumentId ?? current.cardInstrumentId;

  if (payload.cardInstrumentId !== undefined) {
    await assertActiveCardInstrumentBelongsToCard(context, cardId, payload.cardInstrumentId);
  }

  const now = new Date().toISOString();
  const amountDelta = nextAmountMinor - current.amountMinor;
  const nextReconciledAt = resolveReconciledAt(nextStatus, current.reconciledAt, now);

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `update "Transaction" set
        "categoryId" = $4, "cardInstrumentId" = $5, "status" = $6, "amountMinor" = $7,
        "occurredOn" = $8, "plannedOn" = $8, "description" = $9, "reconciledAt" = $10,
        "updatedAt" = $11, "updatedByUserId" = $12
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        current.id,
        context.organizationId,
        context.financialProfileId,
        nextCategoryId,
        nextCardInstrumentId,
        nextStatus,
        nextAmountMinor,
        occurredOn,
        nextDescription,
        nextReconciledAt,
        now,
        context.userId,
      ],
    );

    if (current.installmentId !== null) {
      await executeQuery(
        `update "Installment" set
          "cardInstrumentId" = $4, "status" = $5, "dueOn" = $6, "amountMinor" = $7,
          "currency" = $8, "updatedAt" = $9
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [
          current.installmentId,
          context.organizationId,
          context.financialProfileId,
          nextCardInstrumentId,
          mapTransactionStatusToInstallmentStatus(nextStatus),
          occurredOn,
          nextAmountMinor,
          current.currency,
          now,
        ],
      );
    }

    if (amountDelta !== 0) {
      await executeQuery(
        `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4, "updatedAt" = $5
         where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [invoice.id, context.organizationId, context.financialProfileId, amountDelta, now],
      );
    }

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "transaction",
      entityId: current.id,
      redactedChanges: buildPurchaseAuditChanges(current, {
        amountMinor: nextAmountMinor,
        occurredOn,
        description: nextDescription,
        categoryId: nextCategoryId,
        cardInstrumentId: nextCardInstrumentId,
        status: nextStatus,
      }),
    });
  });

  return {
    transaction: await findCardPurchase(context, cardId, transactionId).then(mapPurchaseRow),
    invoice: await summarizeInvoiceForContext(context, invoice.id),
  };
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

async function findCardPurchase(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<CardPurchaseRow> {
  const rows = await query<CardPurchaseRow>(
    `select "id", "organizationId", "financialProfileId", "cardId", "cardInstrumentId", "invoiceId",
            "categoryId", "recurrenceId", "installmentId", "occurredOn", "plannedOn", "description",
            "amountMinor", "currency", "status", "reconciledAt", "updatedAt"
       from "Transaction"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
         and "cardId" = $4 and "invoiceId" is not null and "accountId" is null and "kind" = 'EXPENSE'`,
    [transactionId, context.organizationId, context.financialProfileId, cardId],
  );
  const row = rows[0];

  if (!row) {
    throw notFoundError();
  }

  return row;
}

async function assertActiveCardInstrumentBelongsToCard(
  context: TenantContext,
  cardId: EntityId,
  cardInstrumentId: EntityId,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `select "id" from "CardInstrument"
     where "id" = $1 and "cardId" = $2 and "organizationId" = $3 and "financialProfileId" = $4 and "status" = 'ACTIVE'
     limit 1`,
    [cardInstrumentId, cardId, context.organizationId, context.financialProfileId],
  );

  if (rows[0] === undefined) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INSTRUMENT_INVALID",
      "Instrumento da compra deve estar ativo e pertencer ao cartao.",
    );
  }
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

function buildPurchaseAuditChanges(
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

function validatePositiveAmount(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_AMOUNT_INVALID",
      "Valor da compra deve ser maior que zero.",
    );
  }

  return value;
}

function normalizeDescription(value: string): string {
  const description = value.trim();

  if (!description) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_DESCRIPTION_REQUIRED",
      "Descricao da compra e obrigatoria.",
    );
  }

  return description;
}

function normalizeOptionalId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized ? normalized : null;
}

function normalizePurchaseStatus(status: string): string {
  const normalized = status.trim().toUpperCase();

  if (normalized === "POSTED" || normalized === "RECONCILED" || normalized === "PLANNED") {
    return normalized;
  }

  throw new InvoiceContractError(
    "CARD_PURCHASE_STATUS_INVALID",
    "Status da compra de cartao invalido.",
  );
}

function resolveReconciledAt(status: string, current: Date | null, now: string): string | null {
  if (status === "RECONCILED") {
    return current?.toISOString() ?? now;
  }

  return null;
}

function mapTransactionStatusToInstallmentStatus(status: string): string {
  if (status === "RECONCILED") {
    return "RECONCILED";
  }

  if (status === "PLANNED") {
    return "PLANNED";
  }

  return "POSTED";
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
