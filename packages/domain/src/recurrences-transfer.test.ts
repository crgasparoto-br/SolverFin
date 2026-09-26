import assert from "node:assert/strict";
import test from "node:test";

import type { Account, Category, Recurrence } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  cancelRecurrence,
  createRecurrence,
  generateRecurrenceInstallments,
  listRecurrences,
  pauseRecurrence,
  RecurrenceError,
  resumeRecurrence,
  updateRecurrence,
  type CreateRecurrencePayload,
} from "./recurrences.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";

const now = "2026-09-26T10:00:00.000Z";

const tenant: TenantContext = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  financialProfileKind: "personal",
  userId: "user-a",
};

const otherTenant: TenantContext = {
  organizationId: "org-b",
  financialProfileId: "profile-b",
  financialProfileKind: "personal",
  userId: "user-b",
};

const source = account(tenant, "account-source", "BRL");
const destination = account(tenant, "account-destination", "BRL");
const secondDestination = account(tenant, "account-destination-2", "BRL");
const usdDestination = account(tenant, "account-usd", "USD");
const archivedDestination: Account = {
  ...account(tenant, "account-archived", "BRL"),
  status: "archived",
};
const foreignDestination = account(otherTenant, "account-foreign", "BRL");
const transferCategory: Category = {
  id: "category-transfer",
  organizationId: tenant.organizationId,
  financialProfileId: tenant.financialProfileId,
  name: "Transferencias",
  kind: "transfer",
  status: "active",
  createdAt: now,
  updatedAt: now,
};

test("same-currency transfer recurrence keeps source and destination as distinct fields", () => {
  const { recurrence, auditEntry } = createTransfer();

  assert.equal(recurrence.kind, "transfer");
  assert.equal(recurrence.accountId, source.id);
  assert.equal(recurrence.destinationAccountId, destination.id);
  assert.equal(recurrence.currency, "BRL");
  assert.equal(auditEntry.redactedChanges?.destinationAccountId, "added");
});

test("materialized transfer occurrences preserve both legs, amount and currency without duplicates", () => {
  const { recurrence } = createTransfer();
  const first = generate(recurrence, [], "2026-11-10");

  assert.equal(first.installments.length, 3);
  assert.equal(first.transactions.length, 3);
  for (const transaction of first.transactions) {
    assert.equal(transaction.kind, "transfer", "occurrence must stay a transfer");
    assert.equal(transaction.accountId, source.id);
    assert.equal(transaction.destinationAccountId, destination.id);
    assert.equal(transaction.amountMinor, 25_000);
    assert.equal(transaction.currency, "BRL");
    assert.equal(transaction.destinationAmountMinor, 25_000);
    assert.equal(transaction.destinationCurrency, "BRL");
    assert.equal(
      transaction.transferGroupId,
      transaction.id,
      "one logical identity per occurrence",
    );
    assert.equal(transaction.source, "recurrence");
  }

  const replay = generate(recurrence, first.installments, "2026-11-10");
  assert.equal(replay.transactions.length, 0, "replaying the same window must not duplicate");

  const next = generate(recurrence, first.installments, "2026-12-10");
  assert.equal(next.transactions.length, 1, "only the new due date is materialized");
  assert.equal(next.transactions[0]?.plannedOn, "2026-12-10");
  assert.equal(next.transactions[0]?.destinationAccountId, destination.id);
});

test("transfer recurrence rejects the same account as source and destination", () => {
  assertRecurrenceError(
    () => createTransfer({ destinationAccountId: source.id }, source),
    "RECURRENCE_TRANSFER_SAME_ACCOUNT",
  );
});

test("transfer recurrence requires a destination account", () => {
  assertRecurrenceError(
    () => createTransfer({}, undefined, ["destinationAccountId"]),
    "RECURRENCE_DESTINATION_ACCOUNT_REQUIRED",
  );
});

test("cross-currency transfer recurrence stays blocked (#668)", () => {
  assertRecurrenceError(
    () => createTransfer({ destinationAccountId: usdDestination.id }, usdDestination),
    "RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED",
  );
  assertRecurrenceError(
    () => createTransfer({ currency: "USD" }),
    "RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED",
  );
});

test("transfer recurrence rejects archived or foreign destination accounts", () => {
  assertRecurrenceError(
    () => createTransfer({ destinationAccountId: archivedDestination.id }, archivedDestination),
    "RECURRENCE_ACCOUNT_ARCHIVED",
  );
  assert.throws(
    () => createTransfer({ destinationAccountId: foreignDestination.id }, foreignDestination),
    (error: unknown) => error instanceof TenantAuthorizationError,
  );
});

test("income and expense recurrences cannot carry a destination account", () => {
  assertRecurrenceError(
    () => createTransfer({ kind: "expense" }, destination, ["categoryId"]),
    "RECURRENCE_DESTINATION_ACCOUNT_INVALID",
  );
});

test("editing a transfer recurrence keeps or replaces the destination and drops it when the kind changes", () => {
  const { recurrence } = createTransfer({}, destination, ["categoryId"]);

  const amountOnly = updateRecurrence({
    context: tenant,
    recurrence,
    now,
    account: source,
    destinationAccount: destination,
    payload: { amountMinor: 30_000 },
  }).recurrence;
  assert.equal(amountOnly.destinationAccountId, destination.id);
  assert.equal(amountOnly.amountMinor, 30_000);

  const moved = updateRecurrence({
    context: tenant,
    recurrence,
    now,
    account: source,
    destinationAccount: secondDestination,
    payload: { destinationAccountId: secondDestination.id },
  }).recurrence;
  assert.equal(moved.accountId, source.id, "changing the destination never moves the source");
  assert.equal(moved.destinationAccountId, secondDestination.id);

  const asExpense = updateRecurrence({
    context: tenant,
    recurrence,
    now,
    account: source,
    payload: { kind: "expense" },
  }).recurrence;
  assert.equal(asExpense.kind, "expense");
  assert.equal(asExpense.destinationAccountId, undefined);

  assertRecurrenceError(
    () =>
      updateRecurrence({
        context: tenant,
        recurrence,
        now,
        account: source,
        destinationAccount: source,
        payload: { destinationAccountId: source.id },
      }),
    "RECURRENCE_TRANSFER_SAME_ACCOUNT",
  );
  assertRecurrenceError(
    () =>
      updateRecurrence({
        context: tenant,
        recurrence,
        now,
        account: source,
        destinationAccount: usdDestination,
        payload: { destinationAccountId: usdDestination.id },
      }),
    "RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED",
  );
});

test("pause, resume and cancel keep both legs of a transfer recurrence", () => {
  const { recurrence } = createTransfer();
  const paused = pauseRecurrence(tenant, recurrence, now).recurrence;
  assert.equal(paused.status, "paused");
  assert.equal(generate(paused, [], "2026-12-31").transactions.length, 0);

  const resumed = resumeRecurrence(tenant, paused, now).recurrence;
  assert.equal(resumed.status, "active");
  assert.equal(resumed.destinationAccountId, destination.id);

  const cancelled = cancelRecurrence(tenant, resumed, now).recurrence;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.accountId, source.id);
  assert.equal(cancelled.destinationAccountId, destination.id);
  assert.equal(generate(cancelled, [], "2026-12-31").transactions.length, 0);
});

test("listing by account includes transfer recurrences on either leg", () => {
  const { recurrence } = createTransfer();
  assert.deepEqual(
    listRecurrences(tenant, [recurrence], { accountId: source.id }).map((item) => item.id),
    [recurrence.id],
  );
  assert.deepEqual(
    listRecurrences(tenant, [recurrence], { accountId: destination.id }).map((item) => item.id),
    [recurrence.id],
  );
  assert.deepEqual(listRecurrences(tenant, [recurrence], { accountId: usdDestination.id }), []);
});

function createTransfer(
  overrides: Partial<CreateRecurrencePayload> = {},
  destinationAccount: Account | undefined = destination,
  omit: readonly ("destinationAccountId" | "categoryId")[] = [],
) {
  const payload: CreateRecurrencePayload = {
    frequency: "monthly",
    startOn: "2026-09-10",
    amountMinor: 25_000,
    description: "Reserva mensal ficticia",
    kind: "transfer",
    accountId: source.id,
    destinationAccountId: destination.id,
    categoryId: transferCategory.id,
    ...overrides,
  };
  for (const field of omit) delete payload[field];

  return createRecurrence({
    id: "recurrence-transfer",
    context: tenant,
    now,
    payload,
    account: source,
    ...(destinationAccount ? { destinationAccount } : {}),
    ...(payload.categoryId ? { category: transferCategory } : {}),
  });
}

function generate(
  recurrence: Recurrence,
  existingInstallments: Parameters<
    typeof generateRecurrenceInstallments
  >[0]["existingInstallments"],
  through: string,
) {
  return generateRecurrenceInstallments({
    context: tenant,
    recurrence,
    existingInstallments,
    now,
    through,
    makeInstallmentId: (sequence) => `installment-${sequence}`,
    makeTransactionId: (sequence) => `transaction-${sequence}`,
  });
}

function account(context: TenantContext, id: string, currency: string): Account {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Conta ${id}`,
    kind: "checking",
    status: "active",
    currency,
    openingBalanceMinor: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function assertRecurrenceError(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof RecurrenceError, `expected RecurrenceError ${code}`);
    assert.equal(error.code, code);
    return true;
  });
}
