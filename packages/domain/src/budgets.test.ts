import type { Budget, Category, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import {
  archiveBudget,
  BudgetError,
  createBudget,
  getMonthlyBudgetPeriod,
  listBudgets,
  summarizeBudgetDashboard,
  summarizeBudgetUsage,
  updateBudget,
} from "./budgets.js";
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

const foodCategory = createCategoryFixture(tenantA, "category-food", "expense", "active");
const transportCategory = createCategoryFixture(tenantA, "category-transport", "expense", "active");
const archivedCategory = createCategoryFixture(tenantA, "category-old", "expense", "archived");
const incomeCategory = createCategoryFixture(tenantA, "category-income", "income", "active");

runCreatesBudgetWithMonthlyPeriod();
runRejectsArchivedOrIncomeCategory();
runSummarizesNormalUsage();
runSummarizesNoData();
runSummarizesZeroBudget();
runSummarizesDashboardWithUnbudgetedCategory();
runUpdatesAndArchivesBudget();
runListFiltersByPeriod();
runTenantIsolation();

function runCreatesBudgetWithMonthlyPeriod(): void {
  const period = getMonthlyBudgetPeriod("2026-06");
  const result = createBudget({
    id: "budget-food",
    context: tenantA,
    now,
    category: foodCategory,
    payload: {
      categoryId: foodCategory.id,
      periodStartOn: period.periodStartOn,
      plannedAmountMinor: 100000,
      currency: "brl",
      alertThresholdPercent: 75,
    },
  });

  assertEqual(result.budget.status, "active", "budget should start active");
  assertEqual(result.budget.periodEndOn, "2026-06-30", "monthly period should end in month end");
  assertEqual(result.budget.currency, "BRL", "budget should normalize currency");
  assertEqual(result.auditEntry.entityKind, "budget", "audit should target budget");
}

function runRejectsArchivedOrIncomeCategory(): void {
  assertBudgetError(
    () =>
      createBudget({
        id: "budget-archived-category",
        context: tenantA,
        now,
        category: archivedCategory,
        payload: {
          categoryId: archivedCategory.id,
          periodStartOn: "2026-06-01",
          plannedAmountMinor: 1000,
        },
      }),
    "BUDGET_CATEGORY_ARCHIVED",
  );
  assertBudgetError(
    () =>
      createBudget({
        id: "budget-income-category",
        context: tenantA,
        now,
        category: incomeCategory,
        payload: {
          categoryId: incomeCategory.id,
          periodStartOn: "2026-06-01",
          plannedAmountMinor: 1000,
        },
      }),
    "BUDGET_CATEGORY_KIND_INVALID",
  );
}

function runSummarizesNormalUsage(): void {
  const budget = createBudgetFixture("budget-food-normal", foodCategory, 100000, 80);
  const transactions = [
    createTransactionFixture("transaction-food-1", foodCategory.id, "2026-06-03", 30000, "posted"),
    createTransactionFixture("transaction-food-2", foodCategory.id, "2026-06-12", 50000, "reconciled"),
    createTransactionFixture("transaction-food-planned", foodCategory.id, "2026-06-20", 9000, "planned"),
    createTransactionFixture("transaction-food-outside", foodCategory.id, "2026-07-01", 7000, "posted"),
  ];
  const summary = summarizeBudgetUsage({ context: tenantA, budget, transactions });

  assertEqual(summary.actualAmountMinor, 80000, "summary should include realized period expenses");
  assertEqual(summary.remainingAmountMinor, 20000, "summary should calculate remaining amount");
  assertEqual(summary.usedPercent, 80, "summary should calculate usage percent");
  assertEqual(summary.status, "approaching", "summary should flag threshold usage");
}

function runSummarizesNoData(): void {
  const budget = createBudgetFixture("budget-no-data", foodCategory, 50000, 80);
  const summary = summarizeBudgetUsage({ context: tenantA, budget, transactions: [] });

  assertEqual(summary.actualAmountMinor, 0, "summary should allow month without transactions");
  assertEqual(summary.usedPercent, 0, "empty usage should be zero percent");
  assertEqual(summary.status, "no_activity", "empty usage should be no activity");
}

function runSummarizesZeroBudget(): void {
  const budget = createBudgetFixture("budget-zero", foodCategory, 0, 80);
  const transactions = [
    createTransactionFixture("transaction-zero-budget", foodCategory.id, "2026-06-10", 1000, "posted"),
  ];
  const summary = summarizeBudgetUsage({ context: tenantA, budget, transactions });

  assertEqual(summary.plannedAmountMinor, 0, "zero budget should be allowed");
  assertEqual(summary.usedPercent, 100, "zero budget with usage should show full usage");
  assertEqual(summary.status, "exceeded", "zero budget with usage should be exceeded");
}

function runSummarizesDashboardWithUnbudgetedCategory(): void {
  const budget = createBudgetFixture("budget-food-dashboard", foodCategory, 100000, 80);
  const transactions = [
    createTransactionFixture("transaction-food-dashboard", foodCategory.id, "2026-06-10", 20000, "posted"),
    createTransactionFixture(
      "transaction-transport-dashboard",
      transportCategory.id,
      "2026-06-11",
      15000,
      "posted",
    ),
    createTransactionFixture("transaction-no-category", undefined, "2026-06-11", 15000, "posted"),
    createTransactionFixture("transaction-other-tenant", foodCategory.id, "2026-06-11", 99999, "posted", tenantB),
  ];
  const summaries = summarizeBudgetDashboard({
    context: tenantA,
    budgets: [budget],
    transactions,
    periodStartOn: "2026-06-01",
  });
  const foodSummary = summaries.find((summary) => summary.categoryId === foodCategory.id);
  const transportSummary = summaries.find((summary) => summary.categoryId === transportCategory.id);

  assertEqual(summaries.length, 2, "dashboard should include budgeted and unbudgeted categories");
  assertEqual(foodSummary?.actualAmountMinor, 20000, "budgeted category should use its total");
  assertEqual(transportSummary?.plannedAmountMinor, 0, "unbudgeted category should have no planned amount");
  assertEqual(transportSummary?.status, "unbudgeted", "unbudgeted category should be explicit");
}

function runUpdatesAndArchivesBudget(): void {
  const budget = createBudgetFixture("budget-update", foodCategory, 50000, 80);
  const updated = updateBudget({
    context: tenantA,
    budget,
    now,
    category: foodCategory,
    payload: {
      plannedAmountMinor: 65000,
      alertThresholdPercent: 90,
    },
  }).budget;
  const archived = archiveBudget(tenantA, updated, now).budget;

  assertEqual(updated.plannedAmountMinor, 65000, "update should change planned amount");
  assertEqual(updated.alertThresholdPercent, 90, "update should change threshold");
  assertEqual(archived.status, "archived", "archive should update status");
}

function runListFiltersByPeriod(): void {
  const juneBudget = createBudgetFixture("budget-june", foodCategory, 50000, 80);
  const julyBudget = createBudget({
    id: "budget-july",
    context: tenantA,
    now,
    category: foodCategory,
    payload: {
      categoryId: foodCategory.id,
      periodStartOn: "2026-07-01",
      plannedAmountMinor: 50000,
    },
  }).budget;
  const budgets = listBudgets(tenantA, [juneBudget, julyBudget], {
    periodStartOn: "2026-06-01",
    periodEndOn: "2026-06-30",
  });

  assertEqual(budgets.length, 1, "period filter should keep only overlapping budgets");
  assertEqual(budgets[0]?.id, juneBudget.id, "period filter should return june budget");
}

function runTenantIsolation(): void {
  const budget = createBudgetFixture("budget-tenant", foodCategory, 50000, 80);

  assertEqual(listBudgets(tenantB, [budget]).length, 0, "other tenant list should be empty");
  assertTenantError(() => archiveBudget(tenantB, budget, now));
}

function createBudgetFixture(
  id: string,
  category: Category,
  plannedAmountMinor: number,
  alertThresholdPercent: number,
): Budget {
  return createBudget({
    id,
    context: tenantA,
    now,
    category,
    payload: {
      categoryId: category.id,
      periodStartOn: "2026-06-01",
      plannedAmountMinor,
      alertThresholdPercent,
    },
  }).budget;
}

function createCategoryFixture(
  context: TenantContext,
  id: string,
  kind: Category["kind"],
  status: Category["status"],
): Category {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    name: `Categoria ${id}`,
    kind,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

function createTransactionFixture(
  id: string,
  categoryId: string | undefined,
  occurredOn: string,
  amountMinor: number,
  status: Transaction["status"],
  context: TenantContext = tenantA,
): Transaction {
  const transaction: Transaction = {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status,
    source: "manual",
    amountMinor,
    currency: "BRL",
    occurredOn,
    description: `Transacao ${id}`,
    accountId: "account-demo",
    createdAt: now,
    updatedAt: now,
  };

  if (categoryId !== undefined) {
    transaction.categoryId = categoryId;
  }

  return transaction;
}

function assertBudgetError(action: () => void, expectedCode: BudgetError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof BudgetError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected budget error ${expectedCode}.`);
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
