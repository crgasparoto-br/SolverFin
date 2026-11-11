import { InvoiceContractError } from "./card-invoice-contract-error.js";
export { InvoiceContractError } from "./card-invoice-contract-error.js";
import {
  addOptionalFilter,
  calculateAmountDue,
  mapPurchaseRow,
  buildPurchaseAuditChanges,
  validatePositiveAmount,
  normalizeDescription,
  normalizeOptionalId,
  normalizePurchaseStatus,
  resolveReconciledAt,
  mapTransactionStatusToInstallmentStatus,
  toNumber,
  notFoundError,
  isIsoDate,
} from "./card-invoice-contract-utils.js";
export { isIsoDate } from "./card-invoice-contract-utils.js";
import type { EntityId, TenantContext } from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import {
  applyEditableCardPurchaseInvoiceChangeInTransaction,
  assertCardPurchaseInvoiceStatusEditable,
  LOCKED_CARD_PURCHASE_INVOICE_STATUSES,
} from "./card-invoice-purchase-edit-write.js";
import {
  checkRecurringEdit,
  loadPurchaseInstallmentEditStates,
  purchaseInstallmentEditViolation,
  type PurchaseInstallmentEditState,
} from "./card-invoice-purchase-edit-guard.js";
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
  /** Financial direction comes from Transaction.kind, never its description. */
  kind: "expense" | "income";
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

export interface InvoiceContractRow {
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

export interface CardPurchaseRow {
  kind: "EXPENSE" | "INCOME";
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

function assertPurchaseInstallmentsEditable(rows: readonly PurchaseInstallmentEditState[]): void {
  const violation = purchaseInstallmentEditViolation(rows);
  if (violation) throw new InvoiceContractError(violation.code, violation.message, 409);
}

export async function summarizeInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<InvoiceSummaryContract> {
  const invoice = await findInvoice(context, invoiceId);
  const card = await findCard(context, invoice.cardId);
  const [totals] = await query<PurchaseTotalsRow>(
    `with invoice_occurrences as (
       select t."status"::text as "status", case when t."kind" = 'INCOME' then -t."amountMinor" else t."amountMinor" end as "amountMinor"
         from "Transaction" t
        where t."organizationId" = $1 and t."financialProfileId" = $2
          and t."invoiceId" = $3 and t."cardId" = $4 and t."accountId" is null
          and t."status" <> 'VOIDED'
          and not exists (
            select 1 from "Installment" pi
             where pi."transactionId" = t."id"
               and pi."organizationId" = t."organizationId"
               and pi."financialProfileId" = t."financialProfileId"
          )
       union all
       select i."status"::text as "status", i."amountMinor"
         from "Installment" i
         join "Transaction" p
           on p."id" = i."transactionId"
          and p."organizationId" = i."organizationId"
          and p."financialProfileId" = i."financialProfileId"
        where i."organizationId" = $1 and i."financialProfileId" = $2
          and i."invoiceId" = $3 and i."cardId" = $4
          and p."status" <> 'VOIDED'
     )
     select
        count(*)::int as "purchasesCount",
        coalesce(sum(case when "status" = 'RECONCILED' then "amountMinor" else 0 end), 0)::int as "reconciledExpensesMinor",
        coalesce(sum(case when "status" <> 'RECONCILED' then "amountMinor" else 0 end), 0)::int as "unreconciledExpensesMinor"
       from invoice_occurrences`,
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
    `"status" <> 'VOIDED'`,
    `("kind" = 'EXPENSE' or ("kind" = 'INCOME' and "description" like '%[estorno:%'))`,
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
            "amountMinor", "currency", "kind", "status", "reconciledAt", "updatedAt"
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

  assertCardPurchaseInvoiceStatusEditable(invoice.status);

  const denied = await checkRecurringEdit(query, context, current, invoice.currency, payload);
  if (denied) throw new InvoiceContractError(denied.code, denied.message, 409);

  const purchaseInstallments = await loadPurchaseInstallmentEditStates(query, context, current.id);
  const isInstallmentPurchase = purchaseInstallments.length > 0;
  assertPurchaseInstallmentsEditable(purchaseInstallments);

  if (
    isInstallmentPurchase &&
    (payload.amountMinor !== undefined ||
      payload.occurredOn !== undefined ||
      payload.invoiceId !== undefined ||
      payload.status !== undefined)
  ) {
    throw new InvoiceContractError(
      "CARD_INSTALLMENT_PURCHASE_STRUCTURE_LOCKED",
      "Valor e data do parcelamento nao podem ser alterados. Edite apenas descricao, categoria ou instrumento.",
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
    if (isInstallmentPurchase) {
      const lockedRows = await loadPurchaseInstallmentEditStates(
        executeQuery,
        context,
        current.id,
        true,
      );
      if (lockedRows.length !== purchaseInstallments.length) {
        throw new InvoiceContractError(
          "CARD_INSTALLMENT_RECONCILED_LOCKED",
          "A serie foi alterada durante a edicao.",
          409,
        );
      }
      assertPurchaseInstallmentsEditable(lockedRows);
    }
    // Guard the write using the snapshot read before this transaction.
    const updated = await executeQuery<{ id: string }>(
      `update "Transaction" set
        "categoryId" = $4, "cardInstrumentId" = $5, "status" = $6, "amountMinor" = $7,
        "occurredOn" = $8, "plannedOn" = $8, "description" = $9, "reconciledAt" = $10,
        "updatedAt" = $11, "updatedByUserId" = $12
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
         and "cardId" = $13 and "invoiceId" = $14 and "accountId" is null
         and "status" = $15 and "status" <> 'VOIDED'
         and "amountMinor" = $16 and "updatedAt" = $17
       returning "id"`,
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
        cardId,
        invoice.id,
        current.status,
        current.amountMinor,
        current.updatedAt,
      ],
    );
    if (updated.length !== 1)
      throw new InvoiceContractError(
        "CARD_PURCHASE_CONCURRENT_CHANGE",
        "A compra foi alterada ou anulada durante a edição.",
        409,
      );
    await applyEditableCardPurchaseInvoiceChangeInTransaction(
      executeQuery,
      context,
      cardId,
      invoice.id,
      current.currency,
      amountDelta,
      now,
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

    if (isInstallmentPurchase && payload.cardInstrumentId !== undefined) {
      await executeQuery(
        `update "Installment" set "cardInstrumentId" = $4, "updatedAt" = $5, "updatedByUserId" = $6
          where "transactionId" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [
          current.id,
          context.organizationId,
          context.financialProfileId,
          nextCardInstrumentId,
          now,
          context.userId,
        ],
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

/** A single invoice installment is reconciled without changing its purchase schedule or sibling invoices. */
export async function reconcileInvoiceInstallmentForContext(
  context: TenantContext,
  invoiceId: EntityId,
  installmentId: EntityId,
  status: "posted" | "reconciled",
): Promise<{ installmentId: EntityId; status: string; invoice: InvoiceSummaryContract }> {
  if (status !== "posted" && status !== "reconciled") {
    throw new InvoiceContractError(
      "CARD_INSTALLMENT_STATUS_INVALID",
      "Situação de conciliação inválida.",
    );
  }
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{ status: string; invoiceStatus: string }>(
      `select i."status", inv."status" as "invoiceStatus"
         from "Installment" i
         join "Invoice" inv on inv."id" = i."invoiceId"
           and inv."organizationId" = i."organizationId"
           and inv."financialProfileId" = i."financialProfileId"
         join "Transaction" t on t."id" = i."transactionId"
           and t."organizationId" = i."organizationId"
           and t."financialProfileId" = i."financialProfileId"
        where i."id" = $1 and i."invoiceId" = $2
          and i."organizationId" = $3 and i."financialProfileId" = $4
          and i."cardId" = inv."cardId" and t."cardId" = inv."cardId"
          and t."accountId" is null and t."kind" = 'EXPENSE'
          and t."status" <> 'VOIDED'
        for update of i, inv, t`,
      [installmentId, invoiceId, context.organizationId, context.financialProfileId],
    );
    const row = rows[0];
    if (!row) {
      throw new InvoiceContractError(
        "CARD_INSTALLMENT_NOT_FOUND",
        "Parcela não encontrada nesta fatura.",
        404,
      );
    }
    if (LOCKED_CARD_PURCHASE_INVOICE_STATUSES.has(row.invoiceStatus)) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_INVOICE_LOCKED",
        "Não é possível conciliar parcelas de fatura fechada, paga ou cancelada.",
        409,
      );
    }
    if (!["PLANNED", "POSTED", "RECONCILED"].includes(row.status)) {
      throw new InvoiceContractError(
        "CARD_INSTALLMENT_STATUS_LOCKED",
        "Esta parcela não permite conciliação.",
        409,
      );
    }
    const now = new Date().toISOString();
    await executeQuery(
      `update "Installment" set "status" = $5, "updatedAt" = $6,
          "updatedByUserId" = $7
        where "id" = $1 and "invoiceId" = $2
          and "organizationId" = $3 and "financialProfileId" = $4`,
      [
        installmentId,
        invoiceId,
        context.organizationId,
        context.financialProfileId,
        status.toUpperCase(),
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
      entityKind: "installment",
      entityId: installmentId,
      redactedChanges: { status: "changed" },
    });
  });
  return {
    installmentId,
    status,
    invoice: await summarizeInvoiceForContext(context, invoiceId),
  };
}

export { deleteSimpleCardPurchaseForContext } from "./card-invoice-purchase-delete.js";
export { reverseCardPurchaseForContext } from "./card-invoice-purchase-reverse.js";
export { updateCardReversalForContext } from "./card-invoice-reversal-edit.js";
export { adjustInvoiceInstallmentAmountForContext } from "./card-invoice-installment-amount.js";

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
            "amountMinor", "currency", "kind", "status", "reconciledAt", "updatedAt"
       from "Transaction"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
         and "cardId" = $4 and "invoiceId" is not null and "accountId" is null
         and "kind" = 'EXPENSE' and "status" <> 'VOIDED'`,
    [transactionId, context.organizationId, context.financialProfileId, cardId],
  );
  const row = rows[0];

  if (!row) {
    throw notFoundError();
  }

  return row;
}

export async function assertActiveCardInstrumentBelongsToCard(
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
         and t."status" <> 'VOIDED' and i."status" in ('OPEN', 'CLOSED', 'OVERDUE')`,
    [context.organizationId, context.financialProfileId, cardId],
  );

  return toNumber(row?.limitUsedMinor);
}
