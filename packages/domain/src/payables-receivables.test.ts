import type { Account, Category, Transaction } from "./index.js";
import type { PayableReceivable } from "./payables-receivables.js";
import type { TenantContext } from "./tenant.js";
import { CategoryError } from "./categories.js";
import {
  cancelPayableReceivable,
  createPayableReceivable,
  getPayableReceivable,
  listPayableReceivables,
  PayableReceivableError,
  settlePayableReceivable,
  updatePayableReceivable,
} from "./payables-receivables.js";
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
  financialProfileKind: "business",
  userId: "user-b",
};

const account = createAccountFixture(tenantA, "account-main", "active");
const archivedAccount = createAccountFixture(tenantA, "account-old", "archived");
const expenseCategory = createCategoryFixture(tenantA, "category-expense", "expense", "active");
const incomeCategory = createCategoryFixture(tenantA, "category-income", "income", "active");

runCreatesPayable();
runCreatesReceivable();
runRejectsArchivedAccountAndWrongCategory();
runListsAndUpdatesPayablesReceivables();
runSettlesPayableWithGeneratedTransaction();
runSettlesReceivableWithExistingTransaction();
runRejectsDuplicateSettlementAndPartialPayment();
runCancelsPendingAndRejectsSettledCancellation();
runTenantIsolation();

function runCreatesPayable(): void {
  const result = createPayableReceivable({
    id: "payable-rent",
    context: tenantA,
    now,
    account,
    category: expenseCategory,
    payload: {
      kind: "payable",
      amountMinor: 125000,
      dueOn: "2026-06-20",
      description: " Aluguel ficticio ",
      accountId: account.id,
      categoryId: expenseCategory.id,
      currency: "brl",
    },
  });

  assertEqual(result.payableReceivable.status, "pending", "payable should start pending");
  assertEqual(result.payableReceivable.currency, "BRL", "currency should normalize");
  assertEqual(result.payableReceivable.description, "Aluguel ficticio", "description should trim");
  assertEqual(result.auditEntry.entityKind, "payable_receivable", "audit should target bill");
}

function runCreatesReceivable(): void {
  const result = createPayableReceivable({
    id: "receivable-client",
    context: tenantA,
    now,
    category: incomeCategory,
    payload: {
      kind: "receivable",
      amountMinor: 220000,
      dueOn: "2026-06-25",
      description: "Projeto ficticio",
      categoryId: incomeCategory.id,
    },
  });

  assertEqual(result.payableReceivable.kind, "receivable", "receivable kind");
  assertEqual(
    result.payableReceivable.accountId,
    undefined,
    "account should be optional before settlement",
  );
}

function runRejectsArchivedAccountAndWrongCategory(): void {
  assertPayableReceivableError(
    () =>
      createPayableReceivable({
        id: "payable-archived-account",
        context: tenantA,
        now,
        account: archivedAccount,
        payload: {
          kind: "payable",
          amountMinor: 1000,
          dueOn: "2026-06-20",
          description: "Conta invalida",
          accountId: archivedAccount.id,
        },
      }),
    "PAYABLE_RECEIVABLE_ACCOUNT_ARCHIVED",
  );

  assertCategoryError(() =>
    createPayableReceivable({
      id: "payable-income-category",
      context: tenantA,
      now,
      category: incomeCategory,
      payload: {
        kind: "payable",
        amountMinor: 1000,
        dueOn: "2026-06-20",
        description: "Categoria invalida",
        categoryId: incomeCategory.id,
      },
    }),
  );
}

function runListsAndUpdatesPayablesReceivables(): void {
  const payable = createBillFixture("payable-list", "payable", "2026-06-20", expenseCategory);
  const receivable = createBillFixture(
    "receivable-list",
    "receivable",
    "2026-07-05",
    incomeCategory,
  );
  const otherTenant = createPayableReceivable({
    id: "payable-other-tenant",
    context: tenantB,
    now,
    payload: {
      kind: "payable",
      amountMinor: 1000,
      dueOn: "2026-06-22",
      description: "Outro tenant",
    },
  }).payableReceivable;
  const listed = listPayableReceivables(tenantA, [payable, receivable, otherTenant], {
    kind: "payable",
    status: "pending",
    dueFrom: "2026-06-01",
    dueTo: "2026-06-30",
  });
  const updated = updatePayableReceivable({
    context: tenantA,
    payableReceivable: payable,
    now,
    account,
    category: expenseCategory,
    payload: {
      amountMinor: 8800,
      accountId: account.id,
      categoryId: expenseCategory.id,
    },
  });

  assertEqual(listed.length, 1, "list should filter by tenant, kind and due period");
  assertEqual(listed[0]?.id, payable.id, "list should keep payable");
  assertEqual(updated.payableReceivable.amountMinor, 8800, "update should change amount");
  assertEqual(updated.auditEntry.action, "update", "update should audit");
}

function runSettlesPayableWithGeneratedTransaction(): void {
  const payable = createBillFixture("payable-settle", "payable", "2026-06-20", expenseCategory);
  const result = settlePayableReceivable({
    transactionId: "transaction-payable-settle",
    context: tenantA,
    payableReceivable: payable,
    now: "2026-06-20T12:00:00.000Z",
    account,
    category: expenseCategory,
    payload: {
      settledOn: "2026-06-20",
      accountId: account.id,
      categoryId: expenseCategory.id,
    },
  });

  assertEqual(result.payableReceivable.status, "settled", "payable should be settled");
  assertEqual(
    result.payableReceivable.settlementTransactionId,
    result.transaction.id,
    "bill should link transaction",
  );
  assertEqual(result.transaction.kind, "expense", "payable should generate expense");
  assertEqual(result.transaction.status, "posted", "generated transaction should be posted");
  assertEqual(result.transaction.accountId, account.id, "generated transaction should use account");
  assertEqual(result.auditEntries.length, 2, "settlement should audit bill and transaction");
}

function runSettlesReceivableWithExistingTransaction(): void {
  const receivable = createBillFixture(
    "receivable-settle-existing",
    "receivable",
    "2026-06-25",
    incomeCategory,
  );
  const existingTransaction = createTransactionFixture(
    "transaction-existing-receivable",
    "income",
    receivable.amountMinor,
    receivable.currency,
  );
  const result = settlePayableReceivable({
    context: tenantA,
    payableReceivable: receivable,
    now,
    existingTransaction,
    payload: {
      settledOn: "2026-06-25",
      existingTransactionId: existingTransaction.id,
    },
  });

  assertEqual(
    result.transaction.id,
    existingTransaction.id,
    "existing transaction should be linked",
  );
  assertEqual(result.payableReceivable.status, "settled", "receivable should be settled");
}

function runRejectsDuplicateSettlementAndPartialPayment(): void {
  const payable = createBillFixture("payable-duplicate", "payable", "2026-06-20", expenseCategory);
  const settled = settlePayableReceivable({
    transactionId: "transaction-payable-duplicate",
    context: tenantA,
    payableReceivable: payable,
    now,
    account,
    category: expenseCategory,
    payload: {
      settledOn: "2026-06-20",
      accountId: account.id,
      categoryId: expenseCategory.id,
    },
  }).payableReceivable;

  assertPayableReceivableError(
    () =>
      settlePayableReceivable({
        transactionId: "transaction-payable-again",
        context: tenantA,
        payableReceivable: settled,
        now,
        account,
        payload: {
          settledOn: "2026-06-20",
          accountId: account.id,
        },
      }),
    "PAYABLE_RECEIVABLE_ALREADY_SETTLED",
  );

  assertPayableReceivableError(
    () =>
      settlePayableReceivable({
        transactionId: "transaction-payable-partial",
        context: tenantA,
        payableReceivable: payable,
        now,
        account,
        payload: {
          settledOn: "2026-06-20",
          accountId: account.id,
          amountMinor: 100,
        },
      }),
    "PAYABLE_RECEIVABLE_PARTIAL_UNSUPPORTED",
  );
}

function runCancelsPendingAndRejectsSettledCancellation(): void {
  const payable = createBillFixture("payable-cancel", "payable", "2026-06-20", expenseCategory);
  const cancelled = cancelPayableReceivable(tenantA, payable, now).payableReceivable;
  const settled = settlePayableReceivable({
    transactionId: "transaction-cancel-settled",
    context: tenantA,
    payableReceivable: createBillFixture(
      "payable-cancel-settled",
      "payable",
      "2026-06-20",
      expenseCategory,
    ),
    now,
    account,
    payload: {
      settledOn: "2026-06-20",
      accountId: account.id,
    },
  }).payableReceivable;

  assertEqual(cancelled.status, "cancelled", "cancel should change status");
  assertPayableReceivableError(
    () => cancelPayableReceivable(tenantA, settled, now),
    "PAYABLE_RECEIVABLE_SETTLED_CANNOT_CANCEL",
  );
}

function runTenantIsolation(): void {
  const payable = createBillFixture("payable-tenant", "payable", "2026-06-20", expenseCategory);

  assertEqual(listPayableReceivables(tenantB, [payable]).length, 0, "other tenant list empty");
  assertTenantError(() => getPayableReceivable(tenantB, payable));
  assertTenantError(() => cancelPayableReceivable(tenantB, payable, now));
}

function createBillFixture(
  id: string,
  kind: PayableReceivable["kind"],
  dueOn: string,
  category: Category,
): PayableReceivable {
  return createPayableReceivable({
    id,
    context: tenantA,
    now,
    category,
    payload: {
      kind,
      amountMinor: 12345,
      dueOn,
      description: `Conta ${id}`,
      categoryId: category.id,
    },
  }).payableReceivable;
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
  kind: Transaction["kind"],
  amountMinor: number,
  currency: string,
): Transaction {
  return {
    id,
    organizationId: tenantA.organizationId,
    financialProfileId: tenantA.financialProfileId,
    kind,
    status: "posted",
    source: "manual",
    amountMinor,
    currency,
    occurredOn: "2026-06-25",
    description: `Lancamento ${id}`,
    accountId: account.id,
    createdAt: now,
    updatedAt: now,
  };
}

function assertPayableReceivableError(
  action: () => void,
  expectedCode: PayableReceivableError["code"],
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof PayableReceivableError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected payable/receivable error ${expectedCode}.`);
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
