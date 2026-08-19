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
rejectsTransferAcrossDifferentAccountCurrencies();
rejectsUpdateThatChangesOnlyTransactionCurrency();
allowsCoherentAccountAndCurrencyChange();

function rejectsCreateWhenTransactionCurrencyDiffersFromSourceAccount(): void {
  const brlAccount = account("account-brl-create", "BRL");

  assertCurrencyMismatch(() =>
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

function rejectsTransferAcrossDifferentAccountCurrencies(): void {
  const brlAccount = account("account-brl-transfer", "BRL");
  const usdAccount = account("account-usd-transfer", "USD");

  assertCurrencyMismatch(() =>
    createTransaction({
      id: "transaction-mismatch-transfer",
      context,
      now,
      account: brlAccount,
      destinationAccount: usdAccount,
      payload: {
        kind: "transfer",
        amountMinor: 2_000,
        currency: "BRL",
        occurredOn: "2026-08-19",
        accountId: brlAccount.id,
        destinationAccountId: usdAccount.id,
      },
    }),
  );
}

function rejectsUpdateThatChangesOnlyTransactionCurrency(): void {
  const brlAccount = account("account-brl-update", "BRL");
  const current = transaction("transaction-brl-update", brlAccount.id, "BRL");

  assertCurrencyMismatch(() =>
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

function assertCurrencyMismatch(action: () => unknown): void {
  assert.throws(
    action,
    (error: unknown) =>
      error instanceof TransactionError && error.code === "TRANSACTION_CURRENCY_MISMATCH",
  );
}
