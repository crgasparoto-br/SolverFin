import assert from "node:assert/strict";

import type { Account, Card } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { payInvoice, registerCardPurchase } from "./cards.js";
import { createTransaction, updateTransaction } from "./transactions.js";

const context: TenantContext = {
  organizationId: "org-temporal-saturation",
  financialProfileId: "profile-temporal-saturation",
  financialProfileKind: "personal",
  userId: "user-temporal-saturation",
};

const account: Account = {
  id: "account-temporal-saturation",
  organizationId: context.organizationId,
  financialProfileId: context.financialProfileId,
  name: "Conta temporal",
  kind: "checking",
  status: "active",
  currency: "BRL",
  openingBalanceMinor: 0,
  createdAt: "2034-01-01T00:00:00.000Z",
  updatedAt: "2034-01-01T00:00:00.000Z",
};

const card: Card = {
  id: "card-temporal-saturation",
  organizationId: context.organizationId,
  financialProfileId: context.financialProfileId,
  paymentAccountId: account.id,
  name: "Cartao temporal",
  status: "active",
  closingDay: 20,
  dueDay: 10,
  createdAt: "2034-01-01T00:00:00.000Z",
  updatedAt: "2034-01-01T00:00:00.000Z",
};

runCardPurchaseAndSettlementUseDifferentTemporalDestinations();
runFutureCommitmentPromotesInPlace();
runUtcCivilDateIsDeterministicAcrossMidnight();

function runCardPurchaseAndSettlementUseDifferentTemporalDestinations(): void {
  const purchase = registerCardPurchase({
    transactionId: "transaction-card-purchase-temporal",
    context,
    card,
    existingInvoices: [],
    paymentAccount: account,
    existingForecastTransactions: [],
    now: "2034-06-05T12:00:00.000Z",
    payload: {
      occurredOn: "2034-06-05",
      amountMinor: 12500,
      description: "Compra temporal",
    },
    makeInvoiceId: () => "invoice-card-temporal",
    makeForecastTransactionId: () => "forecast-card-temporal",
  });

  assert.equal(purchase.transaction.occurredOn, "2034-06-05");
  assert.equal(purchase.transaction.effectiveOn, undefined);
  assert.equal(purchase.forecastTransactions.length, 1);
  const forecast = purchase.forecastTransactions[0];
  assert.ok(forecast);
  assert.equal(forecast.status, "planned");
  assert.equal(forecast.plannedOn, purchase.invoice.dueOn);
  assert.equal(forecast.effectiveOn, undefined);

  const payment = payInvoice({
    transactionId: "transaction-card-payment-temporal",
    context,
    invoice: purchase.invoice,
    card,
    paymentAccount: account,
    existingForecastTransactionId: forecast.id,
    now: "2034-07-12T23:30:00.000Z",
    payload: {
      paidOn: "2034-07-12",
      amountMinor: purchase.invoice.totalAmountMinor,
    },
  });

  assert.equal(payment.transaction.occurredOn, "2034-07-12");
  assert.equal(payment.transaction.plannedOn, "2034-07-12");
  assert.equal(
    payment.transaction.effectiveOn,
    "2034-07-12",
    "invoice settlement must record the bank-account cash-effect date",
  );
  assert.equal(
    payment.voidedForecastTransactionId,
    forecast.id,
    "settlement must retire the future payment commitment instead of leaving future and realized copies active",
  );
  assert.equal(
    purchase.transaction.occurredOn,
    "2034-06-05",
    "settling the invoice must not rewrite the purchase economic period",
  );
}

function runFutureCommitmentPromotesInPlace(): void {
  const planned = createTransaction({
    id: "transaction-future-promotion",
    context,
    account,
    now: "2034-08-01T12:00:00.000Z",
    payload: {
      kind: "expense",
      status: "planned",
      source: "manual",
      amountMinor: 5000,
      currency: "BRL",
      occurredOn: "2034-07-20",
      plannedOn: "2034-09-10",
      accountId: account.id,
      description: "Compromisso futuro",
    },
  });

  const posted = updateTransaction({
    context,
    transaction: planned.transaction,
    account,
    now: "2034-09-12T10:15:00.000Z",
    payload: { status: "posted" },
  });

  assert.equal(posted.transaction.id, planned.transaction.id);
  assert.equal(posted.transaction.occurredOn, "2034-07-20");
  assert.equal(posted.transaction.plannedOn, "2034-09-10");
  assert.equal(posted.transaction.effectiveOn, "2034-09-12");
}

function runUtcCivilDateIsDeterministicAcrossMidnight(): void {
  const beforeMidnight = createPlanned("transaction-before-midnight");
  const afterMidnight = createPlanned("transaction-after-midnight");

  const before = updateTransaction({
    context,
    transaction: beforeMidnight,
    account,
    now: "2034-12-31T23:30:00.000Z",
    payload: { status: "posted" },
  });
  const after = updateTransaction({
    context,
    transaction: afterMidnight,
    account,
    now: "2035-01-01T00:30:00.000Z",
    payload: { status: "posted" },
  });

  assert.equal(before.transaction.effectiveOn, "2034-12-31");
  assert.equal(after.transaction.effectiveOn, "2035-01-01");
  assert.equal(before.transaction.occurredOn, "2030-01-15");
  assert.equal(before.transaction.plannedOn, "2040-01-15");
  assert.equal(after.transaction.occurredOn, "2030-01-15");
  assert.equal(after.transaction.plannedOn, "2040-01-15");
}

function createPlanned(id: string) {
  return createTransaction({
    id,
    context,
    account,
    now: "2034-12-01T12:00:00.000Z",
    payload: {
      kind: "income",
      status: "planned",
      source: "manual",
      amountMinor: 1000,
      currency: "BRL",
      occurredOn: "2030-01-15",
      plannedOn: "2040-01-15",
      accountId: account.id,
      description: "Controle date-only",
    },
  }).transaction;
}
