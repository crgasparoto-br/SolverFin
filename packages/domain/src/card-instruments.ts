import type {
  Card,
  CardInstrument,
  CardInstrumentHolder,
  CardInstrumentStatus,
  CardInstrumentType,
  CardStatus,
  EntityId,
  ISODateTime,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  getTenantScopedResource,
  listTenantScopedResources,
} from "./tenant-authorization.js";

export type CardInstrumentErrorCode =
  | "CARD_INSTRUMENT_CARD_REQUIRED"
  | "CARD_INSTRUMENT_CARD_MISMATCH"
  | "CARD_INSTRUMENT_TYPE_REQUIRED"
  | "CARD_INSTRUMENT_TYPE_INVALID"
  | "CARD_INSTRUMENT_HOLDER_REQUIRED"
  | "CARD_INSTRUMENT_HOLDER_INVALID"
  | "CARD_INSTRUMENT_STATUS_INVALID"
  | "CARD_INSTRUMENT_NAME_REQUIRED"
  | "CARD_INSTRUMENT_IDENTIFIER_UNSAFE"
  | "CARD_INSTRUMENT_LIMIT_INVALID"
  | "CARD_INSTRUMENT_LIMIT_EXCEEDS_CARD_LIMIT"
  | "CARD_INSTRUMENT_NOT_ACTIVE";

export class CardInstrumentError extends Error {
  readonly code: CardInstrumentErrorCode;
  readonly statusCode = 400;

  constructor(code: CardInstrumentErrorCode, message: string) {
    super(message);
    this.name = "CardInstrumentError";
    this.code = code;
  }
}

export interface CreateCardInstrumentInput {
  id: EntityId;
  context: TenantContext;
  card: Card | undefined;
  existingInstruments: readonly CardInstrument[];
  now: ISODateTime;
  payload: CreateCardInstrumentPayload;
}

export interface CreateCardInstrumentPayload {
  cardId: EntityId;
  type: CardInstrumentType;
  holder: CardInstrumentHolder;
  status?: CardInstrumentStatus;
  isDefault?: boolean;
  name?: string;
  maskedIdentifier?: string;
  creditLimitMinor?: number;
}

export interface SetDefaultCardInstrumentInput {
  context: TenantContext;
  card: Card | undefined;
  instruments: readonly CardInstrument[];
  instrumentId: EntityId;
  now: ISODateTime;
}

export interface ArchiveCardInstrumentInput {
  context: TenantContext;
  card: Card | undefined;
  instruments: readonly CardInstrument[];
  instrumentId: EntityId;
  now: ISODateTime;
}

export interface CardInstrumentMutationResult {
  card: Card;
  instrument: CardInstrument;
  instruments: readonly CardInstrument[];
}

const ALLOWED_INSTRUMENT_TYPES: readonly CardInstrumentType[] = [
  "physical",
  "virtual",
];
const ALLOWED_INSTRUMENT_HOLDERS: readonly CardInstrumentHolder[] = [
  "primary",
  "additional",
];
const ALLOWED_INSTRUMENT_STATUSES: readonly CardInstrumentStatus[] = [
  "active",
  "archived",
];

export function createCardInstrument(
  input: CreateCardInstrumentInput,
): CardInstrumentMutationResult {
  const card = getTenantScopedResource(input.context, input.card);

  assertInstrumentBelongsToCard(input.payload.cardId, card.id);

  const existingInstruments = listCardInstruments(
    input.context,
    card,
    input.existingInstruments,
  );
  const existingActiveInstruments = activeInstruments(existingInstruments);
  const status = validateInstrumentStatus(input.payload.status ?? "active");
  const shouldBecomeDefault =
    status === "active" &&
    (input.payload.isDefault === true || existingActiveInstruments.length === 0);
  const currentDefaultInstrumentId = existingActiveInstruments.find(
    (instrument) => instrument.isDefault,
  )?.id;
  const defaultInstrumentId = shouldBecomeDefault ? input.id : currentDefaultInstrumentId;
  const instrument: CardInstrument = {
    id: input.id,
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    cardId: card.id,
    type: validateInstrumentType(input.payload.type),
    holder: validateInstrumentHolder(input.payload.holder),
    status,
    isDefault: shouldBecomeDefault,
    createdAt: input.now,
    updatedAt: input.now,
    createdByUserId: input.context.userId,
    updatedByUserId: input.context.userId,
    ...buildOptionalInstrumentFields(input.payload),
  };
  const instruments = normalizeDefaultInstrument(
    [...existingInstruments, instrument],
    defaultInstrumentId,
    input.now,
    input.context.userId,
  );

  assertActiveInstrumentLimitsDoNotExceedCard(card, instruments);

  const syncedCard = syncCardStatusWithInstruments(
    card,
    instruments,
    input.now,
    input.context.userId,
  );

  return {
    card: syncedCard,
    instrument:
      instruments.find((candidate) => candidate.id === instrument.id) ?? instrument,
    instruments,
  };
}

export function setDefaultCardInstrument(
  input: SetDefaultCardInstrumentInput,
): CardInstrumentMutationResult {
  const card = getTenantScopedResource(input.context, input.card);
  const instruments = listCardInstruments(input.context, card, input.instruments);
  const target = instruments.find((instrument) => instrument.id === input.instrumentId);

  if (target === undefined) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_CARD_MISMATCH",
      "Card instrument does not belong to the provided card.",
    );
  }

  if (target.status !== "active") {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_NOT_ACTIVE",
      "Only active card instruments can be the default option.",
    );
  }

  const updatedInstruments = normalizeDefaultInstrument(
    instruments,
    target.id,
    input.now,
    input.context.userId,
  );
  const syncedCard = syncCardStatusWithInstruments(
    card,
    updatedInstruments,
    input.now,
    input.context.userId,
  );

  return {
    card: syncedCard,
    instrument: updatedInstruments.find((instrument) => instrument.id === target.id) ?? target,
    instruments: updatedInstruments,
  };
}

export function archiveCardInstrument(
  input: ArchiveCardInstrumentInput,
): CardInstrumentMutationResult {
  const card = getTenantScopedResource(input.context, input.card);
  const instruments = listCardInstruments(input.context, card, input.instruments);
  const target = instruments.find((instrument) => instrument.id === input.instrumentId);

  if (target === undefined) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_CARD_MISMATCH",
      "Card instrument does not belong to the provided card.",
    );
  }

  const archivedInstruments = instruments.map((instrument) => {
    if (instrument.id !== target.id) {
      return instrument;
    }

    return {
      ...instrument,
      status: "archived" as const,
      isDefault: false,
      updatedAt: input.now,
      updatedByUserId: input.context.userId,
    };
  });
  const nextDefault =
    activeInstruments(archivedInstruments).find((instrument) => instrument.isDefault) ??
    activeInstruments(archivedInstruments)[0];
  const updatedInstruments =
    nextDefault !== undefined
      ? normalizeDefaultInstrument(
          archivedInstruments,
          nextDefault.id,
          input.now,
          input.context.userId,
        )
      : archivedInstruments;
  const syncedCard = syncCardStatusWithInstruments(
    card,
    updatedInstruments,
    input.now,
    input.context.userId,
  );

  return {
    card: syncedCard,
    instrument: updatedInstruments.find((instrument) => instrument.id === target.id) ?? target,
    instruments: updatedInstruments,
  };
}

export function listCardInstruments(
  context: TenantContext,
  card: Card | undefined,
  instruments: readonly CardInstrument[],
): CardInstrument[] {
  const scopedCard = getTenantScopedResource(context, card);

  return listTenantScopedResources(context, instruments).filter(
    (instrument) => instrument.cardId === scopedCard.id,
  );
}

export function listActiveCardInstruments(
  context: TenantContext,
  card: Card | undefined,
  instruments: readonly CardInstrument[],
): CardInstrument[] {
  return activeInstruments(listCardInstruments(context, card, instruments));
}

export function getDefaultCardInstrument(
  context: TenantContext,
  card: Card | undefined,
  instruments: readonly CardInstrument[],
): CardInstrument | undefined {
  return listActiveCardInstruments(context, card, instruments).find(
    (instrument) => instrument.isDefault,
  );
}

export function isCardAvailableForNewCardPurchases(
  context: TenantContext,
  card: Card | undefined,
  instruments: readonly CardInstrument[],
): boolean {
  const scopedCard = getTenantScopedResource(context, card);

  return (
    scopedCard.status === "active" &&
    listActiveCardInstruments(context, scopedCard, instruments).length > 0
  );
}

function normalizeDefaultInstrument(
  instruments: readonly CardInstrument[],
  defaultInstrumentId: EntityId | undefined,
  now: ISODateTime,
  userId: EntityId,
): CardInstrument[] {
  return instruments.map((instrument) => {
    const shouldBeDefault =
      instrument.status === "active" && instrument.id === defaultInstrumentId;

    if (instrument.isDefault === shouldBeDefault) {
      return instrument;
    }

    return {
      ...instrument,
      isDefault: shouldBeDefault,
      updatedAt: now,
      updatedByUserId: userId,
    };
  });
}

function syncCardStatusWithInstruments(
  card: Card,
  instruments: readonly CardInstrument[],
  now: ISODateTime,
  userId: EntityId,
): Card {
  const status = resolveCardStatus(card.status, activeInstruments(instruments).length);

  if (status === card.status) {
    return card;
  }

  return {
    ...card,
    status,
    updatedAt: now,
    updatedByUserId: userId,
  };
}

function resolveCardStatus(
  currentStatus: CardStatus,
  activeInstrumentCount: number,
): CardStatus {
  if (currentStatus === "archived") {
    return "archived";
  }

  return activeInstrumentCount > 0 ? "active" : "blocked";
}

function activeInstruments(instruments: readonly CardInstrument[]): CardInstrument[] {
  return instruments.filter((instrument) => instrument.status === "active");
}

function buildOptionalInstrumentFields(
  payload: CreateCardInstrumentPayload,
): Partial<CardInstrument> {
  const fields: Partial<CardInstrument> = {};
  const name = normalizeOptionalName(payload.name);

  if (name !== undefined) {
    fields.name = name;
  }

  if (payload.maskedIdentifier !== undefined) {
    fields.maskedIdentifier = normalizeMaskedIdentifier(payload.maskedIdentifier);
  }

  if (payload.creditLimitMinor !== undefined) {
    fields.creditLimitMinor = validateCreditLimit(payload.creditLimitMinor);
  }

  return fields;
}

function assertInstrumentBelongsToCard(
  cardId: EntityId | undefined,
  expectedCardId: EntityId,
): void {
  if (cardId === undefined || !cardId.trim()) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_CARD_REQUIRED",
      "Card instrument must belong to a card.",
    );
  }

  if (cardId !== expectedCardId) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_CARD_MISMATCH",
      "Card instrument does not belong to the provided card.",
    );
  }
}

function validateInstrumentType(
  type: CardInstrumentType | undefined,
): CardInstrumentType {
  if (type === undefined) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_TYPE_REQUIRED",
      "Card instrument type is required.",
    );
  }

  if (!ALLOWED_INSTRUMENT_TYPES.includes(type)) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_TYPE_INVALID",
      "Card instrument type is not supported.",
    );
  }

  return type;
}

function validateInstrumentHolder(
  holder: CardInstrumentHolder | undefined,
): CardInstrumentHolder {
  if (holder === undefined) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_HOLDER_REQUIRED",
      "Card instrument holder is required.",
    );
  }

  if (!ALLOWED_INSTRUMENT_HOLDERS.includes(holder)) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_HOLDER_INVALID",
      "Card instrument holder is not supported.",
    );
  }

  return holder;
}

function validateInstrumentStatus(status: CardInstrumentStatus): CardInstrumentStatus {
  if (!ALLOWED_INSTRUMENT_STATUSES.includes(status)) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_STATUS_INVALID",
      "Card instrument status is not supported.",
    );
  }

  return status;
}

function normalizeOptionalName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_NAME_REQUIRED",
      "Card instrument name cannot be empty when provided.",
    );
  }

  return normalizedName;
}

function normalizeMaskedIdentifier(maskedIdentifier: string): string {
  const normalizedIdentifier = maskedIdentifier.trim();
  const digitsOnly = normalizedIdentifier.replace(/\D/g, "");

  if (digitsOnly.length >= 13) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_IDENTIFIER_UNSAFE",
      "Card instrument identifier must be masked and cannot contain a full card number.",
    );
  }

  return normalizedIdentifier;
}

function validateCreditLimit(creditLimitMinor: number): number {
  if (!Number.isInteger(creditLimitMinor) || creditLimitMinor < 0) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_LIMIT_INVALID",
      "Card instrument limit must be an integer minor-unit amount.",
    );
  }

  return creditLimitMinor;
}

function assertActiveInstrumentLimitsDoNotExceedCard(
  card: Card,
  instruments: readonly CardInstrument[],
): void {
  if (card.creditLimitMinor === undefined) {
    return;
  }

  const activeInstrumentLimitTotal = activeInstruments(instruments).reduce(
    (sum, instrument) => sum + (instrument.creditLimitMinor ?? 0),
    0,
  );

  if (activeInstrumentLimitTotal > card.creditLimitMinor) {
    throw new CardInstrumentError(
      "CARD_INSTRUMENT_LIMIT_EXCEEDS_CARD_LIMIT",
      "Active card instrument limits cannot exceed the card total limit.",
    );
  }
}
