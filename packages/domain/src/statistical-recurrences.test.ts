import assert from "node:assert/strict";

import type { Recurrence, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  detectRecurringExpenses,
  updateInferredRecurrenceDecision,
} from "./statistical-recurrences.js";

const now = "2026-06-16T12:00:00.000Z";
const tenantA: TenantContext = {
  userId: "user-a",
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
};
const tenantB: TenantContext = {
  userId: "user-b",
  organizationId: "org-b",
  financialProfileId: "profile-b",
  financialProfileKind: "personal",
};

findsClearMonthlyRecurrence();
ignoresFalsePositiveAndInsufficientHistory();
doesNotDuplicateRegisteredRecurrence();
updatesUserDecision();
tenantIsolationIsApplied();

function findsClearMonthlyRecurrence(): void {
  const transactions = [
    expense("t1", "2026-03-05", 11990, "Streaming Plus"),
    expense("t2", "2026-04-05", 11990, "Streaming Plus"),
    expense("t3", "2026-05-05", 11990, "Streaming Plus"),
    expense("t4", "2026-06-05", 11990, "Streaming Plus"),
  ];

  const [recurrence] = detectRecurringExpenses({ context: tenantA, transactions, now });

  assert.equal(recurrence?.frequency, "monthly");
  assert.equal(recurrence?.averageAmountMinor, 11990);
  assert.equal(recurrence?.occurrenceCount, 4);
  assert.equal(recurrence?.nextExpectedOn, "2026-07-05");
  assert.equal((recurrence?.confidence ?? 0) >= 0.75, true);
}

function ignoresFalsePositiveAndInsufficientHistory(): void {
  const falsePositive = [
    expense("fp1", "2026-03-01", 1000, "Mercado"),
    expense("fp2", "2026-03-19", 2500, "Mercado"),
    expense("fp3", "2026-05-02", 9300, "Mercado"),
  ];
  const insufficient = [
    expense("i1", "2026-05-10", 4000, "Academia"),
    expense("i2", "2026-06-10", 4000, "Academia"),
  ];

  assert.equal(
    detectRecurringExpenses({ context: tenantA, transactions: falsePositive, now }).length,
    0,
  );
  assert.equal(
    detectRecurringExpenses({ context: tenantA, transactions: insufficient, now }).length,
    0,
  );
}

function doesNotDuplicateRegisteredRecurrence(): void {
  const transactions = [
    expense("t1", "2026-04-10", 5000, "Software", "cat-soft", "account-a"),
    expense("t2", "2026-05-10", 5000, "Software", "cat-soft", "account-a"),
    expense("t3", "2026-06-10", 5000, "Software", "cat-soft", "account-a"),
  ];
  const registered: Recurrence = {
    id: "recurrence-software",
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    status: "active",
    frequency: "monthly",
    interval: 1,
    startOn: "2026-04-10",
    amountMinor: 5000,
    currency: "BRL",
    description: "Software",
    accountId: "account-a",
    categoryId: "cat-soft",
    createdAt: now,
    updatedAt: now,
  };

  assert.equal(
    detectRecurringExpenses({
      context: tenantA,
      transactions,
      registeredRecurrences: [registered],
      now,
    }).length,
    0,
  );
}

function updatesUserDecision(): void {
  const [recurrence] = detectRecurringExpenses({
    context: tenantA,
    transactions: [
      expense("g1", "2026-04-01", 3000, "Clube"),
      expense("g2", "2026-05-01", 3000, "Clube"),
      expense("g3", "2026-06-01", 3000, "Clube"),
    ],
    now,
  });

  const adjusted = updateInferredRecurrenceDecision({
    context: tenantA,
    recurrence,
    now: "2026-06-16T13:00:00.000Z",
    decision: "adjusted",
    adjustedAmountMinor: 3500,
  });
  const ignored = updateInferredRecurrenceDecision({
    context: tenantA,
    recurrence: adjusted,
    now: "2026-06-16T14:00:00.000Z",
    decision: "ignored",
  });

  assert.equal(adjusted.averageAmountMinor, 3500);
  assert.equal(ignored.status, "ignored");
  assert.equal(ignored.ignoredAt, "2026-06-16T14:00:00.000Z");
}

function tenantIsolationIsApplied(): void {
  const transactions = [
    expense("t1", "2026-04-05", 9000, "Curso"),
    expense("t2", "2026-05-05", 9000, "Curso"),
    expense("t3", "2026-06-05", 9000, "Curso"),
    {
      ...expense("other", "2026-04-05", 9000, "Curso"),
      organizationId: tenantB.organizationId,
      financialProfileId: tenantB.financialProfileId,
    },
  ];

  const inferred = detectRecurringExpenses({ context: tenantA, transactions, now });

  assert.equal(inferred.length, 1);
  assert.equal(inferred[0]?.organizationId, tenantA.organizationId);
}

function expense(
  id: string,
  occurredOn: string,
  amountMinor: number,
  description: string,
  categoryId = "cat-a",
  accountId = "account-a",
): Transaction {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    kind: "expense",
    status: "posted",
    source: "manual",
    amountMinor,
    currency: "BRL",
    occurredOn,
    plannedOn: occurredOn,
    description,
    accountId,
    categoryId,
    createdAt: now,
    updatedAt: now,
  };
}
