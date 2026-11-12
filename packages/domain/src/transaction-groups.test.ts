import test from "node:test";
import assert from "node:assert/strict";

import { validateTransactionGroupMembers, TransactionGroupError } from "./transaction-groups.js";
import type { TenantContext, Transaction } from "./index.js";

const context: TenantContext = {
  userId: "user",
  organizationId: "org",
  financialProfileId: "profile",
  financialProfileKind: "personal",
};
const base: Transaction = {
  id: "one",
  organizationId: "org",
  financialProfileId: "profile",
  accountId: "account",
  kind: "expense",
  status: "posted",
  source: "manual",
  amountMinor: 101,
  currency: "BRL",
  occurredOn: "2026-07-01",
  plannedOn: "2026-07-01",
  effectiveOn: "2026-07-01",
  description: "Item",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

test("validates compatible members and sums amountMinor exactly", () => {
  const result = validateTransactionGroupMembers(context, [
    base,
    { ...base, id: "two", amountMinor: 202 },
  ]);
  assert.equal(result.totalAmountMinor, 303);
  assert.equal(result.accountId, "account");
});

for (const [name, change, code] of [
  ["transfer", { kind: "transfer" }, "TRANSACTION_GROUP_MEMBER_INELIGIBLE"],
  ["suggested", { status: "suggested" }, "TRANSACTION_GROUP_MEMBER_INELIGIBLE"],
  ["voided", { status: "voided" }, "TRANSACTION_GROUP_MEMBER_INELIGIBLE"],
  ["another group", { transactionGroupId: "group" }, "TRANSACTION_ALREADY_GROUPED"],
  ["different account", { accountId: "other" }, "TRANSACTION_GROUP_INCOMPATIBLE"],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () =>
        validateTransactionGroupMembers(context, [
          base,
          { ...base, id: "two", ...change } as Transaction,
        ]),
      (error: unknown) => error instanceof TransactionGroupError && error.code === code,
    );
  });
}

test("does not disclose a member from another tenant", () => {
  assert.throws(
    () =>
      validateTransactionGroupMembers(context, [
        base,
        { ...base, id: "two", organizationId: "other" },
      ]),
    (error: unknown) =>
      error instanceof TransactionGroupError &&
      error.code === "TENANT_RESOURCE_NOT_FOUND" &&
      error.statusCode === 404,
  );
});
