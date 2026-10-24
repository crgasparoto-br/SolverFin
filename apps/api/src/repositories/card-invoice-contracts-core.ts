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
    `with invoice_occurrences as (
       select t."status"::text as "status", case when t."kind" = 'INCOME' then -t."amountMinor" else t."amountMinor" end as "amountMinor"
         from "Transaction" t
        where t."organizationId" = $1 and t."financialProfileId" = $2
          and t."invoiceId" = $3 and t."cardId" = $4 and t."accountId" is null
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

  if (LOCKED_CARD_PURCHASE_INVOICE_STATUSES.has(invoice.status)) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_LOCKED",
      "Compras de faturas fechadas, pagas ou canceladas nao podem ser editadas.",
      409,
    );
  }

  const purchaseInstallments = await query<{ id: string; invoiceStatus: string | null }>(
    `select i."id", inv."status" as "invoiceStatus" from "Installment" i
      left join "Invoice" inv
        on inv."id" = i."invoiceId"
       and inv."organizationId" = i."organizationId"
       and inv."financialProfileId" = i."financialProfileId"
      where i."transactionId" = $1 and i."organizationId" = $2 and i."financialProfileId" = $3`,
    [current.id, context.organizationId, context.financialProfileId],
  );
  const isInstallmentPurchase = purchaseInstallments.length > 0;

  if (
    purchaseInstallments.some(
      (installment) =>
        installment.invoiceStatus !== null &&
        LOCKED_CARD_PURCHASE_INVOICE_STATUSES.has(installment.invoiceStatus),
    )
  ) {
    throw new InvoiceContractError(
      "CARD_PURCHASE_INVOICE_LOCKED",
      "Compras parceladas com fatura fechada, paga ou cancelada nao podem ser editadas.",
      409,
    );
  }

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
        for update of i, inv`,
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

/**
 * Change the amount of one invoice installment (or eligible later installments).
 * A financed purchase has one origin Transaction shared by its schedule; updating
 * Transaction.amountMinor here would corrupt the base purchase and other invoices.
 */

/**
 * Register a one-off credit against exactly the selected purchase occurrence.
 * The original purchase/instalment is never mutated. A deterministic origin
 * marker prevents creating the same credit twice, even on client retries.
 */
export async function deleteSimpleCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<{ transactionId: EntityId; invoiceId: EntityId }> {
  let invoiceId: EntityId | undefined;
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{
      id: string;
      invoiceId: string;
      amountMinor: number;
      status: string;
      invoiceStatus: string;
      currency: string;
      invoiceCurrency: string;
      recurrenceId: string | null;
      kind: string;
      description: string;
    }>(
      `select t."id", t."invoiceId", t."amountMinor", t."status",
              t."currency", t."recurrenceId", t."kind", t."description",
              inv."status" as "invoiceStatus", inv."currency" as "invoiceCurrency"
         from "Transaction" t join "Invoice" inv on inv."id" = t."invoiceId"
          and inv."organizationId" = t."organizationId"
          and inv."financialProfileId" = t."financialProfileId"
        where t."id" = $1 and t."cardId" = $2 and
          t."organizationId" = $3 and t."financialProfileId" = $4
          and t."accountId" is null and (t."kind" = 'EXPENSE' or
            (t."kind" = 'INCOME' and t."description" like '%[estorno:%'))
        for update of t, inv`,
      [transactionId, cardId, context.organizationId, context.financialProfileId],
    );
    const source = rows[0];
    if (!source)
      throw new InvoiceContractError("CARD_PURCHASE_NOT_FOUND", "Lançamento não encontrado.", 404);
    if (source.invoiceStatus !== "OPEN" || source.status === "RECONCILED") {
      throw new InvoiceContractError(
        "CARD_PURCHASE_DELETE_LOCKED",
        "Não é possível excluir uma compra conciliada ou de fatura bloqueada.",
        409,
      );
    }
    const dependencies = await executeQuery<{ id: string }>(
      `select "id" from "Installment" where "transactionId" = $1
        and "organizationId" = $2 and "financialProfileId" = $3 limit 1`,
      [transactionId, context.organizationId, context.financialProfileId],
    );
    if (source.recurrenceId || dependencies.length) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_DELETE_RESTRICTED",
        "Parcelas e recorrências exigem exclusão específica. Use Estorno para compensar este lançamento.",
        409,
      );
    }
    if (source.currency !== source.invoiceCurrency) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_CURRENCY_MISMATCH",
        "Moeda divergente da fatura.",
        409,
      );
    }
    const now = new Date().toISOString();
    const invoice = await executeQuery<{ id: string }>(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
         "updatedAt" = $5
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
          and "status" = 'OPEN'
        returning "id"`,
      [
        source.invoiceId,
        context.organizationId,
        context.financialProfileId,
        source.kind === "INCOME" ? Number(source.amountMinor) : -Number(source.amountMinor),
        now,
      ],
    );
    if (invoice.length !== 1)
      throw new InvoiceContractError("CARD_PURCHASE_DELETE_LOCKED", "Fatura bloqueada.", 409);
    const deleted = await executeQuery<{ id: string }>(
      `delete from "Transaction" where "id" = $1 and "organizationId" = $2
         and "financialProfileId" = $3 returning "id"`,
      [transactionId, context.organizationId, context.financialProfileId],
    );
    if (deleted.length !== 1)
      throw new InvoiceContractError(
        "CARD_PURCHASE_DELETE_FAILED",
        "Não foi possível excluir.",
        409,
      );
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "soft_delete",
      entityKind: "transaction",
      entityId: transactionId,
      redactedChanges: { purchase: "removed" },
    });
    invoiceId = source.invoiceId;
  });
  if (!invoiceId)
    throw new InvoiceContractError("CARD_PURCHASE_DELETE_FAILED", "Não foi possível excluir.", 409);
  return { transactionId, invoiceId };
}

export async function reverseCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  invoiceId: EntityId,
  installmentId?: EntityId,
): Promise<{ transactionId: string; invoiceId: string; amountMinor: number }> {
  const { randomUUID } = await import("node:crypto");
  let createdId = "";
  let reversedAmount = 0;
  await withTransaction(async (executeQuery) => {
    const invoices = await executeQuery<{ id: string; status: string; currency: string }>(
      `select "id", "status", "currency" from "Invoice"
        where "id" = $1 and "cardId" = $2 and "organizationId" = $3
          and "financialProfileId" = $4 for update`,
      [invoiceId, cardId, context.organizationId, context.financialProfileId],
    );
    if (!invoices[0] || invoices[0].status !== "OPEN") {
      throw new InvoiceContractError(
        "CARD_REVERSAL_INVOICE_LOCKED",
        "Somente faturas abertas permitem estorno.",
        409,
      );
    }
    const source = await executeQuery<{
      id: string;
      description: string;
      amountMinor: number;
      currency: string;
      cardInstrumentId: string | null;
      occurredOn: Date;
    }>(
      installmentId
        ? `select t."id", t."description", i."amountMinor", i."currency",
                  i."cardInstrumentId", i."dueOn" as "occurredOn"
             from "Transaction" t join "Installment" i on i."transactionId" = t."id"
            where t."id" = $1 and i."id" = $2 and i."invoiceId" = $3
              and t."cardId" = $4 and t."kind" = 'EXPENSE'
              and t."organizationId" = $5 and t."financialProfileId" = $6
              and i."organizationId" = $5 and i."financialProfileId" = $6`
        : `select t."id", t."description", t."amountMinor", t."currency",
                  t."cardInstrumentId", t."occurredOn"
             from "Transaction" t where t."id" = $1 and t."invoiceId" = $2
              and t."installmentId" is null and t."cardId" = $3
              and t."kind" = 'EXPENSE' and t."organizationId" = $4 and t."financialProfileId" = $5`,
      installmentId
        ? [
            transactionId,
            installmentId,
            invoiceId,
            cardId,
            context.organizationId,
            context.financialProfileId,
          ]
        : [transactionId, invoiceId, cardId, context.organizationId, context.financialProfileId],
    );
    const origin = source[0];
    if (
      !origin ||
      !Number.isSafeInteger(Number(origin.amountMinor)) ||
      Number(origin.amountMinor) <= 0 ||
      origin.currency !== invoices[0].currency
    ) {
      throw new InvoiceContractError(
        "CARD_REVERSAL_INVALID_SOURCE",
        "Lançamento não elegível ao estorno.",
        409,
      );
    }
    const marker = "[estorno:" + transactionId + ":" + (installmentId ?? "unico") + "]";
    const existing = await executeQuery<{ id: string }>(
      `select "id" from "Transaction" where "organizationId" = $1 and
         "financialProfileId" = $2 and "cardId" = $3 and "kind" = 'INCOME'
         and "description" like $4 limit 1`,
      [context.organizationId, context.financialProfileId, cardId, "%" + marker],
    );
    if (existing.length) {
      throw new InvoiceContractError(
        "CARD_REVERSAL_DUPLICATE",
        "Este lançamento já foi estornado.",
        409,
      );
    }
    const categories = await executeQuery<{ id: string }>(
      `select "id" from "Category" where "organizationId" = $1 and
         "financialProfileId" = $2 and "normalizedName" = 'estornos'
         and "kind" = 'INCOME' and "status" = 'ACTIVE'
         order by "createdAt" limit 1`,
      [context.organizationId, context.financialProfileId],
    );
    // Default category seeding may not have run for this profile. Provision it atomically.
    let reversalCategoryId = categories[0]?.id;
    if (!reversalCategoryId) {
      reversalCategoryId = randomUUID();
      const parent = await executeQuery<{ id: string }>(
        `select "id" from "Category" where "organizationId" = $1
           and "financialProfileId" = $2 and "kind" = 'INCOME'
           and "normalizedName" = 'reembolsos' and "status" = 'ACTIVE'
           limit 1`,
        [context.organizationId, context.financialProfileId],
      );
      await executeQuery(
        `insert into "Category"
          ("id", "organizationId", "financialProfileId", "parentCategoryId",
           "name", "normalizedName", "kind", "status", "createdAt", "updatedAt",
           "createdByUserId", "updatedByUserId")
         values ($1, $2, $3, $4, 'Estornos', 'estornos', 'INCOME', 'ACTIVE',
                 now(), now(), $5, $5)`,
        [
          reversalCategoryId,
          context.organizationId,
          context.financialProfileId,
          parent[0]?.id ?? null,
          context.userId,
        ],
      );
    }
    createdId = randomUUID();
    reversedAmount = Number(origin.amountMinor);
    const now = new Date().toISOString();
    await executeQuery(
      `insert into "Transaction"
        ("id", "organizationId", "financialProfileId", "cardId", "cardInstrumentId",
         "invoiceId", "categoryId", "kind", "status", "source", "amountMinor", "currency",
         "occurredOn", "plannedOn", "description", "createdAt", "updatedAt",
         "createdByUserId", "updatedByUserId")
       values ($1,$2,$3,$4,$5,$6,$7,'INCOME','POSTED','MANUAL',$8,$9,$10,$10,$11,$12,$12,$13,$13)`,
      [
        createdId,
        context.organizationId,
        context.financialProfileId,
        cardId,
        origin.cardInstrumentId,
        invoiceId,
        reversalCategoryId,
        reversedAmount,
        origin.currency,
        toDateOnly(origin.occurredOn),
        "Estorno: " + origin.description + " " + marker,
        now,
        context.userId,
      ],
    );
    const updated = await executeQuery<{ id: string }>(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" - $4,
           "updatedAt" = $5 where "id" = $1 and "organizationId" = $2
           and "financialProfileId" = $3 and "status" = 'OPEN'
           returning "id"`,
      [invoiceId, context.organizationId, context.financialProfileId, reversedAmount, now],
    );
    if (updated.length !== 1)
      throw new InvoiceContractError("CARD_REVERSAL_INVOICE_LOCKED", "Fatura não editável.", 409);
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "create",
      entityKind: "transaction",
      entityId: createdId,
      redactedChanges: { reversalOf: "added" },
    });
  });
  return { transactionId: createdId, invoiceId, amountMinor: -reversedAmount };
}

/** Update the newly generated credit using its own immutable reversal identity. */
export async function updateCardReversalForContext(
  context: TenantContext,
  cardId: EntityId,
  reversalId: EntityId,
  payload: {
    description: string;
    occurredOn: string;
    amountMinor: number;
    cardInstrumentId?: string;
  },
): Promise<{ transactionId: EntityId; invoiceId: EntityId }> {
  if (!Number.isSafeInteger(payload.amountMinor) || payload.amountMinor <= 0) {
    throw new InvoiceContractError(
      "CARD_REVERSAL_AMOUNT_INVALID",
      "Informe um valor positivo para o crédito.",
    );
  }
  if (!isIsoDate(payload.occurredOn) || !payload.description.trim()) {
    throw new InvoiceContractError(
      "CARD_REVERSAL_DETAILS_INVALID",
      "Informe data e descrição válidas.",
    );
  }
  let invoiceId: EntityId | undefined;
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{
      invoiceId: string;
      amountMinor: number;
      description: string;
      invoiceStatus: string;
      periodStartOn: Date;
      periodEndOn: Date;
    }>(
      `select t."invoiceId", t."amountMinor", t."description",
           inv."status" as "invoiceStatus", inv."periodStartOn", inv."periodEndOn"
         from "Transaction" t join "Invoice" inv on inv."id" = t."invoiceId"
          and inv."organizationId" = t."organizationId"
          and inv."financialProfileId" = t."financialProfileId"
        where t."id" = $1 and t."cardId" = $2 and t."organizationId" = $3
          and t."financialProfileId" = $4 and t."kind" = 'INCOME'
          and t."description" like '%[estorno:%'
        for update of t, inv`,
      [reversalId, cardId, context.organizationId, context.financialProfileId],
    );
    const current = rows[0];
    if (!current || current.invoiceStatus !== "OPEN") {
      throw new InvoiceContractError(
        "CARD_REVERSAL_EDIT_LOCKED",
        "O estorno não está disponível para edição.",
        409,
      );
    }
    if (
      payload.occurredOn < toDateOnly(current.periodStartOn) ||
      payload.occurredOn > toDateOnly(current.periodEndOn)
    ) {
      throw new InvoiceContractError(
        "CARD_REVERSAL_DATE_INVALID",
        "A data deve pertencer à fatura.",
        409,
      );
    }
    if (payload.cardInstrumentId) {
      await assertActiveCardInstrumentBelongsToCard(context, cardId, payload.cardInstrumentId);
    }
    const marker = current.description.match(/ \[estorno:[^\]]+\]$/)?.[0];
    if (!marker)
      throw new InvoiceContractError(
        "CARD_REVERSAL_MARKER_INVALID",
        "Estorno sem referência à compra.",
        409,
      );
    const now = new Date().toISOString();
    await executeQuery(
      `update "Transaction" set "amountMinor" = $5, "occurredOn" = $6, "plannedOn" = $6,
          "description" = $7, "cardInstrumentId" = coalesce($8, "cardInstrumentId"),
          "updatedAt" = $9, "updatedByUserId" = $10
        where "id" = $1 and "cardId" = $2 and "organizationId" = $3 and "financialProfileId" = $4`,
      [
        reversalId,
        cardId,
        context.organizationId,
        context.financialProfileId,
        payload.amountMinor,
        payload.occurredOn,
        payload.description.trim() + marker,
        payload.cardInstrumentId ?? null,
        now,
        context.userId,
      ],
    );
    await executeQuery(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
         "updatedAt" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        current.invoiceId,
        context.organizationId,
        context.financialProfileId,
        Number(current.amountMinor) - payload.amountMinor,
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
      entityId: reversalId,
      redactedChanges: { amountMinor: "changed", description: "changed" },
    });
    invoiceId = current.invoiceId;
  });
  if (!invoiceId)
    throw new InvoiceContractError(
      "CARD_REVERSAL_EDIT_FAILED",
      "Não foi possível atualizar o estorno.",
      409,
    );
  return { transactionId: reversalId, invoiceId };
}

export async function adjustInvoiceInstallmentAmountForContext(
  context: TenantContext,
  invoiceId: EntityId,
  installmentId: EntityId,
  amountMinor: number,
  scope: "current" | "current_and_future",
): Promise<{
  installmentId: EntityId;
  updatedCount: number;
  skippedCount: number;
  invoice: InvoiceSummaryContract;
}> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new InvoiceContractError(
      "CARD_INSTALLMENT_AMOUNT_INVALID",
      "Informe um valor positivo em centavos para a parcela.",
    );
  }
  if (scope !== "current" && scope !== "current_and_future") {
    throw new InvoiceContractError(
      "CARD_INSTALLMENT_SCOPE_INVALID",
      "Selecione o escopo de alteração da parcela.",
    );
  }
  let updatedCount = 0;
  let skippedCount = 0;
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{
      id: string;
      transactionId: string;
      invoiceId: string;
      cardId: string;
      transactionCardId: string;
      recurrenceId: string | null;
      sequenceNumber: number;
      totalInstallments: number;
      amountMinor: number;
      currency: string;
      invoiceCurrency: string;
      status: string;
      invoiceStatus: string;
      transactionStatus: string;
    }>(
      `select i."id", i."transactionId", i."invoiceId", i."cardId",
              t."cardId" as "transactionCardId", i."recurrenceId",
              i."sequenceNumber", i."totalInstallments", i."amountMinor",
              i."currency", i."status", inv."status" as "invoiceStatus",
              inv."currency" as "invoiceCurrency", t."status" as "transactionStatus"
         from "Installment" i
         join "Invoice" inv on inv."id" = i."invoiceId"
           and inv."organizationId" = i."organizationId"
           and inv."financialProfileId" = i."financialProfileId"
         join "Transaction" t on t."id" = i."transactionId"
           and t."organizationId" = i."organizationId"
           and t."financialProfileId" = i."financialProfileId"
        where i."transactionId" = (
           select selected."transactionId" from "Installment" selected
            where selected."id" = $1 and selected."invoiceId" = $2
              and selected."organizationId" = $3 and selected."financialProfileId" = $4
        ) and i."organizationId" = $3 and i."financialProfileId" = $4
        order by i."sequenceNumber", i."id"
        for update of i, inv`,
      [installmentId, invoiceId, context.organizationId, context.financialProfileId],
    );
    const selected = rows.find((row) => row.id === installmentId && row.invoiceId === invoiceId);
    if (
      !selected ||
      selected.recurrenceId !== null ||
      selected.totalInstallments < 2 ||
      selected.cardId !== selected.transactionCardId
    ) {
      throw new InvoiceContractError(
        "CARD_INSTALLMENT_NOT_FOUND",
        "Parcela de compra parcelada não encontrada nesta fatura.",
        404,
      );
    }
    const editable = (row: typeof selected): boolean =>
      row.recurrenceId === null &&
      row.cardId === selected.cardId &&
      row.transactionId === selected.transactionId &&
      row.totalInstallments === selected.totalInstallments &&
      row.currency === selected.currency &&
      row.currency === row.invoiceCurrency &&
      row.invoiceStatus === "OPEN" &&
      ["PLANNED", "POSTED"].includes(row.status) &&
      ["PLANNED", "POSTED"].includes(row.transactionStatus);
    if (!editable(selected)) {
      throw new InvoiceContractError(
        "CARD_INSTALLMENT_AMOUNT_LOCKED",
        "Esta parcela não pode ser alterada: fatura ou situação bloqueada.",
        409,
      );
    }
    const candidates =
      scope === "current"
        ? [selected]
        : rows.filter((row) => row.sequenceNumber >= selected.sequenceNumber);
    const now = new Date().toISOString();
    for (const row of candidates) {
      if (!editable(row)) {
        skippedCount += 1;
        continue;
      }
      const delta = amountMinor - Number(row.amountMinor);
      if (delta !== 0) {
        await executeQuery(
          `update "Installment" set "amountMinor" = $5, "updatedAt" = $6,
              "updatedByUserId" = $7
            where "id" = $1 and "invoiceId" = $2
              and "organizationId" = $3 and "financialProfileId" = $4`,
          [
            row.id,
            row.invoiceId,
            context.organizationId,
            context.financialProfileId,
            amountMinor,
            now,
            context.userId,
          ],
        );
        const invoiceRows = await executeQuery<{ id: string }>(
          `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
              "updatedAt" = $5
            where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
              and "status" = 'OPEN' and "totalAmountMinor" + $4 >= 0
            returning "id"`,
          [row.invoiceId, context.organizationId, context.financialProfileId, delta, now],
        );
        if (invoiceRows.length !== 1) {
          throw new InvoiceContractError(
            "CARD_INSTALLMENT_AMOUNT_LOCKED",
            "Não foi possível atualizar o total da fatura.",
            409,
          );
        }
        await insertAuditLogEntry(executeQuery, {
          organizationId: context.organizationId,
          financialProfileId: context.financialProfileId,
          occurredAt: now,
          actorKind: "user",
          actorId: context.userId,
          action: "update",
          entityKind: "installment",
          entityId: row.id,
          redactedChanges: { amountMinor: "changed" },
        });
      }
      updatedCount += 1;
    }
  });
  return {
    installmentId,
    updatedCount,
    skippedCount,
    invoice: await summarizeInvoiceForContext(context, invoiceId),
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
            "amountMinor", "currency", "kind", "status", "reconciledAt", "updatedAt"
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
