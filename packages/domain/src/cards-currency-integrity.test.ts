import type { Account, Card, Invoice } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  CardCurrencyInvariantError,
  createCard,
  payInvoice,
  registerCardPurchase,
} from "./cards.js";

const now = "2026-09-02T15:00:00.000Z";
const context: TenantContext = {
  organizationId: "org-currency",
  financialProfileId: "profile-currency",
  financialProfileKind: "personal",
  userId: "user-currency",
};

runAcceptsMatchingExistingInvoiceCurrency();
runRejectsCrossCurrencyExistingInvoice();
runRejectsCrossCurrencyFutureInstallmentInvoice();
runRejectsCrossCurrencyPaymentAccount();
runSkipsCrossCurrencyPaymentForecast();

function runAcceptsMatchingExistingInvoiceCurrency(): void {
  const card = createCardFixture();
  const invoice = createInvoiceFixture(
    card,
    "2026-05-21",
    "2026-06-20",
    "2026-07-10",
    10_000,
    "USD",
  );
  const result = registerCardPurchase({
    transactionId: "purchase-usd-compatible",
    context,
    card,
    existingInvoices: [invoice],
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 5_000,
      description: "Compatible USD purchase",
      currency: "usd",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
  });

  assertEqual(result.invoice.id, invoice.id, "matching invoice should be reused");
  assertEqual(
    result.invoice.currency,
    "USD",
    "matching invoice should preserve normalized currency",
  );
  assertEqual(
    result.invoice.totalAmountMinor,
    15_000,
    "matching invoice should receive the amount",
  );
}

function runRejectsCrossCurrencyExistingInvoice(): void {
  const card = createCardFixture();
  const invoice = createInvoiceFixture(
    card,
    "2026-05-21",
    "2026-06-20",
    "2026-07-10",
    10_000,
    "BRL",
  );

  assertCurrencyError(
    () =>
      registerCardPurchase({
        transactionId: "purchase-usd-against-brl",
        context,
        card,
        existingInvoices: [invoice],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 5_000,
          description: "Cross currency purchase",
          currency: "USD",
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
      }),
    "CARD_INVOICE_CURRENCY_MISMATCH",
  );

  assertEqual(
    invoice.totalAmountMinor,
    10_000,
    "rejected purchase must not mutate source invoice input",
  );
  assertEqual(
    invoice.currency,
    "BRL",
    "rejected purchase must preserve source invoice currency",
  );
}

function runRejectsCrossCurrencyFutureInstallmentInvoice(): void {
  const card = createCardFixture();
  const current = createInvoiceFixture(
    card,
    "2026-05-21",
    "2026-06-20",
    "2026-07-10",
    10_000,
    "USD",
  );
  const future = createInvoiceFixture(
    card,
    "2026-06-21",
    "2026-07-20",
    "2026-08-10",
    7_000,
    "BRL",
  );

  assertCurrencyError(
    () =>
      registerCardPurchase({
        transactionId: "purchase-installment-cross-currency",
        context,
        card,
        existingInvoices: [current, future],
        now,
        payload: {
          occurredOn: "2026-06-15",
          amountMinor: 6_000,
          description: "Installment crossing currency boundary",
          currency: "USD",
          totalInstallments: 2,
        },
        makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
        makeInstallmentId: (sequenceNumber) => `installment-${sequenceNumber}`,
      }),
    "CARD_INVOICE_CURRENCY_MISMATCH",
  );

  assertEqual(
    current.totalAmountMinor,
    10_000,
    "current invoice input stays unchanged after rejection",
  );
  assertEqual(
    future.totalAmountMinor,
    7_000,
    "future invoice input stays unchanged after rejection",
  );
}

function runRejectsCrossCurrencyPaymentAccount(): void {
  const card = createCardFixture();
  const invoice = createInvoiceFixture(
    card,
    "2026-05-21",
    "2026-06-20",
    "2026-07-10",
    12_000,
    "USD",
  );
  const account = createAccountFixture("payment-brl", "BRL");

  assertCurrencyError(
    () =>
      payInvoice({
        transactionId: "payment-cross-currency",
        context,
        invoice,
        card,
        paymentAccount: account,
        now,
        payload: { paidOn: "2026-07-10", amountMinor: 12_000 },
      }),
    "CARD_INVOICE_PAYMENT_ACCOUNT_CURRENCY_MISMATCH",
  );

  assertEqual(invoice.status, "open", "rejected payment must not mutate invoice input");
}

function runSkipsCrossCurrencyPaymentForecast(): void {
  const account = createAccountFixture("forecast-brl", "BRL");
  const card = createCard({
    id: "card-with-brl-account",
    context,
    now,
    paymentAccount: account,
    payload: {
      name: "Card with BRL account",
      closingDay: 20,
      dueDay: 10,
      paymentAccountId: account.id,
    },
  }).card;
  const result = registerCardPurchase({
    transactionId: "purchase-usd-no-brl-forecast",
    context,
    card,
    existingInvoices: [],
    paymentAccount: account,
    now,
    payload: {
      occurredOn: "2026-06-15",
      amountMinor: 4_000,
      description: "USD purchase with BRL payment account",
      currency: "USD",
    },
    makeInvoiceId: (period) => `invoice-${period.periodEndOn}`,
    makeForecastTransactionId: (invoiceId) => `forecast-${invoiceId}`,
  });

  assertEqual(result.invoice.currency, "USD", "purchase should keep USD invoice currency");
  assertEqual(
    result.forecastTransactions.length,
    0,
    "incompatible account must not receive USD forecast",
  );
}

function createCardFixture(): Card {
  return createCard({
    id: "card-currency",
    context,
    now,
    payload: { name: "Currency card", closingDay: 20, dueDay: 10 },
  }).card;
}

function createInvoiceFixture(
  card: Card,
  periodStartOn: string,
  periodEndOn: string,
  dueOn: string,
  totalAmountMinor: number,
  currency: string,
): Invoice {
  return {
    id: `invoice-${periodEndOn}-${currency}`,
    organizationId: card.organizationId,
    financialProfileId: card.financialProfileId,
    cardId: card.id,
    status: "open",
    periodStartOn,
    periodEndOn,
    dueOn,
    totalAmountMinor,
    currency,
    createdAt: now,
    updatedAt: now,
  };
}

function createAccountFixture(id: string, currency: string): Account {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Account ${id}`,
    kind: "checking",
    status: "active",
    currency,
    openingBalanceMinor: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function assertCurrencyError(
  action: () => unknown,
  expectedCode: CardCurrencyInvariantError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CardCurrencyInvariantError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected currency invariant error ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
