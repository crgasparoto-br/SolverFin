import type { Card } from "./index.js";
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
  const blockedCard = blockCard(tenantA, createCardFixture("card-first"), now).card;
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

  assertEqual(result.instrument.isDefault, true, "first active instrument should be default");
  assertEqual(result.card.status, "active", "card should become active with an active instrument");
  assertEqual(
    isCardAvailableForNewCardPurchases(tenantA, result.card, result.instruments),
    true,
    "card should be available for purchases with an active instrument",
  );
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
    getDefaultCardInstrument(tenantA, secondResult.card, secondResult.instruments)?.id,
    "instrument-default",
    "new active instrument should not replace the current default automatically",
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

  assertEqual(
    defaultResult.instruments.filter((instrument) => instrument.isDefault).length,
    1,
    "only one active instrument should be default",
  );
  assertEqual(
    getDefaultCardInstrument(tenantA, defaultResult.card, defaultResult.instruments)?.id,
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
    getDefaultCardInstrument(tenantA, archivedResult.card, archivedResult.instruments)?.id,
    "instrument-virtual-main",
    "next active instrument should become default",
  );
  assertEqual(archivedResult.card.status, "active", "card should remain active with one instrument");
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

  assertEqual(archivedResult.card.status, "blocked", "card should be blocked without active instruments");
  assertEqual(
    isCardAvailableForNewCardPurchases(tenantA, archivedResult.card, archivedResult.instruments),
    false,
    "card should not be available without active instruments",
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

  assertEqual(
    getDefaultCardInstrument(tenantB, createCardFixtureForTenant(tenantB), [instrument]),
    undefined,
    "other tenant should not see the instrument",
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
