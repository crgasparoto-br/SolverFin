import type { Account, Category, Installment, Recurrence } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  cancelFutureInstallments,
  cancelRecurrence,
  createRecurrence,
  generateInstallmentSchedule,
  generateRecurrenceInstallments,
  listRecurrences,
  pauseRecurrence,
  RecurrenceError,
  updateRecurrence,
} from "./recurrences.js";
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

const activeAccount = createAccountFixture(tenantA, "account-a", "active");
const archivedAccount = createAccountFixture(tenantA, "account-archived", "archived");
const category = createCategoryFixture(tenantA, "category-a", "active");

runCreatesRecurrence();
runRejectsArchivedAccount();
runGeneratesMonthlyInstallmentsWithoutDuplicates();
runGeneratesBiweeklyInstallmentsWithInterval();
runClampsMissingMonthDay();
runPausesAndCancelsRecurrence();
runUpdatesFutureRule();
runGeneratesFixedInstallmentSchedule();
runCancelsOnlyFuturePlannedInstallments();
runTenantIsolation();

function runCreatesRecurrence(): void {
  const result = createRecurrence({
    id: "recurrence-rent",
    context: tenantA,
    now,
    account: activeAccount,
    category,
    payload: {
      frequency: "monthly",
      startOn: "2026-06-05",
      amountMinor: 150000,
      description: "Aluguel ficticio",
      accountId: activeAccount.id,
      categoryId: category.id,
    },
  });

  assertEqual(result.recurrence.status, "active", "recurrence should start active");
  assertEqual(result.recurrence.currency, "BRL", "recurrence should inherit account currency");
  assertEqual(result.auditEntry.entityKind, "recurrence", "audit should target recurrence");
}

function runRejectsArchivedAccount(): void {
  assertRecurrenceError(
    () =>
      createRecurrence({
        id: "recurrence-invalid-account",
        context: tenantA,
        now,
        account: archivedAccount,
        payload: {
          frequency: "monthly",
          startOn: "2026-06-05",
          amountMinor: 12000,
          description: "Assinatura ficticia",
          accountId: archivedAccount.id,
        },
      }),
    "RECURRENCE_ACCOUNT_ARCHIVED",
  );
}

function runGeneratesMonthlyInstallmentsWithoutDuplicates(): void {
  const recurrence = createRecurrenceFixture({
    id: "recurrence-subscription",
    startOn: "2026-06-10",
    endOn: "2026-09-10",
  });
  const existingInstallments = [createInstallmentFixture(recurrence, 2, "2026-07-10")];

  const installments = generateRecurrenceInstallments({
    context: tenantA,
    recurrence,
    existingInstallments,
    now,
    through: "2026-09-30",
    makeInstallmentId: (sequenceNumber) => `installment-${sequenceNumber}`,
  });

  assertEqual(installments.length, 3, "generation should skip existing sequence");
  assertEqual(installments[0]?.sequenceNumber, 1, "first missing sequence should be generated");
  assertEqual(installments[1]?.sequenceNumber, 3, "third sequence should be generated");
  assertEqual(installments[2]?.sequenceNumber, 4, "fourth sequence should be generated");
  assertEqual(installments[0]?.totalInstallments, 4, "bounded recurrence should expose total");
}

function runGeneratesBiweeklyInstallmentsWithInterval(): void {
  const recurrence = createRecurrenceFixture({
    id: "recurrence-biweekly",
    startOn: "2026-06-01",
    frequency: "weekly",
    interval: 2,
  });

  const installments = generateRecurrenceInstallments({
    context: tenantA,
    recurrence,
    existingInstallments: [],
    now,
    through: "2026-06-30",
    makeInstallmentId: (sequenceNumber) => `installment-biweekly-${sequenceNumber}`,
  });

  assertEqual(recurrence.interval, 2, "fixture should persist requested interval");
  assertEqual(installments.length, 3, "every 2 weeks should generate 3 occurrences in June");
  assertEqual(installments[0]?.dueOn, "2026-06-01", "first occurrence should be start date");
  assertEqual(installments[1]?.dueOn, "2026-06-15", "second occurrence should skip 2 weeks");
  assertEqual(installments[2]?.dueOn, "2026-06-29", "third occurrence should skip 2 more weeks");
}

function runClampsMissingMonthDay(): void {
  const recurrence = createRecurrenceFixture({
    id: "recurrence-end-of-month",
    startOn: "2026-01-31",
    endOn: "2026-03-31",
  });

  const installments = generateRecurrenceInstallments({
    context: tenantA,
    recurrence,
    existingInstallments: [],
    now,
    through: "2026-03-31",
    makeInstallmentId: (sequenceNumber) => `installment-clamp-${sequenceNumber}`,
  });

  assertEqual(installments[0]?.dueOn, "2026-01-31", "first due date should be preserved");
  assertEqual(installments[1]?.dueOn, "2026-02-28", "missing day should clamp to month end");
  assertEqual(installments[2]?.dueOn, "2026-03-31", "next valid month should keep requested day");
}

function runPausesAndCancelsRecurrence(): void {
  const recurrence = createRecurrenceFixture({ id: "recurrence-pause", startOn: "2026-06-01" });
  const paused = pauseRecurrence(tenantA, recurrence, now).recurrence;
  const cancelled = cancelRecurrence(tenantA, paused, now).recurrence;

  assertEqual(paused.status, "paused", "pause should update recurrence status");
  assertEqual(cancelled.status, "cancelled", "cancel should update recurrence status");

  const generated = generateRecurrenceInstallments({
    context: tenantA,
    recurrence: cancelled,
    existingInstallments: [],
    now,
    through: "2026-12-31",
    makeInstallmentId: (sequenceNumber) => `cancelled-${sequenceNumber}`,
  });

  assertEqual(generated.length, 0, "cancelled recurrence should not generate new installments");
}

function runUpdatesFutureRule(): void {
  const recurrence = createRecurrenceFixture({ id: "recurrence-update", startOn: "2026-06-01" });
  const updated = updateRecurrence({
    context: tenantA,
    recurrence,
    now,
    account: activeAccount,
    category,
    payload: {
      amountMinor: 9900,
      endOn: "2026-08-01",
      description: "Assinatura atualizada ficticia",
    },
  }).recurrence;

  assertEqual(updated.amountMinor, 9900, "update should change future amount");
  assertEqual(updated.endOn, "2026-08-01", "update should set end date");
  assertEqual(
    updated.description,
    "Assinatura atualizada ficticia",
    "update should change description",
  );
}

function runGeneratesFixedInstallmentSchedule(): void {
  const installments = generateInstallmentSchedule({
    context: tenantA,
    now,
    firstDueOn: "2026-06-30",
    totalInstallments: 3,
    amountMinor: 3333,
    currency: "brl",
    cardId: "card-demo",
    makeInstallmentId: (sequenceNumber) => `card-installment-${sequenceNumber}`,
  });

  assertEqual(installments.length, 3, "fixed schedule should generate all installments");
  assertEqual(installments[0]?.totalInstallments, 3, "schedule should keep total installments");
  assertEqual(installments[1]?.dueOn, "2026-07-30", "schedule should generate monthly due dates");
  assertEqual(installments[2]?.currency, "BRL", "schedule should normalize currency");
  assertEqual(installments[0]?.cardId, "card-demo", "schedule should keep card reference");
}

function runCancelsOnlyFuturePlannedInstallments(): void {
  const recurrence = createRecurrenceFixture({
    id: "recurrence-cancel-future",
    startOn: "2026-06-01",
  });
  const installments = [
    createInstallmentFixture(recurrence, 1, "2026-06-01", "posted"),
    createInstallmentFixture(recurrence, 2, "2026-07-01", "planned"),
    createInstallmentFixture(recurrence, 3, "2026-08-01", "planned"),
  ];

  const cancelledInstallments = cancelFutureInstallments(tenantA, installments, now, "2026-07-01");

  assertEqual(cancelledInstallments[0]?.status, "posted", "posted installment should stay posted");
  assertEqual(cancelledInstallments[1]?.status, "cancelled", "future planned should cancel");
  assertEqual(cancelledInstallments[2]?.status, "cancelled", "later planned should cancel");
}

function runTenantIsolation(): void {
  const recurrence = createRecurrenceFixture({ id: "recurrence-tenant", startOn: "2026-06-01" });

  assertEqual(
    listRecurrences(tenantB, [recurrence]).length,
    0,
    "other tenant list should be empty",
  );
  assertTenantError(() => pauseRecurrence(tenantB, recurrence, now));
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

function createCategoryFixture(
  context: TenantContext,
  id: string,
  status: Category["status"],
): Category {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Categoria ${id}`,
    kind: "expense",
    status,
    createdAt: now,
    updatedAt: now,
  };
}

function createRecurrenceFixture(input: {
  id: string;
  startOn: string;
  endOn?: string;
  frequency?: Recurrence["frequency"];
  interval?: number;
}): Recurrence {
  const payload = {
    frequency: input.frequency ?? ("monthly" as const),
    ...(input.interval !== undefined ? { interval: input.interval } : {}),
    startOn: input.startOn,
    amountMinor: 4500,
    description: "Recorrencia ficticia",
    accountId: activeAccount.id,
    categoryId: category.id,
  };

  if (input.endOn !== undefined) {
    return createRecurrence({
      id: input.id,
      context: tenantA,
      now,
      account: activeAccount,
      category,
      payload: {
        ...payload,
        endOn: input.endOn,
      },
    }).recurrence;
  }

  return createRecurrence({
    id: input.id,
    context: tenantA,
    now,
    account: activeAccount,
    category,
    payload,
  }).recurrence;
}

function createInstallmentFixture(
  recurrence: Recurrence,
  sequenceNumber: number,
  dueOn: string,
  status: Installment["status"] = "planned",
): Installment {
  return {
    id: `installment-existing-${sequenceNumber}`,
    organizationId: recurrence.organizationId,
    financialProfileId: recurrence.financialProfileId,
    recurrenceId: recurrence.id,
    status,
    sequenceNumber,
    totalInstallments: recurrence.endOn === undefined ? 0 : 4,
    dueOn,
    amountMinor: recurrence.amountMinor,
    currency: recurrence.currency,
    createdAt: now,
    updatedAt: now,
  };
}

function assertRecurrenceError(action: () => void, expectedCode: RecurrenceError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof RecurrenceError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected recurrence error ${expectedCode}.`);
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
