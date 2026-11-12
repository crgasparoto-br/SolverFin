import assert from "node:assert/strict";

import type { Account } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { AccountError, updateAccount } from "./accounts.js";

const context: TenantContext = {
  organizationId: "org-account-currency-invariant",
  financialProfileId: "profile-account-currency-invariant",
  financialProfileKind: "personal",
  userId: "user-account-currency-invariant",
};
const now = "2026-08-19T14:00:00.000Z";

keepsSameCurrencyWhenTransactionsExist();
rejectsCurrencyChangeWhenTransactionsExist();
validatesCurrencyBeforeLockingChange();
allowsCurrencyChangeBeforeTransactionsExist();

function keepsSameCurrencyWhenTransactionsExist(): void {
  const current = account("account-same-currency", "BRL");
  const updated = updateAccount({
    context,
    account: current,
    now,
    hasTransactions: true,
    payload: { currency: "brl" },
  });

  assert.equal(updated.currency, "BRL");
}

function rejectsCurrencyChangeWhenTransactionsExist(): void {
  const current = account("account-locked-currency", "BRL");

  assertAccountError(
    () =>
      updateAccount({
        context,
        account: current,
        now,
        hasTransactions: true,
        payload: { currency: "USD" },
      }),
    "ACCOUNT_CURRENCY_LOCKED",
  );
}

function validatesCurrencyBeforeLockingChange(): void {
  const current = account("account-invalid-currency", "BRL");

  assertAccountError(
    () =>
      updateAccount({
        context,
        account: current,
        now,
        hasTransactions: true,
        payload: { currency: "REAL" },
      }),
    "ACCOUNT_CURRENCY_INVALID",
  );
}

function allowsCurrencyChangeBeforeTransactionsExist(): void {
  const current = account("account-change-before-use", "BRL");
  const updated = updateAccount({
    context,
    account: current,
    now,
    hasTransactions: false,
    payload: { currency: "usd" },
  });

  assert.equal(updated.currency, "USD");
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

function assertAccountError(action: () => unknown, expectedCode: AccountError["code"]): void {
  assert.throws(
    action,
    (error: unknown) => error instanceof AccountError && error.code === expectedCode,
  );
}
