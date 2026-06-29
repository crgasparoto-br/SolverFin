import { randomUUID } from "node:crypto";

import {
  archiveCard as archiveCardDomain,
  blockCard as blockCardDomain,
  createCard as createCardDomain,
  getCard as getCardDomain,
  getInvoice as getInvoiceDomain,
  listCards as listCardsDomain,
  listInvoices as listInvoicesDomain,
  payInvoice as payInvoiceDomain,
  registerCardPurchase as registerCardPurchaseDomain,
  updateCard as updateCardDomain,
  type Account,
  type Card,
  type CardMutationResult,
  type CardStatus,
  type CreateCardPayload,
  type EntityId,
  type ExistingForecastTransaction,
  type Installment,
  type InstallmentStatus,
  type Invoice,
  type InvoicePeriod,
  type InvoiceStatus,
  type ListCardsFilters,
  type ListInvoicesFilters,
  type PayInvoicePayload,
  type RegisterCardPurchasePayload,
  type TenantContext,
  type Transaction,
  type UpdateCardPayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

interface CardRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  paymentAccountId: string | null;
  name: string;
  status: string;
  closingDay: number;
  dueDay: number;
  creditLimitMinor: number | null;
  maskedIdentifier: string | null;
  institutionKey: string | null;
  brandKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

interface InvoiceRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  cardId: string;
  paymentTransactionId: string | null;
  status: string;
  periodStartOn: Date;
  periodEndOn: Date;
  dueOn: Date;
  totalAmountMinor: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CARD_COLUMNS = `"id", "organizationId", "financialProfileId", "paymentAccountId", "name", "status",
  "closingDay", "dueDay", "creditLimitMinor", "maskedIdentifier", "institutionKey", "brandKey",
  "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

const INVOICE_COLUMNS = `"id", "organizationId", "financialProfileId", "cardId", "paymentTransactionId",
  "status", "periodStartOn", "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt",
  "createdAt", "updatedAt"`;

export async function listCardsForContext(
  context: TenantContext,
  filters: ListCardsFilters = {},
): Promise<Card[]> {
  const rows = await query<CardRow>(
    `select ${CARD_COLUMNS} from "Card"
     where "organizationId" = $1 and "financialProfileId" = $2 order by "name" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return listCardsDomain(context, rows.map(mapCardRow), filters);
}

export async function getCardForContext(context: TenantContext, cardId: EntityId): Promise<Card> {
  return getCardDomain(context, await findCardRow(context, cardId));
}

export async function createCardForContext(
  context: TenantContext,
  payload: CreateCardPayload,
): Promise<Card> {
  const paymentAccount = payload.paymentAccountId
    ? await findAccountRow(context, payload.paymentAccountId)
    : undefined;
  const result = createCardDomain({
    id: randomUUID(),
    context,
    now: new Date().toISOString(),
    payload,
    ...(paymentAccount ? { paymentAccount } : {}),
  });

  await persistCardMutation(result);

  return result.card;
}

export async function updateCardForContext(
  context: TenantContext,
  cardId: EntityId,
  payload: UpdateCardPayload,
): Promise<Card> {
  const currentCard = await findCardRow(context, cardId);
  const paymentAccountId = payload.paymentAccountId ?? currentCard?.paymentAccountId;
  const paymentAccount = paymentAccountId
    ? await findAccountRow(context, paymentAccountId)
    : undefined;
  const result = updateCardDomain({
    context,
    card: currentCard,
    now: new Date().toISOString(),
    payload,
    ...(paymentAccount ? { paymentAccount } : {}),
  });

  await persistCardMutation(result);

  return result.card;
}

export async function archiveCardForContext(
  context: TenantContext,
  cardId: EntityId,
): Promise<Card> {
  const result = archiveCardDomain(
    context,
    await findCardRow(context, cardId),
    new Date().toISOString(),
  );

  await persistCardMutation(result);

  return result.card;
}

export async function blockCardForContext(context: TenantContext, cardId: EntityId): Promise<Card> {
  const result = blockCardDomain(
    context,
    await findCardRow(context, cardId),
    new Date().toISOString(),
  );

  await persistCardMutation(result);

  return result.card;
}

export async function listInvoicesForContext(
  context: TenantContext,
  filters: ListInvoicesFilters = {},
): Promise<Invoice[]> {
  const rows = await query<InvoiceRow>(
    `select ${INVOICE_COLUMNS} from "Invoice"
     where "organizationId" = $1 and "financialProfileId" = $2 order by "dueOn" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return listInvoicesDomain(context, rows.map(mapInvoiceRow), filters);
}

export async function getInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<Invoice> {
  return getInvoiceDomain(context, await findInvoiceRow(context, invoiceId));
}

export async function registerCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  payload: RegisterCardPurchasePayload,
): Promise<{
  transaction: Transaction;
  invoice: Invoice;
  futureInvoices: readonly Invoice[];
  installments: readonly Installment[];
  forecastTransactions: readonly Transaction[];
}> {
  const card = await findCardRow(context, cardId);
  const groupCardId = await resolveGroupCardId(context, cardId);
  const existingInvoices = await listAllInvoicesForCard(context, groupCardId);
  const paymentAccount = card?.paymentAccountId
    ? await findAccountRow(context, card.paymentAccountId)
    : undefined;
  const existingForecastTransactions = card?.paymentAccountId
    ? await listForecastTransactionsForInvoices(
        context,
        existingInvoices.map((invoice) => invoice.id),
        card.paymentAccountId,
      )
    : [];
  const now = new Date().toISOString();

  const result = registerCardPurchaseDomain({
    transactionId: randomUUID(),
    context,
    card,
    groupCardId,
    existingInvoices,
    ...(paymentAccount ? { paymentAccount } : {}),
    existingForecastTransactions,
    now,
    payload,
    makeInvoiceId: () => randomUUID(),
    makeInstallmentId: () => randomUUID(),
    makeForecastTransactionId: () => randomUUID(),
  });

  await withTransaction(async (executeQuery) => {
    for (const invoice of [result.invoice, ...result.futureInvoices]) {
      const invoiceExisted = existingInvoices.some((existing) => existing.id === invoice.id);

      await executeQuery(buildUpsertInvoiceSql(invoiceExisted), buildInvoiceParams(invoice, invoiceExisted));
    }

    await executeQuery(
      buildInsertCardTransactionSql(),
      buildCardTransactionParams(result.transaction),
    );

    for (const installment of result.installments) {
      await executeQuery(
        `insert into "Installment"
          ("id", "organizationId", "financialProfileId", "recurrenceId", "cardId", "status",
           "sequenceNumber", "totalInstallments", "dueOn", "amountMinor", "currency", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          installment.id,
          installment.organizationId,
          installment.financialProfileId,
          installment.recurrenceId ?? null,
          installment.cardId ?? null,
          installment.status.toUpperCase(),
          installment.sequenceNumber,
          installment.totalInstallments,
          installment.dueOn,
          installment.amountMinor,
          installment.currency,
          installment.createdAt,
          installment.updatedAt,
        ],
      );
    }

    for (const forecastTransaction of result.forecastTransactions) {
      const forecastExisted = existingForecastTransactions.some(
        (existing) => existing.id === forecastTransaction.id,
      );

      await executeQuery(
        buildUpsertForecastTransactionSql(forecastExisted),
        buildForecastTransactionParams(forecastTransaction, forecastExisted),
      );
    }

    for (const auditEntry of result.auditEntries) {
      await insertAuditLogEntry(executeQuery, auditEntry);
    }
  });

  return result;
}

export async function payInvoiceForContext(
  context: TenantContext,
  invoiceId: EntityId,
  paymentAccountId: EntityId,
  payload: PayInvoicePayload,
): Promise<{ invoice: Invoice; transaction: Transaction }> {
  const invoice = await findInvoiceRow(context, invoiceId);
  const card = invoice ? await findCardRow(context, invoice.cardId) : undefined;
  const paymentAccount = await findAccountRow(context, paymentAccountId);
  const existingForecastTransactionId = invoice
    ? await findForecastTransactionIdForInvoice(context, invoice.id)
    : undefined;

  const result = payInvoiceDomain({
    transactionId: randomUUID(),
    context,
    invoice,
    card,
    paymentAccount,
    ...(existingForecastTransactionId ? { existingForecastTransactionId } : {}),
    now: new Date().toISOString(),
    payload,
  });

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "Transaction"
        ("id", "organizationId", "financialProfileId", "accountId", "cardId", "invoiceId", "kind",
         "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdAt",
         "updatedAt", "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        result.transaction.id,
        result.transaction.organizationId,
        result.transaction.financialProfileId,
        result.transaction.accountId ?? null,
        result.transaction.cardId ?? null,
        result.transaction.invoiceId ?? null,
        result.transaction.kind.toUpperCase(),
        result.transaction.status.toUpperCase(),
        result.transaction.source.toUpperCase(),
        result.transaction.amountMinor,
        result.transaction.currency,
        result.transaction.occurredOn,
        result.transaction.plannedOn,
        result.transaction.description,
        result.transaction.createdAt,
        result.transaction.updatedAt,
        result.transaction.createdByUserId ?? null,
        result.transaction.updatedByUserId ?? null,
      ],
    );
    await executeQuery(buildUpsertInvoiceSql(true), buildInvoiceParams(result.invoice, true));

    if (result.voidedForecastTransactionId) {
      await executeQuery(
        `update "Transaction" set "status" = 'VOIDED', "voidedAt" = $2, "updatedAt" = $2 where "id" = $1`,
        [result.voidedForecastTransactionId, result.transaction.updatedAt],
      );
    }

    for (const auditEntry of result.auditEntries) {
      await insertAuditLogEntry(executeQuery, auditEntry);
    }
  });

  return result;
}

function buildUpsertInvoiceSql(exists: boolean): string {
  if (!exists) {
    return `insert into "Invoice"
      ("id", "organizationId", "financialProfileId", "cardId", "paymentTransactionId", "status",
       "periodStartOn", "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`;
  }

  return `update "Invoice" set
      "paymentTransactionId" = $2, "status" = $3, "totalAmountMinor" = $4, "paidAt" = $5, "updatedAt" = $6
    where "id" = $1`;
}

function buildInvoiceParams(invoice: Invoice, exists: boolean): unknown[] {
  if (!exists) {
    return [
      invoice.id,
      invoice.organizationId,
      invoice.financialProfileId,
      invoice.cardId,
      invoice.paymentTransactionId ?? null,
      invoice.status.toUpperCase(),
      invoice.periodStartOn,
      invoice.periodEndOn,
      invoice.dueOn,
      invoice.totalAmountMinor,
      invoice.currency,
      invoice.paidAt ?? null,
      invoice.createdAt,
      invoice.updatedAt,
    ];
  }

  return [
    invoice.id,
    invoice.paymentTransactionId ?? null,
    invoice.status.toUpperCase(),
    invoice.totalAmountMinor,
    invoice.paidAt ?? null,
    invoice.updatedAt,
  ];
}

function buildInsertCardTransactionSql(): string {
  return `insert into "Transaction"
    ("id", "organizationId", "financialProfileId", "cardId", "invoiceId", "categoryId", "kind", "status",
     "source", "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdAt", "updatedAt",
     "createdByUserId", "updatedByUserId")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`;
}

function buildCardTransactionParams(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.organizationId,
    transaction.financialProfileId,
    transaction.cardId ?? null,
    transaction.invoiceId ?? null,
    transaction.categoryId ?? null,
    transaction.kind.toUpperCase(),
    transaction.status.toUpperCase(),
    transaction.source.toUpperCase(),
    transaction.amountMinor,
    transaction.currency,
    transaction.occurredOn,
    transaction.plannedOn,
    transaction.description,
    transaction.createdAt,
    transaction.updatedAt,
    transaction.createdByUserId ?? null,
    transaction.updatedByUserId ?? null,
  ];
}

function buildUpsertForecastTransactionSql(exists: boolean): string {
  if (!exists) {
    return `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "cardId", "invoiceId", "kind", "status",
       "source", "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdAt", "updatedAt",
       "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`;
  }

  return `update "Transaction" set
      "amountMinor" = $2, "occurredOn" = $3, "plannedOn" = $4, "updatedAt" = $5, "updatedByUserId" = $6
    where "id" = $1`;
}

function buildForecastTransactionParams(transaction: Transaction, exists: boolean): unknown[] {
  if (!exists) {
    return [
      transaction.id,
      transaction.organizationId,
      transaction.financialProfileId,
      transaction.accountId ?? null,
      transaction.cardId ?? null,
      transaction.invoiceId ?? null,
      transaction.kind.toUpperCase(),
      transaction.status.toUpperCase(),
      transaction.source.toUpperCase(),
      transaction.amountMinor,
      transaction.currency,
      transaction.occurredOn,
      transaction.plannedOn,
      transaction.description,
      transaction.createdAt,
      transaction.updatedAt,
      transaction.createdByUserId ?? null,
      transaction.updatedByUserId ?? null,
    ];
  }

  return [
    transaction.id,
    transaction.amountMinor,
    transaction.occurredOn,
    transaction.plannedOn,
    transaction.updatedAt,
    transaction.updatedByUserId ?? null,
  ];
}

async function listForecastTransactionsForInvoices(
  context: TenantContext,
  invoiceIds: readonly EntityId[],
  accountId: EntityId,
): Promise<ExistingForecastTransaction[]> {
  if (invoiceIds.length === 0) {
    return [];
  }

  const rows = await query<{
    id: string;
    invoiceId: string;
    createdAt: Date;
    createdByUserId: string | null;
  }>(
    `select "id", "invoiceId", "createdAt", "createdByUserId" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "accountId" = $3
       and "status" = 'PLANNED' and "source" = 'MANUAL' and "invoiceId" = any($4::uuid[])`,
    [context.organizationId, context.financialProfileId, accountId, invoiceIds],
  );

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoiceId,
    createdAt: row.createdAt.toISOString(),
    ...(row.createdByUserId !== null ? { createdByUserId: row.createdByUserId } : {}),
  }));
}

async function findForecastTransactionIdForInvoice(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<EntityId | undefined> {
  const rows = await query<{ id: string }>(
    `select "id" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "invoiceId" = $3
       and "status" = 'PLANNED' and "source" = 'MANUAL'
     limit 1`,
    [context.organizationId, context.financialProfileId, invoiceId],
  );

  return rows[0]?.id;
}

async function persistCardMutation(result: CardMutationResult): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "Card"
        ("id", "organizationId", "financialProfileId", "paymentAccountId", "name", "status", "closingDay",
         "dueDay", "creditLimitMinor", "maskedIdentifier", "institutionKey", "brandKey", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict ("id") do update set
         "paymentAccountId" = excluded."paymentAccountId", "name" = excluded."name",
         "status" = excluded."status", "closingDay" = excluded."closingDay", "dueDay" = excluded."dueDay",
         "creditLimitMinor" = excluded."creditLimitMinor", "maskedIdentifier" = excluded."maskedIdentifier",
         "institutionKey" = excluded."institutionKey", "brandKey" = excluded."brandKey",
         "updatedAt" = excluded."updatedAt", "updatedByUserId" = excluded."updatedByUserId"`,
      [
        result.card.id,
        result.card.organizationId,
        result.card.financialProfileId,
        result.card.paymentAccountId ?? null,
        result.card.name,
        result.card.status.toUpperCase(),
        result.card.closingDay,
        result.card.dueDay,
        result.card.creditLimitMinor ?? null,
        result.card.maskedIdentifier ?? null,
        result.card.institutionKey ?? null,
        result.card.brandKey ?? null,
        result.card.createdAt,
        result.card.updatedAt,
        result.card.createdByUserId ?? null,
        result.card.updatedByUserId ?? null,
      ],
    );
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });
}

async function listAllInvoicesForCard(
  context: TenantContext,
  cardId: EntityId,
): Promise<Invoice[]> {
  const rows = await query<InvoiceRow>(
    `select ${INVOICE_COLUMNS} from "Invoice"
     where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3`,
    [context.organizationId, context.financialProfileId, cardId],
  );

  return rows.map(mapInvoiceRow);
}

async function resolveGroupCardId(context: TenantContext, cardId: EntityId): Promise<EntityId> {
  const rows = await query<{ groupCardId: string }>(
    `select "groupCardId" from "CardAdditionalLink"
     where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3`,
    [context.organizationId, context.financialProfileId, cardId],
  );

  return rows[0]?.groupCardId ?? cardId;
}

async function findCardRow(context: TenantContext, cardId: EntityId): Promise<Card | undefined> {
  const rows = await query<CardRow>(
    `select ${CARD_COLUMNS} from "Card" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapCardRow(rows[0]) : undefined;
}

async function findInvoiceRow(
  context: TenantContext,
  invoiceId: EntityId,
): Promise<Invoice | undefined> {
  const rows = await query<InvoiceRow>(
    `select ${INVOICE_COLUMNS} from "Invoice" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [invoiceId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapInvoiceRow(rows[0]) : undefined;
}

async function findAccountRow(
  context: TenantContext,
  accountId: EntityId,
): Promise<Account | undefined> {
  const rows = await query<{
    id: string;
    organizationId: string;
    financialProfileId: string;
    name: string;
    kind: string;
    status: string;
    currency: string;
    openingBalanceMinor: number;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `select "id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
            "openingBalanceMinor", "createdAt", "updatedAt"
     from "Account" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    kind: row.kind.toLowerCase() as Account["kind"],
    status: row.status.toLowerCase() as Account["status"],
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCardRow(row: CardRow): Card {
  const card: Card = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    name: row.name,
    status: row.status.toLowerCase() as CardStatus,
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.paymentAccountId !== null) card.paymentAccountId = row.paymentAccountId;
  if (row.creditLimitMinor !== null) card.creditLimitMinor = row.creditLimitMinor;
  if (row.maskedIdentifier !== null) card.maskedIdentifier = row.maskedIdentifier;
  if (row.institutionKey !== null)
    card.institutionKey = row.institutionKey as Card["institutionKey"];
  if (row.brandKey !== null) card.brandKey = row.brandKey as Card["brandKey"];
  if (row.createdByUserId !== null) card.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) card.updatedByUserId = row.updatedByUserId;

  return card;
}

function mapInvoiceRow(row: InvoiceRow): Invoice {
  const invoice: Invoice = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    cardId: row.cardId,
    status: row.status.toLowerCase() as InvoiceStatus,
    periodStartOn: toDateOnly(row.periodStartOn),
    periodEndOn: toDateOnly(row.periodEndOn),
    dueOn: toDateOnly(row.dueOn),
    totalAmountMinor: row.totalAmountMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.paymentTransactionId !== null) invoice.paymentTransactionId = row.paymentTransactionId;
  if (row.paidAt !== null) invoice.paidAt = row.paidAt.toISOString();

  return invoice;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type { InvoicePeriod, InstallmentStatus };
