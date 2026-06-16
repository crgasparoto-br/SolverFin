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
runRejectsUnsafeCardIdentifier();
runCalculatesInvoicePeriodAroundClosingDay();
runRegistersPurchaseAndCreatesInvoice();
runUpdatesExistingOpenInvoice();
runRegistersInstallmentPurchase();
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
