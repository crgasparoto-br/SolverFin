import { randomUUID } from "node:crypto";

import {
  archiveCard as archiveCardDomain,
  archiveCardInstrument as archiveCardInstrumentDomain,
  createCard as createCardDomain,
  createCardInstrument as createCardInstrumentDomain,
  getCard as getCardDomain,
  listCardInstruments as listCardInstrumentsDomain,
  listCards as listCardsDomain,
  setDefaultCardInstrument as setDefaultCardInstrumentDomain,
  updateCard as updateCardDomain,
  type Card,
  type CardInstrument,
  type CardInstrumentHolder,
  type CardInstrumentStatus,
  type CardInstrumentType,
  type CardMutationResult,
  type CardStatus,
  type CreateCardPayload,
  type CreateCardInstrumentPayload,
  type EntityId,
  type ListCardsFilters,
  type TenantContext,
  type UpdateCardPayload,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

export interface CreditCardAccountContract extends Card {
  instruments: readonly CardInstrument[];
}

export interface CreateCreditCardAccountPayload extends CreateCardPayload {
  instruments: readonly CreateCardInstrumentPayload[];
}

export interface UpdateCardInstrumentPayload {
  type?: CardInstrumentType;
  holder?: CardInstrumentHolder;
  status?: CardInstrumentStatus;
  isDefault?: boolean;
  name?: string | null;
  maskedIdentifier?: string | null;
  creditLimitMinor?: number | null;
}

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

interface CardInstrumentRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  cardId: string;
  type: string;
  holder: string;
  status: string;
  isDefault: boolean;
  name: string | null;
  maskedIdentifier: string | null;
  creditLimitMinor: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

type ExecuteQuery = typeof query;

const CARD_COLUMNS = `"id", "organizationId", "financialProfileId", "paymentAccountId", "name", "status",
  "closingDay", "dueDay", "creditLimitMinor", "maskedIdentifier", "institutionKey", "brandKey",
  "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

const CARD_INSTRUMENT_COLUMNS = `"id", "organizationId", "financialProfileId", "cardId", "type", "holder",
  "status", "isDefault", "name", "maskedIdentifier", "creditLimitMinor", "createdAt", "updatedAt",
  "createdByUserId", "updatedByUserId"`;

const ALLOWED_INSTRUMENT_TYPES: readonly CardInstrumentType[] = ["physical", "virtual"];
const ALLOWED_INSTRUMENT_HOLDERS: readonly CardInstrumentHolder[] = ["primary", "additional"];
const ALLOWED_INSTRUMENT_STATUSES: readonly CardInstrumentStatus[] = ["active", "archived"];

export async function listCreditCardAccountsForContext(
  context: TenantContext,
  filters: ListCardsFilters = {},
): Promise<CreditCardAccountContract[]> {
  const rows = await query<CardRow>(
    `select ${CARD_COLUMNS} from "Card"
     where "organizationId" = $1 and "financialProfileId" = $2 order by "name" asc`,
    [context.organizationId, context.financialProfileId],
  );
  const cards = listCardsDomain(context, rows.map(mapCardRow), filters);
  const instruments = await listAllInstrumentsForContext(context);

  return cards.map((card) => buildCreditCardAccount(context, card, instruments));
}

export async function getCreditCardAccountForContext(
  context: TenantContext,
  cardId: EntityId,
): Promise<CreditCardAccountContract> {
  const card = getCardDomain(context, await findCardRow(context, cardId));
  const instruments = await listCardInstrumentsForContext(context, card.id);

  return { ...card, instruments };
}

export async function createCreditCardAccountForContext(
  context: TenantContext,
  payload: CreateCreditCardAccountPayload,
): Promise<CreditCardAccountContract> {
  assertHasActiveInstrumentPayload(payload.instruments);

  const now = new Date().toISOString();
  let card = createCardDomain({
    id: randomUUID(),
    context,
    now,
    payload,
  }).card;
  let instruments: readonly CardInstrument[] = [];

  for (const instrumentPayload of payload.instruments) {
    const result = createCardInstrumentDomain({
      id: randomUUID(),
      context,
      card,
      existingInstruments: instruments,
      now,
      payload: {
        ...instrumentPayload,
        cardId: card.id,
      },
    });

    card = result.card;
    instruments = result.instruments;
  }

  await persistCardWithInstruments(card, instruments);

  return { ...card, instruments };
}

export async function updateCreditCardAccountForContext(
  context: TenantContext,
  cardId: EntityId,
  payload: UpdateCardPayload,
): Promise<CreditCardAccountContract> {
  const currentCard = await findCardRow(context, cardId);
  const result = updateCardDomain({
    context,
    card: currentCard,
    now: new Date().toISOString(),
    payload,
  });

  await persistCardMutation(result);

  return getCreditCardAccountForContext(context, result.card.id);
}

export async function archiveCreditCardAccountForContext(
  context: TenantContext,
  cardId: EntityId,
): Promise<CreditCardAccountContract> {
  const result = archiveCardDomain(
    context,
    await findCardRow(context, cardId),
    new Date().toISOString(),
  );

  await persistCardMutation(result);

  return getCreditCardAccountForContext(context, result.card.id);
}

export async function listCardInstrumentsForContext(
  context: TenantContext,
  cardId: EntityId,
): Promise<CardInstrument[]> {
  const card = getCardDomain(context, await findCardRow(context, cardId));
  const rows = await query<CardInstrumentRow>(
    `select ${CARD_INSTRUMENT_COLUMNS} from "CardInstrument"
     where "organizationId" = $1 and "financialProfileId" = $2 and "cardId" = $3
     order by "isDefault" desc, "createdAt" asc`,
    [context.organizationId, context.financialProfileId, card.id],
  );

  return listCardInstrumentsDomain(context, card, rows.map(mapCardInstrumentRow));
}

export async function createCardInstrumentForContext(
  context: TenantContext,
  cardId: EntityId,
  payload: Omit<CreateCardInstrumentPayload, "cardId">,
): Promise<CreditCardAccountContract> {
  const card = getCardDomain(context, await findCardRow(context, cardId));
  const existingInstruments = await listCardInstrumentsForContext(context, card.id);
  const result = createCardInstrumentDomain({
    id: randomUUID(),
    context,
    card,
    existingInstruments,
    now: new Date().toISOString(),
    payload: {
      ...payload,
      cardId: card.id,
    },
  });

  await persistCardWithInstruments(result.card, result.instruments);

  return { ...result.card, instruments: result.instruments };
}

export async function updateCardInstrumentForContext(
  context: TenantContext,
  instrumentId: EntityId,
  payload: UpdateCardInstrumentPayload,
): Promise<CreditCardAccountContract> {
  const currentInstrument = await findCardInstrumentRow(context, instrumentId);

  if (payload.status === "archived") {
    return archiveCardInstrumentForContext(context, currentInstrument.id);
  }

  if (payload.status === "active" && currentInstrument.status !== "active") {
    throw cardInstrumentError(
      "CARD_INSTRUMENT_NOT_ACTIVE",
      "Instrumento arquivado nao pode ser reativado neste fluxo.",
    );
  }

  const card = getCardDomain(context, await findCardRow(context, currentInstrument.cardId));
  const instruments = await listCardInstrumentsForContext(context, card.id);
  const updatedInstrument = buildUpdatedInstrument(currentInstrument, payload, new Date().toISOString(), context.userId);
  const updatedInstruments = instruments.map((instrument) =>
    instrument.id === updatedInstrument.id ? updatedInstrument : instrument,
  );

  assertActiveInstrumentLimitsDoNotExceedCard(card, updatedInstruments);

  await persistCardWithInstruments(card, updatedInstruments);

  if (payload.isDefault === true) {
    return setDefaultCardInstrumentForContext(context, card.id, updatedInstrument.id);
  }

  return { ...card, instruments: updatedInstruments };
}

export async function archiveCardInstrumentForContext(
  context: TenantContext,
  instrumentId: EntityId,
): Promise<CreditCardAccountContract> {
  const currentInstrument = await findCardInstrumentRow(context, instrumentId);
  const card = getCardDomain(context, await findCardRow(context, currentInstrument.cardId));
  const instruments = await listCardInstrumentsForContext(context, card.id);
  const result = archiveCardInstrumentDomain({
    context,
    card,
    instruments,
    instrumentId,
    now: new Date().toISOString(),
  });

  await persistCardWithInstruments(result.card, result.instruments);

  return { ...result.card, instruments: result.instruments };
}

export async function setDefaultCardInstrumentForContext(
  context: TenantContext,
  cardId: EntityId,
  instrumentId: EntityId,
): Promise<CreditCardAccountContract> {
  const card = getCardDomain(context, await findCardRow(context, cardId));
  const instruments = await listCardInstrumentsForContext(context, card.id);
  const result = setDefaultCardInstrumentDomain({
    context,
    card,
    instruments,
    instrumentId,
    now: new Date().toISOString(),
  });

  await persistCardWithInstruments(result.card, result.instruments);

  return { ...result.card, instruments: result.instruments };
}

async function listAllInstrumentsForContext(context: TenantContext): Promise<CardInstrument[]> {
  const rows = await query<CardInstrumentRow>(
    `select ${CARD_INSTRUMENT_COLUMNS} from "CardInstrument"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "cardId" asc, "isDefault" desc, "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map(mapCardInstrumentRow);
}

function buildCreditCardAccount(
  context: TenantContext,
  card: Card,
  instruments: readonly CardInstrument[],
): CreditCardAccountContract {
  return {
    ...card,
    instruments: listCardInstrumentsDomain(context, card, instruments),
  };
}

function assertHasActiveInstrumentPayload(payloads: readonly CreateCardInstrumentPayload[]): void {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw cardInstrumentError(
      "CARD_INSTRUMENT_REQUIRED",
      "Informe ao menos um instrumento ativo para criar o cartao.",
    );
  }

  const hasActiveInstrument = payloads.some((payload) => (payload.status ?? "active") === "active");

  if (!hasActiveInstrument) {
    throw cardInstrumentError(
      "CARD_INSTRUMENT_REQUIRED",
      "O cartao precisa de ao menos um instrumento ativo para novos lancamentos.",
    );
  }
}

function buildUpdatedInstrument(
  current: CardInstrument,
  payload: UpdateCardInstrumentPayload,
  now: string,
  userId: EntityId,
): CardInstrument {
  const updated: CardInstrument = {
    ...current,
    updatedAt: now,
    updatedByUserId: userId,
  };

  if (payload.type !== undefined) {
    updated.type = validateInstrumentType(payload.type);
  }

  if (payload.holder !== undefined) {
    updated.holder = validateInstrumentHolder(payload.holder);
  }

  if (payload.name !== undefined) {
    const name = normalizeOptionalText(payload.name, "CARD_INSTRUMENT_NAME_REQUIRED");

    if (name === undefined) {
      delete updated.name;
    } else {
      updated.name = name;
    }
  }

  if (payload.maskedIdentifier !== undefined) {
    const maskedIdentifier = normalizeOptionalText(
      payload.maskedIdentifier,
      "CARD_INSTRUMENT_IDENTIFIER_UNSAFE",
    );

    if (maskedIdentifier === undefined) {
      delete updated.maskedIdentifier;
    } else {
      updated.maskedIdentifier = validateMaskedIdentifier(maskedIdentifier);
    }
  }

  if (payload.creditLimitMinor !== undefined) {
    if (payload.creditLimitMinor === null) {
      delete updated.creditLimitMinor;
    } else {
      updated.creditLimitMinor = validateCreditLimit(payload.creditLimitMinor);
    }
  }

  return updated;
}

function validateInstrumentType(type: CardInstrumentType): CardInstrumentType {
  if (!ALLOWED_INSTRUMENT_TYPES.includes(type)) {
    throw cardInstrumentError("CARD_INSTRUMENT_TYPE_INVALID", "Tipo de instrumento invalido.");
  }

  return type;
}

function validateInstrumentHolder(holder: CardInstrumentHolder): CardInstrumentHolder {
  if (!ALLOWED_INSTRUMENT_HOLDERS.includes(holder)) {
    throw cardInstrumentError("CARD_INSTRUMENT_HOLDER_INVALID", "Titularidade invalida.");
  }

  return holder;
}

function validateCreditLimit(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw cardInstrumentError(
      "CARD_INSTRUMENT_LIMIT_INVALID",
      "Limite do instrumento deve ser um valor inteiro positivo.",
    );
  }

  return value;
}

function normalizeOptionalText(value: string | null, code: string): string | undefined {
  if (value === null) {
    return undefined;
  }

  const text = value.trim();

  if (!text && code === "CARD_INSTRUMENT_NAME_REQUIRED") {
    throw cardInstrumentError(code, "Nome do instrumento nao pode ser vazio.");
  }

  return text || undefined;
}

function validateMaskedIdentifier(value: string): string {
  if (value.replace(/\D/g, "").length >= 13) {
    throw cardInstrumentError(
      "CARD_INSTRUMENT_IDENTIFIER_UNSAFE",
      "Identificador do instrumento deve estar mascarado.",
    );
  }

  return value;
}

function assertActiveInstrumentLimitsDoNotExceedCard(
  card: Card,
  instruments: readonly CardInstrument[],
): void {
  if (card.creditLimitMinor === undefined) {
    return;
  }

  const total = instruments
    .filter((instrument) => instrument.status === "active")
    .reduce((sum, instrument) => sum + (instrument.creditLimitMinor ?? 0), 0);

  if (total > card.creditLimitMinor) {
    throw cardInstrumentError(
      "CARD_INSTRUMENT_LIMIT_EXCEEDS_CARD_LIMIT",
      "A soma dos limites dos instrumentos ativos nao pode superar o limite do cartao.",
    );
  }
}

async function persistCardWithInstruments(
  card: Card,
  instruments: readonly CardInstrument[],
): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await persistCard(executeQuery, card);

    for (const instrument of instruments) {
      await persistCardInstrument(executeQuery, instrument);
    }
  });
}

async function persistCardMutation(result: CardMutationResult): Promise<void> {
  await withTransaction(async (executeQuery) => {
    await persistCard(executeQuery, result.card);
    await insertAuditLogEntry(executeQuery, result.auditEntry);
  });
}

async function persistCard(executeQuery: ExecuteQuery, card: Card): Promise<void> {
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
      card.id,
      card.organizationId,
      card.financialProfileId,
      card.paymentAccountId ?? null,
      card.name,
      card.status.toUpperCase(),
      card.closingDay,
      card.dueDay,
      card.creditLimitMinor ?? null,
      card.maskedIdentifier ?? null,
      card.institutionKey ?? null,
      card.brandKey ?? null,
      card.createdAt,
      card.updatedAt,
      card.createdByUserId ?? null,
      card.updatedByUserId ?? null,
    ],
  );
}

async function persistCardInstrument(
  executeQuery: ExecuteQuery,
  instrument: CardInstrument,
): Promise<void> {
  await executeQuery(
    `insert into "CardInstrument"
      ("id", "organizationId", "financialProfileId", "cardId", "type", "holder", "status", "isDefault",
       "name", "maskedIdentifier", "creditLimitMinor", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     on conflict ("id") do update set
       "type" = excluded."type", "holder" = excluded."holder", "status" = excluded."status",
       "isDefault" = excluded."isDefault", "name" = excluded."name",
       "maskedIdentifier" = excluded."maskedIdentifier", "creditLimitMinor" = excluded."creditLimitMinor",
       "updatedAt" = excluded."updatedAt", "updatedByUserId" = excluded."updatedByUserId"`,
    [
      instrument.id,
      instrument.organizationId,
      instrument.financialProfileId,
      instrument.cardId,
      instrument.type.toUpperCase(),
      instrument.holder.toUpperCase(),
      instrument.status.toUpperCase(),
      instrument.isDefault,
      instrument.name ?? null,
      instrument.maskedIdentifier ?? null,
      instrument.creditLimitMinor ?? null,
      instrument.createdAt,
      instrument.updatedAt,
      instrument.createdByUserId ?? null,
      instrument.updatedByUserId ?? null,
    ],
  );
}

async function findCardRow(context: TenantContext, cardId: EntityId): Promise<Card | undefined> {
  const rows = await query<CardRow>(
    `select ${CARD_COLUMNS} from "Card" where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [cardId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapCardRow(rows[0]) : undefined;
}

async function findCardInstrumentRow(
  context: TenantContext,
  instrumentId: EntityId,
): Promise<CardInstrument> {
  const rows = await query<CardInstrumentRow>(
    `select ${CARD_INSTRUMENT_COLUMNS} from "CardInstrument"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [instrumentId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (!row) {
    throw cardInstrumentError("CARD_INSTRUMENT_CARD_MISMATCH", "Instrumento nao encontrado.", 404);
  }

  return mapCardInstrumentRow(row);
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

function mapCardInstrumentRow(row: CardInstrumentRow): CardInstrument {
  const instrument: CardInstrument = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    cardId: row.cardId,
    type: row.type.toLowerCase() as CardInstrumentType,
    holder: row.holder.toLowerCase() as CardInstrumentHolder,
    status: row.status.toLowerCase() as CardInstrumentStatus,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.name !== null) instrument.name = row.name;
  if (row.maskedIdentifier !== null) instrument.maskedIdentifier = row.maskedIdentifier;
  if (row.creditLimitMinor !== null) instrument.creditLimitMinor = row.creditLimitMinor;
  if (row.createdByUserId !== null) instrument.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) instrument.updatedByUserId = row.updatedByUserId;

  return instrument;
}

function cardInstrumentError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
