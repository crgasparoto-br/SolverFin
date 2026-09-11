import type { EntityId, TenantContext } from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { toDateOnly } from "./repository-date-utils.js";
import {
  closeInvoiceForContext as closeInvoiceForContextCore,
  InvoiceContractError,
  listCardPurchasesForContext as listCardPurchasesForContextCore,
  summarizeInvoiceForContext as summarizeInvoiceForContextCore,
  updateCardPurchaseForContext as updateCardPurchaseForContextCore,
  type CardPurchaseContract,
  type CardPurchaseFilters,
  type InvoiceSummaryContract,
  type UpdateCardPurchasePayload,
  type UpdateCardPurchaseResult,
} from "./card-invoice-contracts-core.js";

export * from "./card-invoice-contracts-core.js";

export interface CanonicalCardPurchaseContract extends CardPurchaseContract {
  purchaseAmountMinor?: number;
  purchaseOccurredOn?: string;
  installmentSequenceNumber?: number;
  totalInstallments?: number;
  installmentEditLocked?: boolean;
}

interface InvoicePurchaseCurrencyRow {
  invoiceCurrency: string;
  purchaseCurrency: string | null;
}

interface PurchaseInvoiceIdRow {
  invoiceId: string | null;
}

interface InvoiceOccurrenceStatsRow {
  purchasesCount: number | string;
  reconciledExpensesMinor: number | string | null;
  unreconciledExpensesMinor: number | string | null;
}

interface CanonicalPurchaseRow {
  id: string;
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
  amountMinor: number | string;
  currency: string;
  status: string;
  reconciledAt: Date | null;
  purchaseAmountMinor: number | string | null;
  purchaseOccurredOn: Date | null;
  installmentSequenceNumber: number | null;
  totalInstallments: number | null;
  installmentEditLocked: boolean;
}

interface PurchaseMutationRow {
  id: string;
  financialProfileId: string;
  cardId: string;
  invoiceId: string | null;
  categoryId: string | null;
  cardInstrumentId: string | null;
  amountMinor: number | string;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  description: string;
  status: string;
  reconciledAt: Date | null;
}

interface CanonicalInstallmentRow {
  id: string;
  invoiceId: string | null;
  installmentStatus: string;
  invoiceStatus: string | null;
  installmentCurrency: string;
  invoiceCurrency: string | null;
}

const LOCKED_INVOICE_STATUSES = new Set(["CLOSED", "PAID", "CANCELLED"]);

export async function summarizeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  await assertInvoiceCurrencyIntegrity(context, invoiceId);
  const summary = await summarizeInvoiceForContextCore(context, invoiceId);
  const [stats] = await query<InvoiceOccurrenceStatsRow>(
    `with "invoice_items" as (
       select t."status", t."amountMinor"
         from "Transaction" t
        where t."organizationId" = $1
          and t."financialProfileId" = $2
          and t."invoiceId" = $3
          and t."cardId" is not null
          and t."accountId" is null
          and t."kind" = 'EXPENSE'
          and not exists (
            select 1
              from "Installment" i
             where i."organizationId" = t."organizationId"
               and i."financialProfileId" = t."financialProfileId"
               and i."transactionId" = t."id"
               and i."recurrenceId" is null
          )
       union all
       select t."status", i."amountMinor"
         from "Installment" i
         join "Transaction" t
           on t."id" = i."transactionId"
          and t."organizationId" = i."organizationId"
          and t."financialProfileId" = i."financialProfileId"
        where i."organizationId" = $1
          and i."financialProfileId" = $2
          and i."invoiceId" = $3
          and i."recurrenceId" is null
          and t."cardId" is not null
          and t."accountId" is null
          and t."kind" = 'EXPENSE'
     )
     select count(*)::int as "purchasesCount",
            coalesce(sum(case when "status" = 'RECONCILED' then "amountMinor" else 0 end), 0)::bigint as "reconciledExpensesMinor",
            coalesce(sum(case when "status" <> 'RECONCILED' then "amountMinor" else 0 end), 0)::bigint as "unreconciledExpensesMinor"
       from "invoice_items"`,
    [context.organizationId, context.financialProfileId, invoiceId],
  );

  return {
    ...summary,
    purchasesCount: toNumber(stats?.purchasesCount),
    reconciledExpensesMinor: toNumber(stats?.reconciledExpensesMinor),
    unreconciledExpensesMinor: toNumber(stats?.unreconciledExpensesMinor),
  };
}

export async function listCardPurchasesForContext(
  context: TenantContext,
  filters: CardPurchaseFilters = {},
): Promise<CanonicalCardPurchaseContract[]> {
  if (!filters.invoiceId) {
    return listCardPurchasesForContextCore(context, filters);
  }

  const params: unknown[] = [context.organizationId, context.financialProfileId, filters.invoiceId];
  const where: string[] = [`"invoiceId" = $3`];
  addOptionalFilter(where, params, filters.cardId, `"cardId"`);

  if (filters.occurredFrom) {
    params.push(filters.occurredFrom);
    where.push(`"occurredOn" >= $${params.length}`);
  }
  if (filters.occurredTo) {
    params.push(filters.occurredTo);
    where.push(`"occurredOn" <= $${params.length}`);
  }
  if (filters.reconciliation === "reconciled") where.push(`"status" = 'RECONCILED'`);
  if (filters.reconciliation === "unreconciled") where.push(`"status" <> 'RECONCILED'`);
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`"description" ilike $${params.length}`);
  }

  const rows = await query<CanonicalPurchaseRow>(
    `with "purchase_items" as (
       select
         t."id", t."financialProfileId", t."cardId", t."cardInstrumentId", t."invoiceId",
         t."categoryId", t."recurrenceId", t."installmentId", t."occurredOn", t."plannedOn",
         t."description", t."amountMinor", t."currency", t."status", t."reconciledAt",
         null::bigint as "purchaseAmountMinor", null::date as "purchaseOccurredOn",
         null::int as "installmentSequenceNumber", null::int as "totalInstallments",
         false as "installmentEditLocked"
       from "Transaction" t
       where t."organizationId" = $1
         and t."financialProfileId" = $2
         and t."invoiceId" = $3
         and t."cardId" is not null
         and t."accountId" is null
         and t."kind" = 'EXPENSE'
         and not exists (
           select 1
             from "Installment" i
            where i."organizationId" = t."organizationId"
              and i."financialProfileId" = t."financialProfileId"
              and i."transactionId" = t."id"
              and i."recurrenceId" is null
         )
       union all
       select
         t."id", t."financialProfileId", t."cardId", t."cardInstrumentId", i."invoiceId",
         t."categoryId", t."recurrenceId", i."id" as "installmentId", i."dueOn" as "occurredOn",
         i."dueOn" as "plannedOn", t."description", i."amountMinor", t."currency", t."status",
         t."reconciledAt", t."amountMinor" as "purchaseAmountMinor", t."occurredOn" as "purchaseOccurredOn",
         i."sequenceNumber" as "installmentSequenceNumber", i."totalInstallments",
         exists (
           select 1
             from "Installment" si
             left join "Invoice" sinv
               on sinv."id" = si."invoiceId"
              and sinv."organizationId" = si."organizationId"
              and sinv."financialProfileId" = si."financialProfileId"
            where si."organizationId" = i."organizationId"
              and si."financialProfileId" = i."financialProfileId"
              and si."transactionId" = i."transactionId"
              and si."recurrenceId" is null
              and (si."invoiceId" is null or sinv."id" is null or sinv."status" in ('CLOSED', 'PAID', 'CANCELLED'))
         ) as "installmentEditLocked"
       from "Installment" i
       join "Transaction" t
         on t."id" = i."transactionId"
        and t."organizationId" = i."organizationId"
        and t."financialProfileId" = i."financialProfileId"
       where i."organizationId" = $1
         and i."financialProfileId" = $2
         and i."invoiceId" = $3
         and i."recurrenceId" is null
         and t."cardId" is not null
         and t."accountId" is null
         and t."kind" = 'EXPENSE'
     )
     select * from "purchase_items"
      where ${where.join(" and ")}
      order by "occurredOn" desc, "id" desc`,
    params,
  );

  return rows.map(mapCanonicalPurchaseRow);
}

export async function updateCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  payload: UpdateCardPurchasePayload,
): Promise<UpdateCardPurchaseResult> {
  const invoiceId = await findPurchaseInvoiceId(context, cardId, transactionId);
  if (invoiceId) await assertInvoiceCurrencyIntegrity(context, invoiceId);

  const installments = await findCanonicalPurchaseInstallments(context, transactionId);
  if (installments.length === 0) {
    return updateCardPurchaseForContextCore(context, cardId, transactionId, payload);
  }

  const current = await findPurchaseForMutation(context, cardId, transactionId);
  assertCanonicalInstallmentIntegrity(current, installments);
  assertCanonicalInstallmentMutationAllowed(current, payload);

  const nextDescription =
    payload.description === undefined
      ? current.description
      : normalizeDescription(payload.description);
  const nextCategoryId =
    payload.categoryId === undefined ? current.categoryId : normalizeOptionalId(payload.categoryId);
  const nextCardInstrumentId = payload.cardInstrumentId ?? current.cardInstrumentId;

  if (payload.cardInstrumentId !== undefined) {
    await assertActiveCardInstrumentBelongsToCard(context, cardId, payload.cardInstrumentId);
  }

  const now = new Date().toISOString();
  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `update "Transaction"
          set "description" = $4, "categoryId" = $5, "cardInstrumentId" = $6,
              "updatedAt" = $7, "updatedByUserId" = $8
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        current.id,
        context.organizationId,
        context.financialProfileId,
        nextDescription,
        nextCategoryId,
        nextCardInstrumentId,
        now,
        context.userId,
      ],
    );

    await executeQuery(
      `update "Installment"
          set "cardInstrumentId" = $4, "updatedAt" = $5, "updatedByUserId" = $6
        where "transactionId" = $1 and "organizationId" = $2 and "financialProfileId" = $3
          and "recurrenceId" is null`,
      [
        current.id,
        context.organizationId,
        context.financialProfileId,
        nextCardInstrumentId,
        now,
        context.userId,
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
        ...(current.description !== nextDescription ? { description: "changed" as const } : {}),
        ...(current.categoryId !== nextCategoryId ? { categoryId: "changed" as const } : {}),
        ...(current.cardInstrumentId !== nextCardInstrumentId
          ? { cardInstrumentId: "changed" as const }
          : {}),
      },
    });
  });

  const refreshed = await findPurchaseForMutation(context, cardId, transactionId);
  return {
    transaction: mapPurchaseMutationRow(refreshed),
    invoice: await summarizeInvoiceForContext(context, requireInvoiceId(refreshed.invoiceId)),
  };
}

export async function closeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  await assertInvoiceCurrencyIntegrity(context, invoiceId);
  await closeInvoiceForContextCore(context, invoiceId);
  return summarizeInvoiceForContext(context, invoiceId);
}

async function findCanonicalPurchaseInstallments(
  context: TenantContext,
  transactionId: EntityId,
): Promise<CanonicalInstallmentRow[]> {
  return query<CanonicalInstallmentRow>(
    `select i."id", i."invoiceId", i."status" as "installmentStatus",
            inv."status" as "invoiceStatus", i."currency" as "installmentCurrency",
            inv."currency" as "invoiceCurrency"
       from "Installment" i
       left join "Invoice" inv
         on inv."id" = i."invoiceId"
        and inv."organizationId" = i."organizationId"
        and inv."financialProfileId" = i."financialProfileId"
      where i."transactionId" = $1
        and i."organizationId" = $2
        and i."financialProfileId" = $3
        and i."recurrenceId" is null
      order by i."sequenceNumber" asc`,
    [transactionId, context.organizationId, context.financialProfileId],
  );
}

async function findPurchaseForMutation(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<PurchaseMutationRow> {
  const rows = await query<PurchaseMutationRow>(
    `select "id", "financialProfileId", "cardId", "invoiceId", "categoryId", "cardInstrumentId", "amountMinor",
            "currency", "occurredOn", "plannedOn", "description", "status", "reconciledAt"
       from "Transaction"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "cardId" = $4 and "invoiceId" is not null and "accountId" is null and "kind" = 'EXPENSE'
      limit 1`,
    [transactionId, context.organizationId, context.financialProfileId, cardId],
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error("Compra nao encontrada no contexto financeiro ativo."), {
      code: "TENANT_RESOURCE_NOT_FOUND",
      statusCode: 404,
    });
  }
  return row;
}

function assertCanonicalInstallmentIntegrity(
  purchase: PurchaseMutationRow,
  installments: readonly CanonicalInstallmentRow[],
): void {
  for (const installment of installments) {
    if (!installment.invoiceId || !installment.invoiceStatus || !installment.invoiceCurrency) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_INSTALLMENT_LINK_INVALID",
        "O parcelamento nao possui vinculo canonico completo com a fatura.",
        409,
      );
    }
    if (
      normalizeCurrency(installment.installmentCurrency) !== normalizeCurrency(purchase.currency) ||
      normalizeCurrency(installment.invoiceCurrency) !== normalizeCurrency(purchase.currency)
    ) {
      throw new InvoiceContractError(
        "CARD_INVOICE_CURRENCY_MISMATCH",
        "Purchase currency must match the invoice currency before invoice totals can be used.",
        409,
      );
    }
    if (LOCKED_INVOICE_STATUSES.has(installment.invoiceStatus)) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_INVOICE_LOCKED",
        "Compras parceladas nao podem ser alteradas quando alguma fatura vinculada esta fechada, paga ou cancelada.",
        409,
      );
    }
  }
}

function assertCanonicalInstallmentMutationAllowed(
  current: PurchaseMutationRow,
  payload: UpdateCardPurchasePayload,
): void {
  if (payload.invoiceId !== undefined && payload.invoiceId !== current.invoiceId) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_INVALID",
      "Compra nao pertence a fatura informada.",
      409,
    );
  }

  const changesAmount =
    payload.amountMinor !== undefined && payload.amountMinor !== toNumber(current.amountMinor);
  const changesDate =
    payload.occurredOn !== undefined && payload.occurredOn !== toDateOnly(current.occurredOn);
  const changesStatus =
    payload.status !== undefined && payload.status.trim().toUpperCase() !== current.status;

  if (changesAmount || changesDate || changesStatus) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INSTALLMENT_STRUCTURE_LOCKED",
      "Valor, data, quantidade e distribuicao de uma compra parcelada nao podem ser alterados. Edite apenas descricao, categoria ou instrumento.",
      409,
    );
  }
}

async function assertActiveCardInstrumentBelongsToCard(
  context: TenantContext,
  cardId: EntityId,
  cardInstrumentId: EntityId,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `select "id" from "CardInstrument"
      where "id" = $1 and "cardId" = $2 and "organizationId" = $3
        and "financialProfileId" = $4 and "status" = 'ACTIVE'
      limit 1`,
    [cardInstrumentId, cardId, context.organizationId, context.financialProfileId],
  );
  if (!rows[0]) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INSTRUMENT_INVALID",
      "Instrumento da compra deve estar ativo e pertencer ao cartao.",
    );
  }
}

async function findPurchaseInvoiceId(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<string | undefined> {
  const rows = await query<PurchaseInvoiceIdRow>(
    `select "invoiceId" from "Transaction"
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
    `with "purchase_currencies" as (
       select t."invoiceId", t."organizationId", t."financialProfileId", t."currency"
         from "Transaction" t
        where t."accountId" is null
          and t."kind" = 'EXPENSE'
          and not exists (
            select 1 from "Installment" ci
             where ci."organizationId" = t."organizationId"
               and ci."financialProfileId" = t."financialProfileId"
               and ci."transactionId" = t."id"
               and ci."recurrenceId" is null
          )
       union all
       select ci."invoiceId", ci."organizationId", ci."financialProfileId", ci."currency"
         from "Installment" ci
        where ci."recurrenceId" is null
          and ci."invoiceId" is not null
          and ci."transactionId" is not null
     )
     select i."currency" as "invoiceCurrency", p."currency" as "purchaseCurrency"
       from "Invoice" i
       left join "purchase_currencies" p
         on p."invoiceId" = i."id"
        and p."organizationId" = i."organizationId"
        and p."financialProfileId" = i."financialProfileId"
      where i."id" = $1 and i."organizationId" = $2 and i."financialProfileId" = $3`,
    [invoiceId, context.organizationId, context.financialProfileId],
  );
  if (rows.length === 0) return;
  const invoiceCurrency = normalizeCurrency(rows[0]?.invoiceCurrency);
  const mismatch =
    !invoiceCurrency ||
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

function mapCanonicalPurchaseRow(row: CanonicalPurchaseRow): CanonicalCardPurchaseContract {
  return {
    id: row.id,
    financialProfileId: row.financialProfileId,
    cardId: row.cardId,
    ...(row.cardInstrumentId ? { cardInstrumentId: row.cardInstrumentId } : {}),
    ...(row.invoiceId ? { invoiceId: row.invoiceId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    ...(row.recurrenceId ? { recurrenceId: row.recurrenceId } : {}),
    ...(row.installmentId ? { installmentId: row.installmentId } : {}),
    occurredOn: toDateOnly(row.occurredOn),
    plannedOn: toDateOnly(row.plannedOn),
    description: row.description,
    amountMinor: toNumber(row.amountMinor),
    currency: row.currency,
    status: row.status.toLowerCase(),
    ...(row.reconciledAt ? { reconciledAt: row.reconciledAt.toISOString() } : {}),
    ...(row.purchaseAmountMinor !== null
      ? { purchaseAmountMinor: toNumber(row.purchaseAmountMinor) }
      : {}),
    ...(row.purchaseOccurredOn ? { purchaseOccurredOn: toDateOnly(row.purchaseOccurredOn) } : {}),
    ...(row.installmentSequenceNumber !== null
      ? { installmentSequenceNumber: row.installmentSequenceNumber }
      : {}),
    ...(row.totalInstallments !== null ? { totalInstallments: row.totalInstallments } : {}),
    ...(row.installmentSequenceNumber !== null
      ? { installmentEditLocked: row.installmentEditLocked }
      : {}),
  };
}

function mapPurchaseMutationRow(row: PurchaseMutationRow): CardPurchaseContract {
  return {
    id: row.id,
    financialProfileId: row.financialProfileId,
    cardId: row.cardId,
    ...(row.cardInstrumentId ? { cardInstrumentId: row.cardInstrumentId } : {}),
    ...(row.invoiceId ? { invoiceId: row.invoiceId } : {}),
    ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    occurredOn: toDateOnly(row.occurredOn),
    plannedOn: toDateOnly(row.plannedOn),
    description: row.description,
    amountMinor: toNumber(row.amountMinor),
    currency: row.currency,
    status: row.status.toLowerCase(),
    ...(row.reconciledAt ? { reconciledAt: row.reconciledAt.toISOString() } : {}),
  };
}

function addOptionalFilter(
  where: string[],
  params: unknown[],
  value: string | undefined,
  column: string,
): void {
  if (!value?.trim()) return;
  params.push(value);
  where.push(`${column} = $${params.length}`);
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
  if (value === null) return null;
  return value.trim() || null;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized ?? "") ? normalized : undefined;
}

function requireInvoiceId(invoiceId: string | null): string {
  if (!invoiceId) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_INVALID",
      "Compra nao pertence a uma fatura valida.",
      409,
    );
  }
  return invoiceId;
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}
