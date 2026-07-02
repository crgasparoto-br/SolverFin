import type { Card, CardInstrument } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { archiveCardInstrument, createCardInstrument } from "./card-instruments.js";
import { CardError, createCard, registerCardPurchase } from "./cards.js";

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

runUsesDefaultInstrumentWhenPurchaseOmitsInstrumentId();
runPreservesSelectedInstrumentOnPurchaseAndInstallments();
runSharesInvoiceAcrossInstrumentsOfSameAggregator();
runRejectsPurchaseWithoutActiveInstrument();
runRejectsArchivedInstrumentPurchase();
runRejectsMissingInstrumentPurchase();
runRejectsInstrumentFromAnotherTenant();
runRejectsInstrumentFromAnotherCard();

function runUsesDefaultInstrumentWhenPurchaseOmitsInstrumentId(): void {
  const group = createInstrumentGroup(createCardFixture("card-default-instrument"));
  const result = registerCardPurchase({
    transactionId: "transaction-default-instrument",
    context: tenantA,
    card: group.card,
    instruments: group.instruments,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 4_500,
      description: "Compra no instrumento padrao",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(
    result.transaction.cardInstrumentId,
    group.physical.id,
    "purchase should use the default active instrument",
  );
  assertEqual(result.invoice.cardId, group.card.id, "invoice should belong to the aggregator card");
}

function runPreservesSelectedInstrumentOnPurchaseAndInstallments(): void {
  const group = createInstrumentGroup(createCardFixture("card-selected-instrument"));
  const result = registerCardPurchase({
    transactionId: "transaction-selected-instrument",
    context: tenantA,
    card: group.card,
    instruments: group.instruments,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 10_001,
      description: "Compra parcelada no virtual",
      cardInstrumentId: group.virtual.id,
      totalInstallments: 3,
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeInstallmentId: (sequenceNumber, dueOn) => `installment-${sequenceNumber}-${dueOn}`,
  });

  assertEqual(
    result.transaction.cardInstrumentId,
    group.virtual.id,
    "purchase should keep selected instrument",
  );
  assertEqual(result.installments.length, 3, "installment purchase should create installments");

  for (const installment of result.installments) {
    assertEqual(
      installment.cardInstrumentId,
      group.virtual.id,
      "installment should keep purchase instrument",
    );
  }
}

function runSharesInvoiceAcrossInstrumentsOfSameAggregator(): void {
  const group = createInstrumentGroup(createCardFixture("card-shared-invoice"));
  const firstResult = registerCardPurchase({
    transactionId: "transaction-physical",
    context: tenantA,
    card: group.card,
    instruments: group.instruments,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 7_500,
      description: "Compra no fisico",
      cardInstrumentId: group.physical.id,
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });
  const secondResult = registerCardPurchase({
    transactionId: "transaction-virtual",
    context: tenantA,
    card: group.card,
    instruments: group.instruments,
    existingInvoices: [firstResult.invoice],
    now,
    payload: {
      occurredOn: "2026-06-18",
      amountMinor: 2_500,
      description: "Compra no virtual",
      cardInstrumentId: group.virtual.id,
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(
    secondResult.invoice.id,
    firstResult.invoice.id,
    "same aggregator and period should share invoice",
  );
  assertEqual(secondResult.invoice.totalAmountMinor, 10_000, "invoice should accumulate purchases");
  assertEqual(
    firstResult.transaction.cardInstrumentId,
    group.physical.id,
    "first purchase should keep physical instrument",
  );
  assertEqual(
    secondResult.transaction.cardInstrumentId,
    group.virtual.id,
    "second purchase should keep virtual instrument",
  );
}

function runRejectsPurchaseWithoutActiveInstrument(): void {
  const card = createCardFixture("card-without-instruments");

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-without-instrument",
        context: tenantA,
        card,
        instruments: [],
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1_000,
          description: "Compra sem instrumento",
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_INSTRUMENT_REQUIRED",
  );
}

function runRejectsArchivedInstrumentPurchase(): void {
  const group = createInstrumentGroup(createCardFixture("card-archived-instrument"));
  const archivedResult = archiveCardInstrument({
    context: tenantA,
    card: group.card,
    instruments: group.instruments,
    instrumentId: group.virtual.id,
    now,
  });

  assertEqual(archivedResult.card.status, "active", "card should remain active with another instrument");
  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-archived-instrument",
        context: tenantA,
        card: archivedResult.card,
        instruments: archivedResult.instruments,
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1_000,
          description: "Compra no instrumento arquivado",
          cardInstrumentId: group.virtual.id,
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_INSTRUMENT_NOT_ACTIVE",
  );
}

function runRejectsMissingInstrumentPurchase(): void {
  const group = createInstrumentGroup(createCardFixture("card-missing-instrument"));

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-missing-instrument",
        context: tenantA,
        card: group.card,
        instruments: group.instruments,
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1_000,
          description: "Compra com instrumento inexistente",
          cardInstrumentId: "instrument-missing",
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_INSTRUMENT_CARD_MISMATCH",
  );
}

function runRejectsInstrumentFromAnotherTenant(): void {
  const group = createInstrumentGroup(createCardFixture("card-tenant-owner"));
  const tenantBCard = createCardFixtureForTenant("card-tenant-b", tenantB);
  const tenantBInstrument = createCardInstrument({
    id: "instrument-tenant-b",
    context: tenantB,
    card: tenantBCard,
    existingInstruments: [],
    now,
    payload: {
      cardId: tenantBCard.id,
      type: "physical",
      holder: "primary",
    },
  }).instrument;

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-cross-tenant-instrument",
        context: tenantA,
        card: group.card,
        instruments: [...group.instruments, tenantBInstrument],
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1_000,
          description: "Compra com instrumento de outro tenant",
          cardInstrumentId: tenantBInstrument.id,
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_INSTRUMENT_CARD_MISMATCH",
  );
}

function runRejectsInstrumentFromAnotherCard(): void {
  const group = createInstrumentGroup(createCardFixture("card-owner"));
  const otherGroup = createInstrumentGroup(createCardFixture("card-other-owner"));

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-wrong-instrument",
        context: tenantA,
        card: group.card,
        instruments: [...group.instruments, ...otherGroup.instruments],
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1_000,
          description: "Compra com instrumento de outro cartao",
          cardInstrumentId: otherGroup.physical.id,
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_INSTRUMENT_CARD_MISMATCH",
  );
}

function createCardFixture(id: string): Card {
  return createCardFixtureForTenant(id, tenantA);
}

function createCardFixtureForTenant(id: string, context: TenantContext): Card {
  return createCard({
    id,
    context,
    now,
    payload: {
      name: `Cartao ${id}`,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 100_000,
    },
  }).card;
}

function createInstrumentGroup(card: Card): {
  card: Card;
  instruments: readonly CardInstrument[];
  physical: CardInstrument;
  virtual: CardInstrument;
} {
  const physicalResult = createCardInstrument({
    id: `${card.id}-physical`,
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
      name: "Cartao fisico",
      maskedIdentifier: "**** 1111",
    },
  });
  const virtualResult = createCardInstrument({
    id: `${card.id}-virtual`,
    context: tenantA,
    card: physicalResult.card,
    existingInstruments: physicalResult.instruments,
    now,
    payload: {
      cardId: card.id,
      type: "virtual",
      holder: "primary",
      name: "Cartao virtual",
      maskedIdentifier: "**** 2222",
    },
  });
  const physical = virtualResult.instruments.find(
    (instrument) => instrument.id === physicalResult.instrument.id,
  );

  if (physical === undefined) {
    throw new Error("Expected physical instrument to remain in group.");
  }

  return {
    card: virtualResult.card,
    instruments: virtualResult.instruments,
    physical,
    virtual: virtualResult.instrument,
  };
}

function assertCardError(action: () => void, expectedCode: CardError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CardError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected card error ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
