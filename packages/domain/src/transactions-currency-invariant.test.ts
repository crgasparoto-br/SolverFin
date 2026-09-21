import assert from "node:assert/strict";

import type { Account, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { createTransaction, TransactionError, updateTransaction } from "./transactions.js";

const context: TenantContext = {
  organizationId: "org-currency-invariant",
  financialProfileId: "profile-currency-invariant",
  financialProfileKind: "personal",
  userId: "user-currency-invariant",
};
const now = "2026-08-19T12:00:00.000Z";

rejectsCreateWhenTransactionCurrencyDiffersFromSourceAccount();
createsCrossCurrencyTransferWithTwoNativeValues();
createsReverseCrossCurrencyTransfer();
requiresDestinationAmountForCrossCurrencyTransfer();
rejectsNonPositiveDestinationAmount();
keepsSameCurrencyTransfersOneToOne();
preservesDestinationNativeValueWhenOnlySourceAmountChanges();
requiresFreshDestinationAmountWhenDestinationCurrencyChanges();
rejectsUpdateThatChangesOnlyTransactionCurrency();
allowsCoherentAccountAndCurrencyChange();

function rejectsCreateWhenTransactionCurrencyDiffersFromSourceAccount(): void {
  const brlAccount = account("account-brl-create", "BRL");

  assertTransactionError("TRANSACTION_CURRENCY_MISMATCH", () =>
    createTransaction({
      id: "transaction-mismatch-create",
      context,
      now,
      account: brlAccount,
      payload: {
        kind: "expense",
        amountMinor: 1_000,
        currency: "USD",
        occurredOn: "2026-08-19",
        accountId: brlAccount.id,
      },
    }),
  );
}

function createsCrossCurrencyTransferWithTwoNativeValues(): void {
  const brlAccount = account("account-brl-transfer", "BRL");
  const usdAccount = account("account-usd-transfer", "USD");

  const result = createTransaction({
    id: "transaction-cross-currency",
    context,
    now,
    account: brlAccount,
    destinationAccount: usdAccount,
    payload: {
      kind: "transfer",
      amountMinor: 53_832,
      destinationAmountMinor: 10_000,
      currency: "BRL",
      occurredOn: "2026-08-19",
      accountId: brlAccount.id,
      destinationAccountId: usdAccount.id,
    },
  });

  assert.equal(result.transaction.currency, "BRL");
  assert.equal(result.transaction.amountMinor, 53_832);
  assert.equal(result.transaction.destinationCurrency, "USD");
  assert.equal(result.transaction.destinationAmountMinor, 10_000);
  assert.deepEqual(
    result.movements.map((movement) => ({
      accountId: movement.accountId,
      direction: movement.direction,
      amountMinor: movement.amountMinor,
    })),
    [
      { accountId: brlAccount.id, direction: "debit", amountMinor: 53_832 },
      { accountId: usdAccount.id, direction: "credit", amountMinor: 10_000 },
    ],
  );
}

function createsReverseCrossCurrencyTransfer(): void {
  const usdAccount = account("account-usd-reverse", "USD");
  const brlAccount = account("account-brl-reverse", "BRL");

  const result = createTransaction({
    id: "transaction-cross-currency-reverse",
    context,
    now,
    account: usdAccount,
    destinationAccount: brlAccount,
    payload: {
      kind: "transfer",
      amountMinor: 10_000,
      destinationAmountMinor: 53_832,
      currency: "USD",
      occurredOn: "2026-08-19",
      accountId: usdAccount.id,
      destinationAccountId: brlAccount.id,
    },
  });

  assert.equal(result.transaction.currency, "USD");
  assert.equal(result.transaction.amountMinor, 10_000);
  assert.equal(result.transaction.destinationCurrency, "BRL");
  assert.equal(result.transaction.destinationAmountMinor, 53_832);
}

function requiresDestinationAmountForCrossCurrencyTransfer(): void {
  const brlAccount = account("account-brl-required", "BRL");
  const usdAccount = account("account-usd-required", "USD");

  assertTransactionError("TRANSACTION_DESTINATION_AMOUNT_REQUIRED", () =>
    createTransaction({
      id: "transaction-cross-currency-missing-destination",
      context,
      now,
      account: brlAccount,
      destinationAccount: usdAccount,
      payload: {
        kind: "transfer",
        amountMinor: 53_832,
        currency: "BRL",
        occurredOn: "2026-08-19",
        accountId: brlAccount.id,
        destinationAccountId: usdAccount.id,
      },
    }),
  );
}

function rejectsNonPositiveDestinationAmount(): void {
  const source = account("account-brl-invalid-destination", "BRL");
  const destination = account("account-usd-invalid-destination", "USD");

  for (const destinationAmountMinor of [0, -1]) {
    assertTransactionError("TRANSACTION_DESTINATION_AMOUNT_INVALID", () =>
      createTransaction({
        id: `transaction-invalid-destination-${destinationAmountMinor}`,
        context,
        now,
        account: source,
        destinationAccount: destination,
        payload: {
          kind: "transfer",
          amountMinor: 53_832,
          destinationAmountMinor,
          currency: "BRL",
          occurredOn: "2026-08-19",
          accountId: source.id,
          destinationAccountId: destination.id,
        },
      }),
    );
  }
}

function keepsSameCurrencyTransfersOneToOne(): void {
  const source = account("account-brl-source", "BRL");
  const destination = account("account-brl-destination", "BRL");

  const result = createTransaction({
    id: "transaction-same-currency",
    context,
    now,
    account: source,
    destinationAccount: destination,
    payload: {
      kind: "transfer",
      amountMinor: 8_765,
      currency: "BRL",
      occurredOn: "2026-08-19",
      accountId: source.id,
      destinationAccountId: destination.id,
    },
  });

  assert.equal(result.transaction.destinationAmountMinor, 8_765);
  assert.equal(result.transaction.destinationCurrency, "BRL");
}

function preservesDestinationNativeValueWhenOnlySourceAmountChanges(): void {
  const source = account("account-brl-update-transfer", "BRL");
  const destination = account("account-usd-update-transfer", "USD");
  const created = createTransaction({
    id: "transaction-cross-update",
    context,
    now,
    account: source,
    destinationAccount: destination,
    payload: {
      kind: "transfer",
      amountMinor: 53_832,
      destinationAmountMinor: 10_000,
      currency: "BRL",
      occurredOn: "2026-08-19",
      accountId: source.id,
      destinationAccountId: destination.id,
    },
  }).transaction;

  const updated = updateTransaction({
    context,
    transaction: created,
    now: "2026-08-19T13:00:00.000Z",
    account: source,
    destinationAccount: destination,
    payload: { amountMinor: 60_000 },
  });

  assert.equal(updated.transaction.amountMinor, 60_000);
  assert.equal(updated.transaction.destinationAmountMinor, 10_000);
  assert.equal(updated.transaction.destinationCurrency, "USD");
}

function requiresFreshDestinationAmountWhenDestinationCurrencyChanges(): void {
  const source = account("account-brl-destination-change", "BRL");
  const usdDestination = account("account-usd-destination-change", "USD");
  const eurDestination = account("account-eur-destination-change", "EUR");
  const created = createTransaction({
    id: "transaction-destination-change",
    context,
    now,
    account: source,
    destinationAccount: usdDestination,
    payload: {
      kind: "transfer",
      amountMinor: 53_832,
      destinationAmountMinor: 10_000,
      currency: "BRL",
      occurredOn: "2026-08-19",
      accountId: source.id,
      destinationAccountId: usdDestination.id,
    },
  }).transaction;

  assertTransactionError("TRANSACTION_DESTINATION_AMOUNT_REQUIRED", () =>
    updateTransaction({
      context,
      transaction: created,
      now: "2026-08-19T13:00:00.000Z",
      account: source,
      destinationAccount: eurDestination,
      payload: { destinationAccountId: eurDestination.id },
    }),
  );

  const updated = updateTransaction({
    context,
    transaction: created,
    now: "2026-08-19T13:00:00.000Z",
    account: source,
    destinationAccount: eurDestination,
    payload: {
      destinationAccountId: eurDestination.id,
      destinationAmountMinor: 9_250,
    },
  });

  assert.equal(updated.transaction.destinationAccountId, eurDestination.id);
  assert.equal(updated.transaction.destinationCurrency, "EUR");
  assert.equal(updated.transaction.destinationAmountMinor, 9_250);
}

function rejectsUpdateThatChangesOnlyTransactionCurrency(): void {
  const brlAccount = account("account-brl-update", "BRL");
  const current = transaction("transaction-brl-update", brlAccount.id, "BRL");

  assertTransactionError("TRANSACTION_CURRENCY_MISMATCH", () =>
    updateTransaction({
      context,
      transaction: current,
      now: "2026-08-19T13:00:00.000Z",
      account: brlAccount,
      payload: { currency: "USD" },
    }),
  );
}

function allowsCoherentAccountAndCurrencyChange(): void {
  const brlAccount = account("account-brl-move", "BRL");
  const usdAccount = account("account-usd-move", "USD");
  const current = transaction("transaction-account-move", brlAccount.id, "BRL");

  const updated = updateTransaction({
    context,
    transaction: current,
    now: "2026-08-19T14:00:00.000Z",
    account: usdAccount,
    payload: { accountId: usdAccount.id, currency: "usd" },
  });

  assert.equal(updated.transaction.accountId, usdAccount.id);
  assert.equal(updated.transaction.currency, "USD");
}

function account(id: string, currency: string): Account {
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
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function transaction(id: string, accountId: string, currency: string): Transaction {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor: 1_000,
    currency,
    occurredOn: "2026-08-19",
    plannedOn: "2026-08-19",
    effectiveOn: "2026-08-19",
    description: `Transaction ${id}`,
    accountId,
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function assertTransactionError(code: TransactionError["code"], action: () => unknown): void {
  assert.throws(
    action,
    (error: unknown) => error instanceof TransactionError && error.code === code,
  );
}
