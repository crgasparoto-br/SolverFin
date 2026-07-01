import type { Account, Card, Invoice } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  blockCard,
  calculateInvoicePeriod,
  CardError,
  createCard,
  listCards,
  payInvoice,
  registerCardPurchase,
  updateCard,
} from "./cards.js";
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

const paymentAccount = createAccountFixture(tenantA, "account-payment", "active");

runCreatesCardWithMaskedIdentifier();
runCreatesCardWithVisualKeys();
runUpdatesCardVisualKeys();
runRejectsInvalidVisualKeys();
runRejectsUnsafeCardIdentifier();
runCalculatesInvoicePeriodAroundClosingDay();
runRegistersPurchaseAndCreatesInvoice();
runUpdatesExistingOpenInvoice();
runRegistersInstallmentPurchase();
runRegistersInstallmentPurchaseWithCustomStart();
runDistributesInstallmentsAcrossFutureInvoices();
runRejectsInvalidInstallmentStart();
runSharesInvoiceAcrossGroupCardId();
runCreatesPaymentForecastTransaction();
runUpdatesExistingPaymentForecastTransaction();
runSkipsForecastTransactionWithoutPaymentAccount();
runVoidsForecastTransactionWhenInvoicePaid();
runPaysInvoiceFromAccount();
runRejectsPartialPaymentInMvp();
runRejectsBlockedCardPurchase();
runTenantIsolation();

function runCreatesCardWithMaskedIdentifier(): void {
  const result = createCard({
    id: "card-main",
    context: tenantA,
    now,
    paymentAccount,
    payload: {
      name: "Cartao Solver Demo",
      closingDay: 20,
      dueDay: 10,
      creditLimitMinor: 500000,
      maskedIdentifier: "**** 4242",
      paymentAccountId: paymentAccount.id,
    },
  });

  assertEqual(result.card.status, "active", "card should start active");
  assertEqual(result.card.paymentAccountId, paymentAccount.id, "card should keep payment account");
  assertEqual(result.auditEntry.entityKind, "card", "audit should target card");
}

function runCreatesCardWithVisualKeys(): void {
  const result = createCard({
    id: "card-visual",
    context: tenantA,
    now,
    payload: {
      name: "Cartao visual",
      closingDay: 20,
      dueDay: 10,
      institutionKey: " Porto_Bank ",
      brandKey: " Mastercard ",
    },
  });

  assertEqual(result.card.institutionKey, "porto_bank", "institution key should normalize");
  assertEqual(result.card.brandKey, "mastercard", "brand key should normalize");
}

function runUpdatesCardVisualKeys(): void {
  const card = createCardFixture();
  const result = updateCard({
    context: tenantA,
    card,
    now,
    payload: {
      institutionKey: "c6",
      brandKey: "elo",
    },
  });

  assertEqual(result.card.institutionKey, "c6", "institution key should update");
  assertEqual(result.card.brandKey, "elo", "brand key should update");
}

function runRejectsInvalidVisualKeys(): void {
  assertCardError(
    () =>
      createCard({
        id: "card-invalid-institution",
        context: tenantA,
        now,
        payload: {
          name: "Cartao instituicao invalida",
          closingDay: 20,
          dueDay: 10,
          institutionKey: "banco-livre",
        },
      }),
    "CARD_INSTITUTION_KEY_INVALID",
  );

  assertCardError(
    () =>
      createCard({
        id: "card-invalid-brand",
        context: tenantA,
        now,
        payload: {
          name: "Cartao bandeira invalida",
          closingDay: 20,
          dueDay: 10,
          brandKey: "bandeira-livre",
        },
      }),
    "CARD_BRAND_KEY_INVALID",
  );
}

function runRejectsUnsafeCardIdentifier(): void {
  assertCardError(
    () =>
      createCard({
        id: "card-unsafe",
        context: tenantA,
        now,
        payload: {
          name: "Cartao inseguro",
          closingDay: 20,
          dueDay: 10,
          maskedIdentifier: "4111111111111111",
        },
      }),
    "CARD_IDENTIFIER_UNSAFE",
  );
}

function runCalculatesInvoicePeriodAroundClosingDay(): void {
  const card = createCardFixture();
  const beforeClosing = calculateInvoicePeriod(card, "2026-06-15");
  const afterClosing = calculateInvoicePeriod(card, "2026-06-21");

  assertEqual(
    beforeClosing.periodStartOn,
    "2026-05-21",
    "period should start after previous closing",
  );
  assertEqual(
    beforeClosing.periodEndOn,
    "2026-06-20",
    "purchase before closing should close in same month",
  );
  assertEqual(beforeClosing.dueOn, "2026-07-10", "due date should be after closing");
  assertEqual(afterClosing.periodStartOn, "2026-06-21", "next period should start after closing");
  assertEqual(
    afterClosing.periodEndOn,
    "2026-07-20",
    "purchase after closing should go to next invoice",
  );
  assertEqual(afterClosing.dueOn, "2026-08-10", "next invoice should be due after closing");
}

function runRegistersPurchaseAndCreatesInvoice(): void {
  const card = createCardFixture();
  const result = registerCardPurchase({
    transactionId: "transaction-market",
    context: tenantA,
    card,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 12345,
      description: "Mercado ficticio",
      currency: "brl",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(result.invoice.id, "invoice-2026-06-20", "purchase should create invoice id");
  assertEqual(result.invoice.totalAmountMinor, 12345, "invoice should receive purchase total");
  assertEqual(result.invoice.currency, "BRL", "invoice currency should normalize");
  assertEqual(result.transaction.cardId, card.id, "transaction should reference card");
  assertEqual(
    result.transaction.invoiceId,
    result.invoice.id,
    "transaction should reference invoice",
  );
  assertEqual(result.installments.length, 0, "single purchase should not create installments");
}

function runUpdatesExistingOpenInvoice(): void {
  const card = createCardFixture();
  const existingInvoice = createInvoiceFixture(
    card,
    "2026-05-21",
    "2026-06-20",
    "2026-07-10",
    5000,
  );
  const result = registerCardPurchase({
    transactionId: "transaction-pharmacy",
    context: tenantA,
    card,
    existingInvoices: [existingInvoice],
    now,
    payload: {
      occurredOn: "2026-06-18",
      amountMinor: 2500,
      description: "Farmacia ficticia",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(result.invoice.id, existingInvoice.id, "existing invoice should be reused");
  assertEqual(result.invoice.totalAmountMinor, 7500, "existing invoice total should increase");
}

function runRegistersInstallmentPurchase(): void {
  const card = createCardFixture();
  const result = registerCardPurchase({
    transactionId: "transaction-installments",
    context: tenantA,
    card,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 10000,
      description: "Compra parcelada ficticia",
      totalInstallments: 3,
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeInstallmentId: (sequenceNumber) => `installment-${sequenceNumber}`,
  });

  assertEqual(result.installments.length, 3, "installment purchase should create schedule");
  assertEqual(
    result.installments[0]?.amountMinor,
    3334,
    "first installment should receive remainder",
  );
  assertEqual(result.installments[1]?.amountMinor, 3333, "second installment should split amount");
  assertEqual(
    result.installments[2]?.dueOn,
    "2026-09-10",
    "installments should follow invoice due day monthly",
  );
  assertEqual(
    result.installments[0]?.transactionId,
    result.transaction.id,
    "installment should reference purchase",
  );
}

function runDistributesInstallmentsAcrossFutureInvoices(): void {
  const card = createCardFixture();
  const result = registerCardPurchase({
    transactionId: "transaction-installments-future",
    context: tenantA,
    card,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 10000,
      description: "Compra parcelada ficticia",
      totalInstallments: 3,
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeInstallmentId: (sequenceNumber) => `installment-${sequenceNumber}`,
  });

  assertEqual(
    result.invoice.totalAmountMinor,
    3334,
    "current invoice should receive only the first installment share",
  );
  assertEqual(result.futureInvoices.length, 2, "purchase should create two future invoices");
  assertEqual(
    result.futureInvoices[0]?.totalAmountMinor,
    3333,
    "second installment should land on the next invoice",
  );
  assertEqual(
    result.futureInvoices[1]?.totalAmountMinor,
    3333,
    "third installment should land on the invoice after that",
  );
  const distributedTotal =
    result.invoice.totalAmountMinor +
    result.futureInvoices.reduce((sum, invoice) => sum + invoice.totalAmountMinor, 0);
  assertEqual(
    distributedTotal,
    10000,
    "distributed invoice totals should match the purchase total",
  );
}

function runRegistersInstallmentPurchaseWithCustomStart(): void {
  const card = createCardFixture();
  const result = registerCardPurchase({
    transactionId: "transaction-installments-start",
    context: tenantA,
    card,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 10000,
      description: "Compra parcelada retroativa",
      totalInstallments: 3,
      installmentStart: 2,
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeInstallmentId: (sequenceNumber) => `installment-${sequenceNumber}`,
  });

  assertEqual(result.installments.length, 2, "only remaining installments should be created");
  assertEqual(result.installments[0]?.sequenceNumber, 2, "schedule should start at parcel 2");
  assertEqual(result.installments[1]?.sequenceNumber, 3, "schedule should end at the last parcel");
  assertEqual(
    result.invoice.totalAmountMinor,
    3333,
    "current invoice should receive only the starting installment share",
  );
  assertEqual(result.futureInvoices.length, 1, "only one future invoice remains after the start");
  assertEqual(
    result.transaction.amountMinor,
    10000,
    "transaction should keep the full purchase value for display",
  );
}

function runRejectsInvalidInstallmentStart(): void {
  const card = createCardFixture();

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-installments-invalid-start",
        context: tenantA,
        card,
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 10000,
          description: "Compra parcelada invalida",
          totalInstallments: 3,
          installmentStart: 4,
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
        makeInstallmentId: (sequenceNumber) => `installment-${sequenceNumber}`,
      }),
    "CARD_INSTALLMENTS_INVALID",
  );
}

function runSharesInvoiceAcrossGroupCardId(): void {
  const physicalCard = createCard({
    id: "card-c6-fisico",
    context: tenantA,
    now,
    payload: { name: "C6 - Físico", closingDay: 26, dueDay: 1 },
  }).card;
  const virtualCard = createCard({
    id: "card-c6-virtual",
    context: tenantA,
    now,
    payload: { name: "C6 - Virtual", closingDay: 26, dueDay: 1 },
  }).card;

  const firstResult = registerCardPurchase({
    transactionId: "transaction-c6-physical",
    context: tenantA,
    card: physicalCard,
    groupCardId: virtualCard.id,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-20",
      amountMinor: 10000,
      description: "Compra no fisico",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(
    firstResult.invoice.cardId,
    virtualCard.id,
    "shared invoice should be filed under the group card id",
  );
  assertEqual(
    firstResult.transaction.cardId,
    physicalCard.id,
    "transaction should keep the literal card used for the purchase",
  );

  const secondResult = registerCardPurchase({
    transactionId: "transaction-c6-virtual",
    context: tenantA,
    card: virtualCard,
    groupCardId: virtualCard.id,
    existingInvoices: [firstResult.invoice],
    now,
    payload: {
      occurredOn: "2026-06-21",
      amountMinor: 5000,
      description: "Compra no virtual",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(
    secondResult.invoice.id,
    firstResult.invoice.id,
    "purchase on the other family card should reuse the shared invoice",
  );
  assertEqual(
    secondResult.invoice.totalAmountMinor,
    15000,
    "shared invoice total should accumulate purchases from both cards",
  );
}

function runCreatesPaymentForecastTransaction(): void {
  const card = createCardFixtureWithPayment();
  const result = registerCardPurchase({
    transactionId: "transaction-forecast",
    context: tenantA,
    card,
    existingInvoices: [],
    paymentAccount,
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 12345,
      description: "Mercado ficticio",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeForecastTransactionId: (invoiceId) => `forecast-${invoiceId}`,
  });

  assertEqual(result.forecastTransactions.length, 1, "purchase should create a payment forecast");
  const [forecast] = result.forecastTransactions;
  assertEqual(forecast?.status, "planned", "forecast should be planned");
  assertEqual(forecast?.accountId, paymentAccount.id, "forecast should target the payment account");
  assertEqual(forecast?.invoiceId, result.invoice.id, "forecast should reference the invoice");
  assertEqual(forecast?.amountMinor, 12345, "forecast should match the invoice total");
  assertEqual(forecast?.plannedOn, result.invoice.dueOn, "forecast should land on the due date");
  assertEqual(forecast?.effectiveOn, undefined, "forecast should not be effective yet");
}

function runUpdatesExistingPaymentForecastTransaction(): void {
  const card = createCardFixtureWithPayment();
  const existingInvoice = createInvoiceFixture(
    card,
    "2026-05-21",
    "2026-06-20",
    "2026-07-10",
    5000,
  );
  const result = registerCardPurchase({
    transactionId: "transaction-forecast-update",
    context: tenantA,
    card,
    existingInvoices: [existingInvoice],
    paymentAccount,
    existingForecastTransactions: [
      {
        id: "forecast-existing",
        invoiceId: existingInvoice.id,
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    now,
    payload: {
      occurredOn: "2026-06-18",
      amountMinor: 2500,
      description: "Farmacia ficticia",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeForecastTransactionId: (invoiceId) => `forecast-${invoiceId}`,
  });

  assertEqual(result.forecastTransactions.length, 1, "purchase should reuse the forecast");
  const [forecast] = result.forecastTransactions;
  assertEqual(forecast?.id, "forecast-existing", "forecast id should be reused");
  assertEqual(forecast?.amountMinor, 7500, "forecast amount should reflect the new invoice total");
  assertEqual(
    forecast?.createdAt,
    "2026-06-01T00:00:00.000Z",
    "forecast createdAt should be preserved",
  );
}

function runSkipsForecastTransactionWithoutPaymentAccount(): void {
  const card = createCardFixture();
  const result = registerCardPurchase({
    transactionId: "transaction-no-forecast",
    context: tenantA,
    card,
    existingInvoices: [],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 5000,
      description: "Compra sem conta de pagamento",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(
    result.forecastTransactions.length,
    0,
    "purchase should not forecast without a payment account",
  );
}

function runVoidsForecastTransactionWhenInvoicePaid(): void {
  const card = createCardFixtureWithPayment();
  const invoice = createInvoiceFixture(card, "2026-05-21", "2026-06-20", "2026-07-10", 12000);
  const result = payInvoice({
    transactionId: "transaction-payment-voids-forecast",
    context: tenantA,
    invoice,
    card,
    paymentAccount,
    existingForecastTransactionId: "forecast-existing",
    now,
    payload: {
      paidOn: "2026-07-10",
      amountMinor: 12000,
    },
  });

  assertEqual(
    result.voidedForecastTransactionId,
    "forecast-existing",
    "payment should void the matching forecast transaction",
  );
}

function runPaysInvoiceFromAccount(): void {
  const card = createCardFixture();
  const invoice = createInvoiceFixture(card, "2026-05-21", "2026-06-20", "2026-07-10", 12000);
  const result = payInvoice({
    transactionId: "transaction-payment",
    context: tenantA,
    invoice,
    card,
    paymentAccount,
    now,
    payload: {
      paidOn: "2026-07-10",
      amountMinor: 12000,
    },
  });

  assertEqual(result.invoice.status, "paid", "payment should mark invoice paid");
  assertEqual(
    result.invoice.paymentTransactionId,
    result.transaction.id,
    "invoice should link payment",
  );
  assertEqual(
    result.transaction.accountId,
    paymentAccount.id,
    "payment should affect source account",
  );
  assertEqual(
    result.transaction.amountMinor,
    invoice.totalAmountMinor,
    "payment amount should match invoice",
  );
}

function runRejectsPartialPaymentInMvp(): void {
  const card = createCardFixture();
  const invoice = createInvoiceFixture(card, "2026-05-21", "2026-06-20", "2026-07-10", 12000);

  assertCardError(
    () =>
      payInvoice({
        transactionId: "transaction-partial-payment",
        context: tenantA,
        invoice,
        card,
        paymentAccount,
        now,
        payload: {
          paidOn: "2026-07-10",
          amountMinor: 6000,
        },
      }),
    "CARD_INVOICE_PAYMENT_AMOUNT_INVALID",
  );
}

function runRejectsBlockedCardPurchase(): void {
  const blockedCard = blockCard(tenantA, createCardFixture(), now).card;

  assertCardError(
    () =>
      registerCardPurchase({
        transactionId: "transaction-blocked",
        context: tenantA,
        card: blockedCard,
        existingInvoices: [],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 1000,
          description: "Compra bloqueada ficticia",
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_NOT_ACTIVE",
  );
}

function runTenantIsolation(): void {
  const card = createCardFixture();

  assertEqual(listCards(tenantB, [card]).length, 0, "other tenant list should be empty");
  assertTenantError(() => blockCard(tenantB, card, now));
}

function createCardFixture(): Card {
  return createCard({
    id: "card-fixture",
    context: tenantA,
    now,
    payload: {
      name: "Cartao fixture",
      closingDay: 20,
      dueDay: 10,
      maskedIdentifier: "**** 1111",
    },
  }).card;
}

function createCardFixtureWithPayment(): Card {
  return createCard({
    id: "card-fixture-payment",
    context: tenantA,
    now,
    paymentAccount,
    payload: {
      name: "Cartao fixture",
      closingDay: 20,
      dueDay: 10,
      maskedIdentifier: "**** 1111",
      paymentAccountId: paymentAccount.id,
    },
  }).card;
}

function createAccountFixture(
  context: TenantContext,
  id: string,
  status: Account["status"],
): Account {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Conta ${id}`,
    kind: "checking",
    status,
    currency: "BRL",
    openingBalanceMinor: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createInvoiceFixture(
  card: Card,
  periodStartOn: string,
  periodEndOn: string,
  dueOn: string,
  totalAmountMinor: number,
): Invoice {
  return {
    id: `invoice-${periodEndOn}`,
    organizationId: card.organizationId,
    financialProfileId: card.financialProfileId,
    cardId: card.id,
    status: "open",
    periodStartOn,
    periodEndOn,
    dueOn,
    totalAmountMinor,
    currency: "BRL",
    createdAt: now,
    updatedAt: now,
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
