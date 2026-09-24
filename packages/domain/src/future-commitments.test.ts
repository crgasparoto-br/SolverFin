import assert from "node:assert/strict";

import type { Card, Installment, Invoice, Recurrence, Transaction } from "./index.js";
import type { PayableReceivable } from "./payables-receivables.js";
import type { TenantContext } from "./tenant.js";
import { buildFutureCommitmentAgenda, FutureCommitmentError } from "./future-commitments.js";

const NOW = "2037-10-01T12:00:00.000Z";
const CONTEXT: TenantContext = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
  userId: "user-a",
};
const OTHER_CONTEXT: TenantContext = {
  organizationId: "org-b",
  financialProfileId: "profile-b",
  financialProfileKind: "business",
  userId: "user-b",
};

preservesLegitimateEqualCommitments();
keepsCrossCurrencyTransferAsSingleLogicalCommitment();
filtersCrossCurrencyEffectsWithoutChangingIdentity();
replacesRecurrenceProjectionWhenOccurrenceMaterializes();
keepsInvoiceAsCardCashCommitment();
keepsInvoiceAheadOfEquivalentLegacyPayable();
keepsDistinctLegacyPayableWhenInvoiceAccountDiffers();
usesLegacyPayableOnlyAsFallback();
updatesAndVoidsCrossCurrencyCommitmentAtomically();
rejectsIncompleteCrossCurrencyLeg();
isolatesTenantAndProfile();

function preservesLegitimateEqualCommitments(): void {
  const left = transaction("transaction-left", "expense", 12_000, "2037-10-10");
  const right = transaction("transaction-right", "expense", 12_000, "2037-10-10");

  const agenda = build([left, right]);

  assert.deepEqual(
    agenda.commitments.map((commitment) => commitment.id),
    ["transaction:transaction-left", "transaction:transaction-right"],
  );
}

function keepsCrossCurrencyTransferAsSingleLogicalCommitment(): void {
  const transfer = crossCurrencyTransfer("transfer-brl-usd", "2037-10-12", 53_832, 10_000);
  const agenda = build([transfer]);
  const [commitment] = agenda.commitments;

  assert.ok(commitment);
  assert.equal(commitment.id, "transaction:transfer-brl-usd");
  assert.equal(commitment.monetaryEffects.length, 2);
  assert.deepEqual(
    commitment.monetaryEffects.map((effect) => ({
      amountMinor: effect.amountMinor,
      currency: effect.currency,
      accountId: effect.accountId,
    })),
    [
      { amountMinor: -53_832, currency: "BRL", accountId: "account-brl" },
      { amountMinor: 10_000, currency: "USD", accountId: "account-usd" },
    ],
  );
}

function filtersCrossCurrencyEffectsWithoutChangingIdentity(): void {
  const transfer = crossCurrencyTransfer("transfer-filter", "2037-10-12", 53_832, 10_000);
  const brl = build([transfer], { currency: "brl" });
  const usd = build([transfer], { currency: "USD" });

  assert.equal(brl.commitments[0]?.id, "transaction:transfer-filter");
  assert.deepEqual(
    brl.commitments[0]?.monetaryEffects.map((effect) => effect.currency),
    ["BRL"],
  );
  assert.equal(usd.commitments[0]?.id, "transaction:transfer-filter");
  assert.deepEqual(
    usd.commitments[0]?.monetaryEffects.map((effect) => effect.currency),
    ["USD"],
  );
}

function replacesRecurrenceProjectionWhenOccurrenceMaterializes(): void {
  const recurrence = recurrenceFixture("recurrence-rent", "2037-10-15");
  const projected = build([], { recurrences: [recurrence] });

  assert.deepEqual(
    projected.commitments.map((item) => item.id),
    ["recurrence:recurrence-rent:2037-10-15"],
  );

  const materialized = {
    ...transaction("rent-october", "expense", 20_000, "2037-10-15"),
    source: "recurrence",
    recurrenceId: recurrence.id,
    installmentId: "installment-rent-october",
  } satisfies Transaction;
  const installment = installmentFixture("installment-rent-october", recurrence.id, "2037-10-15");
  const agenda = build([materialized], {
    recurrences: [recurrence],
    installments: [installment],
  });

  assert.deepEqual(
    agenda.commitments.map((item) => item.id),
    ["transaction:rent-october"],
  );
  assert.equal(agenda.commitments[0]?.replacementKey, "recurrence:recurrence-rent:2037-10-15");
}

function keepsInvoiceAsCardCashCommitment(): void {
  const card = cardFixture("card-main");
  const invoice = invoiceFixture("invoice-october", card.id, 45_000, "2037-10-20");
  const purchase = {
    ...transaction("purchase-under-invoice", "expense", 45_000, "2037-10-05"),
    cardId: card.id,
    invoiceId: invoice.id,
  } satisfies Transaction;

  const agenda = build([purchase], { cards: [card], invoices: [invoice] });

  assert.deepEqual(
    agenda.commitments.map((item) => item.id),
    ["invoice:invoice-october"],
  );
  assert.deepEqual(agenda.commitments[0]?.monetaryEffects, [
    {
      id: "invoice:invoice-october:payment",
      role: "invoice_payment",
      amountMinor: -45_000,
      currency: "BRL",
      cardId: "card-main",
      accountId: "account-brl",
    },
  ]);
}

function keepsInvoiceAheadOfEquivalentLegacyPayable(): void {
  const card = cardFixture("card-legacy-duplicate");
  const invoice = invoiceFixture("invoice-legacy-duplicate", card.id, 25_000, "2037-10-18");
  const legacy = payableFixture("legacy-invoice-duplicate", "payable", 25_000, "2037-10-18");

  const agenda = build([], {
    cards: [card],
    invoices: [invoice],
    payablesReceivables: [legacy],
  });

  assert.deepEqual(
    agenda.commitments.map((item) => item.id),
    ["invoice:invoice-legacy-duplicate"],
  );
}

function keepsDistinctLegacyPayableWhenInvoiceAccountDiffers(): void {
  const card = cardFixture("card-distinct-legacy");
  const invoice = invoiceFixture("invoice-distinct-legacy", card.id, 25_000, "2037-10-18");
  const legacy = {
    ...payableFixture("legacy-distinct-account", "payable", 25_000, "2037-10-18"),
    accountId: "account-other",
  } satisfies PayableReceivable;

  const agenda = build([], {
    cards: [card],
    invoices: [invoice],
    payablesReceivables: [legacy],
  });

  assert.deepEqual(
    agenda.commitments.map((item) => item.id),
    ["invoice:invoice-distinct-legacy", "payable-receivable:legacy-distinct-account"],
  );
}

function usesLegacyPayableOnlyAsFallback(): void {
  const equivalent = transaction("energy-transaction", "expense", 25_000, "2037-10-18");
  const duplicate = payableFixture("legacy-energy", "payable", 25_000, "2037-10-18");
  const fallback = {
    ...payableFixture("legacy-water", "payable", 9_000, "2037-10-18"),
    description: "Water",
  } satisfies PayableReceivable;

  const agenda = build([equivalent], { payablesReceivables: [duplicate, fallback] });

  assert.deepEqual(
    agenda.commitments.map((item) => item.id),
    ["payable-receivable:legacy-water", "transaction:energy-transaction"],
  );
}

function updatesAndVoidsCrossCurrencyCommitmentAtomically(): void {
  const original = crossCurrencyTransfer("transfer-lifecycle", "2037-10-22", 53_832, 10_000);
  const edited = {
    ...original,
    amountMinor: 60_000,
    destinationAmountMinor: 12_000,
    plannedOn: "2037-10-23",
    updatedAt: "2037-10-02T12:00:00.000Z",
  } satisfies Transaction;
  const editedAgenda = build([edited]);
  const [editedCommitment] = editedAgenda.commitments;

  assert.equal(editedCommitment?.plannedOn, "2037-10-23");
  assert.deepEqual(
    editedCommitment?.monetaryEffects.map((effect) => effect.amountMinor),
    [-60_000, 12_000],
  );

  const voided = {
    ...edited,
    status: "voided",
    voidedAt: "2037-10-03T12:00:00.000Z",
  } satisfies Transaction;
  assert.deepEqual(build([voided]).commitments, []);
}

function rejectsIncompleteCrossCurrencyLeg(): void {
  const incomplete = {
    ...transaction("transfer-incomplete", "transfer", 53_832, "2037-10-24"),
    destinationAccountId: "account-usd",
    destinationCurrency: "USD",
  } satisfies Transaction;

  assert.throws(
    () => build([incomplete]),
    (error: unknown) =>
      error instanceof FutureCommitmentError &&
      error.code === "FUTURE_COMMITMENT_TRANSFER_INCOMPLETE",
  );
}

function isolatesTenantAndProfile(): void {
  const own = transaction("own", "income", 5_000, "2037-10-25");
  const foreign = {
    ...transaction("foreign", "income", 99_000, "2037-10-25"),
    organizationId: OTHER_CONTEXT.organizationId,
    financialProfileId: OTHER_CONTEXT.financialProfileId,
  } satisfies Transaction;

  assert.deepEqual(
    build([own, foreign]).commitments.map((item) => item.id),
    ["transaction:own"],
  );
}

function build(
  transactions: readonly Transaction[],
  extras: {
    currency?: string;
    invoices?: readonly Invoice[];
    cards?: readonly Card[];
    recurrences?: readonly Recurrence[];
    installments?: readonly Installment[];
    payablesReceivables?: readonly PayableReceivable[];
  } = {},
) {
  return buildFutureCommitmentAgenda({
    context: CONTEXT,
    from: "2037-10-01",
    to: "2037-10-31",
    transactions,
    ...(extras.currency ? { currency: extras.currency } : {}),
    ...(extras.invoices ? { invoices: extras.invoices } : {}),
    ...(extras.cards ? { cards: extras.cards } : {}),
    ...(extras.recurrences ? { recurrences: extras.recurrences } : {}),
    ...(extras.installments ? { installments: extras.installments } : {}),
    ...(extras.payablesReceivables ? { payablesReceivables: extras.payablesReceivables } : {}),
  });
}

function transaction(
  id: string,
  kind: Transaction["kind"],
  amountMinor: number,
  plannedOn: string,
): Transaction {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    financialProfileId: CONTEXT.financialProfileId,
    kind,
    status: "planned",
    source: "manual",
    amountMinor,
    currency: "BRL",
    occurredOn: plannedOn,
    plannedOn,
    description: id,
    accountId: "account-brl",
    categoryId: "category-main",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function crossCurrencyTransfer(
  id: string,
  plannedOn: string,
  amountMinor: number,
  destinationAmountMinor: number,
): Transaction {
  return {
    ...transaction(id, "transfer", amountMinor, plannedOn),
    destinationAccountId: "account-usd",
    destinationAmountMinor,
    destinationCurrency: "USD",
  };
}

function recurrenceFixture(id: string, startOn: string): Recurrence {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    financialProfileId: CONTEXT.financialProfileId,
    status: "active",
    kind: "expense",
    frequency: "monthly",
    interval: 1,
    startOn,
    amountMinor: 20_000,
    currency: "BRL",
    description: "Rent",
    accountId: "account-brl",
    categoryId: "category-main",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function installmentFixture(id: string, recurrenceId: string, dueOn: string): Installment {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    financialProfileId: CONTEXT.financialProfileId,
    recurrenceId,
    status: "planned",
    sequenceNumber: 1,
    totalInstallments: 1,
    dueOn,
    amountMinor: 20_000,
    currency: "BRL",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function cardFixture(id: string): Card {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    financialProfileId: CONTEXT.financialProfileId,
    name: "Card",
    status: "active",
    closingDay: 10,
    dueDay: 20,
    currency: "BRL",
    paymentAccountId: "account-brl",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function invoiceFixture(
  id: string,
  cardId: string,
  totalAmountMinor: number,
  dueOn: string,
): Invoice {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    financialProfileId: CONTEXT.financialProfileId,
    cardId,
    status: "open",
    periodStartOn: "2037-09-11",
    periodEndOn: "2037-10-10",
    dueOn,
    totalAmountMinor,
    currency: "BRL",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function payableFixture(
  id: string,
  kind: PayableReceivable["kind"],
  amountMinor: number,
  dueOn: string,
): PayableReceivable {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    financialProfileId: CONTEXT.financialProfileId,
    kind,
    status: "pending",
    amountMinor,
    currency: "BRL",
    dueOn,
    description: id,
    accountId: "account-brl",
    categoryId: "category-main",
    createdAt: NOW,
    updatedAt: NOW,
  };
}
