import type { Card, CardInstrument } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { CardError, createCard, registerCardPurchase } from "./cards.js";
import { createCardInstrument } from "./card-instruments.js";

const now = "2026-06-15T10:00:00.000Z";

const tenantA: TenantContext = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
  userId: "user-a",
};

runUsesDefaultInstrumentForPurchase();
runConsolidatesDifferentInstrumentsOnSameCardInvoice();
runRejectsArchivedInstrumentForPurchase();

function runUsesDefaultInstrumentForPurchase(): void {
  const setup = createCardWithInstruments("card-default-purchase");
  const defaultInstrument = requireInstrument(
    setup.instruments,
    "instrument-card-default-purchase-physical",
  );
  const result = registerCardPurchase({
    transactionId: "transaction-default-instrument",
    context: tenantA,
    card: setup.card,
    instruments: setup.instruments,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 12345,
      description: "Compra com instrumento default",
    },
    makeInvoiceId: (period) => `invoice-${setup.card.id}-${period.periodEndOn}`,
  });

  assertEqual(
    result.transaction.cardInstrumentId,
    defaultInstrument.id,
    "purchase should use the active default instrument",
  );
  assertEqual(result.invoice.cardId, setup.card.id, "invoice should belong to the card group");
}

function runConsolidatesDifferentInstrumentsOnSameCardInvoice(): void {
  const setup = createCardWithInstruments("card-consolidated-invoice");
  const physicalInstrument = requireInstrument(
    setup.instruments,
    "instrument-card-consolidated-invoice-physical",
  );
  const virtualInstrument = requireInstrument(
    setup.instruments,
    "instrument-card-consolidated-invoice-virtual",
  );
  const firstResult = registerCardPurchase({
    transactionId: "transaction-physical-instrument",
    context: tenantA,
    card: setup.card,
    instruments: setup.instruments,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 10000,
      description: "Compra no fisico titular",
      cardInstrumentId: physicalInstrument.id,
    },
    makeInvoiceId: (period) => `invoice-${setup.card.id}-${period.periodEndOn}`,
  });
  const secondResult = registerCardPurchase({
    transactionId: "transaction-virtual-instrument",
    context: tenantA,
    card: setup.card,
    instruments: setup.instruments,
    existingInvoices: [firstResult.invoice],
    now,
    payload: {
      occurredOn: "2026-06-18",
      amountMinor: 5000,
      description: "Compra no virtual adicional",
      cardInstrumentId: virtualInstrument.id,
    },
    makeInvoiceId: (period) => `invoice-${setup.card.id}-${period.periodEndOn}`,
  });

  assertEqual(
    secondResult.invoice.id,
    firstResult.invoice.id,
    "same card group should reuse the invoice for the period",
  );
  assertEqual(
    secondResult.invoice.totalAmountMinor,
    15000,
    "invoice should consolidate purchases from all instruments",
  );
  assertEqual(
    firstResult.transaction.cardInstrumentId,
    physicalInstrument.id,
    "first purchase should preserve physical instrument origin",
  );
  assertEqual(
    secondResult.transaction.cardInstrumentId,
    virtualInstrument.id,
    "second purchase should preserve virtual instrument origin",
  );
}

function runRejectsArchivedInstrumentForPurchase(): void {
  const setup = createCardWithInstruments("card-archived-instrument");
  const virtualInstrument = requireInstrument(
    setup.instruments,
    "instrument-card-archived-instrument-virtual",
  );
  const instrumentsWithArchivedVirtual = setup.instruments.map((instrument) => {
    if (instrument.id !== virtualInstrument.id) {
      return instrument;
    }

    return {
      ...instrument,
      status: "archived" as const,
      isDefault: false,
    };
  });

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-archived-instrument",
        context: tenantA,
        card: setup.card,
        instruments: instrumentsWithArchivedVirtual,
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1000,
          description: "Compra em instrumento arquivado",
          cardInstrumentId: virtualInstrument.id,
        },
        makeInvoiceId: (period) => `invoice-${setup.card.id}-${period.periodEndOn}`,
      }),
    "CARD_INSTRUMENT_NOT_ACTIVE",
  );
}

function createCardWithInstruments(cardId: string): {
  card: Card;
  instruments: readonly CardInstrument[];
} {
  const card = createCard({
    id: cardId,
    context: tenantA,
    now,
    payload: {
      name: `Cartao ${cardId}`,
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 100000,
    },
  }).card;
  const physicalResult = createCardInstrument({
    id: `instrument-${cardId}-physical`,
    context: tenantA,
    card,
    existingInstruments: [],
    now,
    payload: {
      cardId: card.id,
      type: "physical",
      holder: "primary",
      name: "Fisico titular",
      creditLimitMinor: 60000,
    },
  });
  const virtualResult = createCardInstrument({
    id: `instrument-${cardId}-virtual`,
    context: tenantA,
    card: physicalResult.card,
    existingInstruments: physicalResult.instruments,
    now,
    payload: {
      cardId: card.id,
      type: "virtual",
      holder: "additional",
      name: "Virtual adicional",
      creditLimitMinor: 30000,
    },
  });

  return { card: virtualResult.card, instruments: virtualResult.instruments };
}

function requireInstrument(
  instruments: readonly CardInstrument[],
  instrumentId: string,
): CardInstrument {
  const instrument = instruments.find((candidate) => candidate.id === instrumentId);

  if (instrument === undefined) {
    throw new Error(`Expected instrument ${instrumentId}.`);
  }

  return instrument;
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
