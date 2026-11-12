import assert from "node:assert/strict";

import type { Account } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { createTransaction, updateTransaction } from "./transactions.js";

const context: TenantContext = {
  userId: "user-temporal-void",
  organizationId: "org-temporal-void",
  financialProfileId: "profile-temporal-void",
  financialProfileKind: "personal",
};
const account: Account = {
  id: "account-temporal-void",
  organizationId: context.organizationId,
  financialProfileId: context.financialProfileId,
  name: "Conta temporal void",
  kind: "checking",
  status: "active",
  currency: "BRL",
  openingBalanceMinor: 0,
  createdAt: "2035-01-01T00:00:00.000Z",
  updatedAt: "2035-01-01T00:00:00.000Z",
  createdByUserId: context.userId,
  updatedByUserId: context.userId,
};

const planned = createTransaction({
  id: "transaction-planned-to-void",
  context,
  account,
  now: "2035-01-05T12:00:00.000Z",
  payload: {
    kind: "expense",
    status: "planned",
    amountMinor: 1000,
    occurredOn: "2035-01-05",
    plannedOn: "2035-02-10",
    accountId: account.id,
  },
});
const voidedPlanned = updateTransaction({
  context,
  account,
  transaction: planned.transaction,
  now: "2035-02-01T10:30:00.000Z",
  payload: { status: "voided", effectiveOn: "2035-02-01" },
});
assert.equal(voidedPlanned.transaction.status, "voided");
assert.equal(voidedPlanned.transaction.occurredOn, "2035-01-05");
assert.equal(voidedPlanned.transaction.plannedOn, "2035-02-10");
assert.equal(
  voidedPlanned.transaction.effectiveOn,
  undefined,
  "voiding a never-effective planned commitment must not fabricate cash effect",
);
assert.equal(voidedPlanned.movements.length, 0);

const suggested = createTransaction({
  id: "transaction-suggested-to-void",
  context,
  account,
  now: "2035-01-06T12:00:00.000Z",
  payload: {
    kind: "income",
    status: "suggested",
    amountMinor: 2000,
    occurredOn: "2035-01-06",
    plannedOn: "2035-02-11",
    accountId: account.id,
  },
});
const voidedSuggested = updateTransaction({
  context,
  account,
  transaction: suggested.transaction,
  now: "2035-02-02T10:30:00.000Z",
  payload: { status: "voided" },
});
assert.equal(
  voidedSuggested.transaction.effectiveOn,
  undefined,
  "voiding a suggested transaction must not create effectiveOn",
);

const posted = createTransaction({
  id: "transaction-posted-to-void",
  context,
  account,
  now: "2035-01-07T12:00:00.000Z",
  payload: {
    kind: "expense",
    status: "posted",
    amountMinor: 3000,
    occurredOn: "2035-01-07",
    plannedOn: "2035-02-12",
    effectiveOn: "2035-01-20",
    accountId: account.id,
  },
});
const voidedPosted = updateTransaction({
  context,
  account,
  transaction: posted.transaction,
  now: "2035-02-03T10:30:00.000Z",
  payload: { status: "voided" },
});
assert.equal(
  voidedPosted.transaction.effectiveOn,
  "2035-01-20",
  "voiding a realized transaction must preserve its historical cash-effect date",
);
assert.equal(voidedPosted.movements.length, 0);

const directVoided = createTransaction({
  id: "transaction-created-voided",
  context,
  account,
  now: "2035-01-08T12:00:00.000Z",
  payload: {
    kind: "expense",
    status: "voided",
    amountMinor: 4000,
    occurredOn: "2035-01-08",
    plannedOn: "2035-02-13",
    accountId: account.id,
  },
});
assert.equal(
  directVoided.transaction.effectiveOn,
  undefined,
  "creating a voided record without explicit cash history must not derive effectiveOn from occurredOn",
);
assert.equal(directVoided.movements.length, 0);

const reactivated = updateTransaction({
  context,
  account,
  transaction: directVoided.transaction,
  now: "2035-02-14T23:30:00.000Z",
  payload: { status: "posted" },
});
assert.equal(
  reactivated.transaction.effectiveOn,
  "2035-02-14",
  "reactivating a never-effective voided record must use the transition date, not occurredOn",
);
