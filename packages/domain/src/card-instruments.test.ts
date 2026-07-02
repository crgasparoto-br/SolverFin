import type { Card, CardInstrument } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  archiveCardInstrument,
  CardInstrumentError,
  createCardInstrument,
  getDefaultCardInstrument,
  isCardAvailableForNewCardPurchases,
  setDefaultCardInstrument,
  type CreateCardInstrumentPayload,
} from "./card-instruments.js";
import { blockCard, createCard } from "./cards.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";

const now = "2026-06-15T10:00:00.000Z";

const tenantA: TenantContext = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
  userId: "user-a",
};

const tenantB: TenantContext = {
  organizationId: "org-b",
  financialProfileId: "profile-b",
  financialProfileKind: "personal",
  userId: "user-b",
};

runCreatesFirstActiveInstrumentAsDefault();
runKeepsExistingDefaultWhenAddingInstrument();
runSetsSingleDefaultInstrument();
runArchivesDefaultAndPromotesNextActiveInstrument();
runBlocksCardWhenLastActiveInstrumentIsArchived();
runRejectsInstrumentWithoutRequiredFields();
runRejectsActiveInstrumentLimitsAboveCardLimit();
runRejectsInstrumentFromAnotherCard();
runTenantIsolation();

function runCreatesFirstActiveInstrumentAsDefault(): void {
  const card = createCardFixture("card-first");
  const blockedCard = blockCard(tenantA, card, now).card;
  const result = createCardInstrument({
    id: "instrument-first",
    context: tenantA,
    card: blockedCard,
    existingInstruments: [],
    now,
    payload: {
      cardId: blockedCard.id,
      type: "physical",
      holder: "primary",
      maskedIdentifier: "**** 4242",
    },
  });

  assertEqual(result.instrument.isDefault, true, "first instrument should be default");
  assertEqual(result.card.status, "active", "card should become active");
  assertEqual(isAvailable(result.card, result.instruments), true, "card should be available");
}

function runKeepsExistingDefaultWhenAddingInstrument(): void {
  const card = createCardFixture("card-keeps-default");
  const firstResult = createCardInstrument({
    id: "instrument-default",
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
    },
  });
  const secondResult = createCardInstrument({
    id: "instrument-secondary",
    context: tenantA,
    card: firstResult.card,
    existingInstruments: firstResult.instruments,
    now,
    payload: {
      cardId: card.id,
      type: "virtual",
      holder: "primary",
    },
  });

  assertEqual(
    getDefaultInstrumentId(secondResult.card, secondResult.instruments),
    "instrument-default",
    "new instrument should keep current default",
  );
}

function runSetsSingleDefaultInstrument(): void {
  const card = createCardFixture("card-switch-default");
  const firstResult = createCardInstrument({
    id: "instrument-physical",
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
    },
  });
  const secondResult = createCardInstrument({
    id: "instrument-virtual",
    context: tenantA,
    card: firstResult.card,
    existingInstruments: firstResult.instruments,
    now,
    payload: {
      cardId: card.id,
      type: "virtual",
      holder: "additional",
    },
  });
  const defaultResult = setDefaultCardInstrument({
    context: tenantA,
    card: secondResult.card,
    instruments: secondResult.instruments,
    instrumentId: "instrument-virtual",
    now,
  });

  const defaultCount = defaultResult.instruments.filter(
    (instrument) => instrument.isDefault,
  ).length;

  assertEqual(defaultCount, 1, "only one instrument should be default");
  assertEqual(
    getDefaultInstrumentId(defaultResult.card, defaultResult.instruments),
    "instrument-virtual",
    "selected instrument should become default",
  );
}

function runArchivesDefaultAndPromotesNextActiveInstrument(): void {
  const card = createCardFixture("card-archive-default");
  const firstResult = createCardInstrument({
    id: "instrument-physical-main",
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
    },
  });
  const secondResult = createCardInstrument({
    id: "instrument-virtual-main",
    context: tenantA,
    card: firstResult.card,
    existingInstruments: firstResult.instruments,
    now,
    payload: {
      cardId: card.id,
      type: "virtual",
      holder: "primary",
    },
  });
  const archivedResult = archiveCardInstrument({
    context: tenantA,
    card: secondResult.card,
    instruments: secondResult.instruments,
    instrumentId: "instrument-physical-main",
    now,
  });

  assertEqual(
    getDefaultInstrumentId(archivedResult.card, archivedResult.instruments),
    "instrument-virtual-main",
    "next active instrument should become default",
  );
  assertEqual(archivedResult.card.status, "active", "card should remain active");
}

function runBlocksCardWhenLastActiveInstrumentIsArchived(): void {
  const card = createCardFixture("card-last-archived");
  const createdResult = createCardInstrument({
    id: "instrument-only",
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
    },
  });
  const archivedResult = archiveCardInstrument({
    context: tenantA,
    card: createdResult.card,
    instruments: createdResult.instruments,
    instrumentId: "instrument-only",
    now,
  });

  assertEqual(archivedResult.card.status, "blocked", "card should be blocked");
  assertEqual(
    isAvailable(archivedResult.card, archivedResult.instruments),
    false,
    "card blocks use",
  );
}

function runRejectsInstrumentWithoutRequiredFields(): void {
  const card = createCardFixture("card-required-fields");

  assertCardInstrumentError(
    () =>
      createCardInstrument({
        id: "instrument-missing-type",
        context: tenantA,
        card,
        existingInstruments: [],
        now,
        payload: {
          cardId: card.id,
          holder: "primary",
        } as unknown as CreateCardInstrumentPayload,
      }),
    "CARD_INSTRUMENT_TYPE_REQUIRED",
  );

  assertCardInstrumentError(
    () =>
      createCardInstrument({
        id: "instrument-missing-holder",
        context: tenantA,
        card,
        existingInstruments: [],
        now,
        payload: {
          cardId: card.id,
          type: "physical",
        } as unknown as CreateCardInstrumentPayload,
      }),
    "CARD_INSTRUMENT_HOLDER_REQUIRED",
  );
}

function runRejectsActiveInstrumentLimitsAboveCardLimit(): void {
  const card = createCardFixture("card-limit", 10_000);
  const firstResult = createCardInstrument({
    id: "instrument-limit-physical",
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
      creditLimitMinor: 7_000,
    },
  });

  assertCardInstrumentError(
    () =>
      createCardInstrument({
        id: "instrument-limit-virtual",
        context: tenantA,
        card: firstResult.card,
        existingInstruments: firstResult.instruments,
        now,
        payload: {
          cardId: card.id,
          type: "virtual",
          holder: "additional",
          creditLimitMinor: 4_000,
        },
      }),
    "CARD_INSTRUMENT_LIMIT_EXCEEDS_CARD_LIMIT",
  );
}

function runRejectsInstrumentFromAnotherCard(): void {
  const card = createCardFixture("card-correct");
  const otherCard = createCardFixture("card-other");
  const otherInstrument = createCardInstrument({
    id: "instrument-other-card",
    context: tenantA,
    card: otherCard,
    existingInstruments: [],
    now,
    payload: {
      cardId: otherCard.id,
      type: "physical",
      holder: "primary",
    },
  }).instrument;

  assertCardInstrumentError(
    () =>
      setDefaultCardInstrument({
        context: tenantA,
        card,
        instruments: [otherInstrument],
        instrumentId: otherInstrument.id,
        now,
      }),
    "CARD_INSTRUMENT_CARD_MISMATCH",
  );
}

function runTenantIsolation(): void {
  const card = createCardFixture("card-tenant");
  const instrument = createCardInstrument({
    id: "instrument-tenant",
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
    },
  }).instrument;
  const tenantBCard = createCardFixtureForTenant(tenantB);

  assertEqual(
    getDefaultCardInstrument(tenantB, tenantBCard, [instrument]),
    undefined,
    "other tenant should not see instrument",
  );
  assertTenantError(() =>
    createCardInstrument({
      id: "instrument-cross-tenant",
      context: tenantB,
      card,
      existingInstruments: [],
      now,
      payload: {
        cardId: card.id,
        type: "physical",
        holder: "primary",
      },
    }),
  );
}

function createCardFixture(id: string, creditLimitMinor = 100_000): Card {
  return createCard({
    id,
    context: tenantA,
    now,
    payload: {
      name: `Cartao ${id}`,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor,
    },
  }).card;
}

function createCardFixtureForTenant(context: TenantContext): Card {
  return createCard({
    id: `card-${context.organizationId}`,
    context,
    now,
    payload: {
      name: `Cartao ${context.organizationId}`,
      closingDay: 20,
      dueDay: 10,
    },
  }).card;
}

function getDefaultInstrumentId(
  card: Card,
  instruments: readonly CardInstrument[],
): string | undefined {
  const instrument = getDefaultCardInstrument(tenantA, card, instruments);

  return instrument?.id;
}

function isAvailable(card: Card, instruments: readonly CardInstrument[]): boolean {
  return isCardAvailableForNewCardPurchases(tenantA, card, instruments);
}

function assertCardInstrumentError(
  action: () => void,
  expectedCode: CardInstrumentError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CardInstrumentError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected card instrument error ${expectedCode}.`);
}

function assertTenantError(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TenantAuthorizationError) {
      return;
    }

    throw error;
  }

  throw new Error("Expected tenant authorization error.");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
