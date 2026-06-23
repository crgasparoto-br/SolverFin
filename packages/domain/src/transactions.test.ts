import type { Account, Category, Transaction } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { CategoryError } from "./categories.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  createTransaction,
  getTransaction,
  listTransactions,
  TransactionError,
  updateTransaction,
  voidTransaction,
} from "./transactions.js";

const tenantA: TenantContext = {
  userId: "user-demo-a",
  organizationId: "org-demo-a",
  financialProfileId: "profile-demo-a",
  financialProfileKind: "personal",
};

const tenantB: TenantContext = {
  userId: "user-demo-b",
  organizationId: "org-demo-b",
  financialProfileId: "profile-demo-b",
  financialProfileKind: "business",
};

const now = "2026-06-15T10:00:00.000Z";

testCreateIncomeTransaction();
testCreateExpenseTransaction();
testCreateTransferTransaction();
testValidations();
testListAndUpdateTransactions();
testTenantIsolation();
testVoidTransaction();

function testCreateIncomeTransaction(): void {
  const account = createAccountFixture(tenantA, "account-income", "active");
  const category = createCategoryFixture(tenantA, "category-income", "income", "active");
  const result = createTransaction({
    id: "transaction-income",
    context: tenantA,
    now,
    account,
    category,
    payload: {
      kind: "income",
      amountMinor: 150000,
      occurredOn: "2026-06-15",
      accountId: account.id,
      categoryId: category.id,
      description: " Recebimento demo ",
    },
  });

  assertEqual(result.transaction.organizationId, tenantA.organizationId, "income tenant org");
  assertEqual(result.transaction.amountMinor, 150000, "income amount");
  assertEqual(result.transaction.description, "Recebimento demo", "income description");
  assertEqual(result.movements.length, 1, "income movement count");
  assertEqual(result.movements[0]?.direction, "credit", "income movement direction");
  assertEqual(result.auditEntry.action, "create", "income audit action");
}

function testCreateExpenseTransaction(): void {
  const account = createAccountFixture(tenantA, "account-expense", "active");
  const category = createCategoryFixture(tenantA, "category-expense", "expense", "active");
  const result = createTransaction({
    id: "transaction-expense",
    context: tenantA,
    now,
    account,
    category,
    payload: {
      kind: "expense",
      amountMinor: 4590,
      occurredOn: "2026-06-15",
      accountId: account.id,
      categoryId: category.id,
      status: "posted",
      source: "manual",
    },
  });

  assertEqual(result.transaction.kind, "expense", "expense kind");
  assertEqual(result.movements.length, 1, "expense movement count");
  assertEqual(result.movements[0]?.direction, "debit", "expense movement direction");
}

function testCreateTransferTransaction(): void {
  const sourceAccount = createAccountFixture(tenantA, "account-source", "active");
  const destinationAccount = createAccountFixture(tenantA, "account-destination", "active");
  const category = createCategoryFixture(tenantA, "category-transfer", "transfer", "active");
  const result = createTransaction({
    id: "transaction-transfer",
    context: tenantA,
    now,
    account: sourceAccount,
    destinationAccount,
    category,
    payload: {
      kind: "transfer",
      amountMinor: 20000,
      occurredOn: "2026-06-15",
      accountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
      categoryId: category.id,
    },
  });

  assertEqual(result.transaction.transferGroupId, result.transaction.id, "transfer group");
  assertEqual(result.movements.length, 2, "transfer movement count");
  assertEqual(result.movements[0]?.direction, "debit", "transfer source movement");
  assertEqual(result.movements[0]?.accountId, sourceAccount.id, "transfer source account");
  assertEqual(result.movements[1]?.direction, "credit", "transfer destination movement");
  assertEqual(
    result.movements[1]?.accountId,
    destinationAccount.id,
    "transfer destination account",
  );
}

function testValidations(): void {
  const account = createAccountFixture(tenantA, "account-validation", "active");
  const archivedAccount = createAccountFixture(tenantA, "account-archived", "archived");
  const expenseCategory = createCategoryFixture(
    tenantA,
    "category-validation",
    "expense",
    "active",
  );

  assertTransactionError(
    () =>
      createTransaction({
        id: "transaction-zero",
        context: tenantA,
        now,
        account,
        payload: {
          kind: "expense",
          amountMinor: 0,
          occurredOn: "2026-06-15",
          accountId: account.id,
        },
      }),
    "TRANSACTION_AMOUNT_INVALID",
  );

  assertTransactionError(
    () =>
      createTransaction({
        id: "transaction-archived-account",
        context: tenantA,
        now,
        account: archivedAccount,
        payload: {
          kind: "expense",
          amountMinor: 100,
          occurredOn: "2026-06-15",
          accountId: archivedAccount.id,
        },
      }),
    "TRANSACTION_ACCOUNT_ARCHIVED",
  );

  assertTransactionError(
    () =>
      createTransaction({
        id: "transaction-same-transfer",
        context: tenantA,
        now,
        account,
        destinationAccount: account,
        payload: {
          kind: "transfer",
          amountMinor: 100,
          occurredOn: "2026-06-15",
          accountId: account.id,
          destinationAccountId: account.id,
        },
      }),
    "TRANSACTION_TRANSFER_SAME_ACCOUNT",
  );

  assertCategoryError(() =>
    createTransaction({
      id: "transaction-category-mismatch",
      context: tenantA,
      now,
      account,
      category: expenseCategory,
      payload: {
        kind: "income",
        amountMinor: 100,
        occurredOn: "2026-06-15",
        accountId: account.id,
        categoryId: expenseCategory.id,
      },
    }),
  );
}

function testListAndUpdateTransactions(): void {
  const account = createAccountFixture(tenantA, "account-list", "active");
  const expense = createTransactionFixture(
    tenantA,
    "transaction-list-expense",
    "expense",
    account.id,
  );
  const income = createTransactionFixture(tenantA, "transaction-list-income", "income", account.id);
  const otherTenant = createTransactionFixture(
    tenantB,
    "transaction-list-other",
    "income",
    "other",
  );
  const listed = listTransactions(tenantA, [expense, income, otherTenant], {
    kind: "expense",
    accountId: account.id,
  });
  const updated = updateTransaction({
    context: tenantA,
    transaction: expense,
    now: "2026-06-15T11:00:00.000Z",
    account,
    payload: {
      amountMinor: 9200,
      status: "reconciled",
    },
  });

  assertEqual(listed.length, 1, "filtered transaction list");
  assertEqual(listed[0]?.id, expense.id, "filtered transaction id");
  assertEqual(updated.transaction.amountMinor, 9200, "updated amount");
  assertEqual(updated.transaction.status, "reconciled", "updated status");
  assertEqual(updated.transaction.reconciledAt, "2026-06-15T11:00:00.000Z", "reconciled at");
  assertEqual(updated.auditEntry.action, "update", "updated audit action");
}

function testTenantIsolation(): void {
  const otherTenantTransaction = createTransactionFixture(
    tenantB,
    "transaction-other-tenant",
    "income",
    "account-other",
  );

  assertTenantAuthorizationError(
    () => getTransaction(tenantA, otherTenantTransaction),
    "TENANT_RESOURCE_NOT_FOUND",
  );
}

function testVoidTransaction(): void {
  const transaction = createTransactionFixture(
    tenantA,
    "transaction-void",
    "expense",
    "account-void",
  );
  const result = voidTransaction(tenantA, transaction, "2026-06-15T12:00:00.000Z");

  assertEqual(result.transaction.status, "voided", "void status");
  assertEqual(result.movements.length, 0, "void movements");
  assertEqual(result.auditEntry.action, "soft_delete", "void audit action");
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
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
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
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function createTransactionFixture(
  context: TenantContext,
  id: string,
  kind: Transaction["kind"],
  accountId: string,
): Transaction {
  return {
    id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind,
    status: "posted",
    source: "manual",
    amountMinor: 1000,
    currency: "BRL",
    occurredOn: "2026-06-15",
    plannedOn: "2026-06-15",
    description: `Lancamento ${id}`,
    accountId,
    createdAt: now,
    updatedAt: now,
    createdByUserId: context.userId,
    updatedByUserId: context.userId,
  };
}

function assertTransactionError(action: () => void, expectedCode: TransactionError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TransactionError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected transaction error ${expectedCode}.`);
}

function assertCategoryError(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof CategoryError && error.code === "CATEGORY_TRANSACTION_KIND_INVALID") {
      return;
    }

    throw error;
  }

  throw new Error("Expected category mismatch error.");
}

function assertTenantAuthorizationError(
  action: () => void,
  expectedCode: TenantAuthorizationError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof TenantAuthorizationError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected tenant authorization error ${expectedCode}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
