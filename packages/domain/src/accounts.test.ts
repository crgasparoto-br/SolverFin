import type { Account } from "./index.js";
import type { TenantContext } from "./tenant.js";
import { TenantAuthorizationError } from "./tenant-authorization.js";
import {
  AccountError,
  archiveAccount,
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "./accounts.js";

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

testCreateAccount();
testCreateAccountValidation();
testCreateAccountWithInstitutionKey();
testRejectsInvalidInstitutionKey();
testListAccountsFiltersByTenantAndStatus();
testUpdateAccount();
testUpdateAccountInstitutionKey();
testArchiveAccount();
testOtherTenantAccessIsRejected();
testOpeningBalanceCanBeOmittedWhenTransactionsExist();
testOpeningBalanceCanBeRepeatedWhenTransactionsExist();
testInvalidOpeningBalanceIsValidatedBeforeLock();
testOpeningBalanceIsLockedWhenTransactionsExist();

function testCreateAccount(): void {
  const account = createAccount({
    id: "account-demo-a",
    context: tenantA,
    now,
    payload: {
      name: " Conta Principal ",
      kind: "checking",
      openingBalanceMinor: 12500,
      currency: "brl",
    },
  });

  assertEqual(account.organizationId, tenantA.organizationId, "create org scope");
  assertEqual(account.financialProfileId, tenantA.financialProfileId, "create profile scope");
  assertEqual(account.name, "Conta Principal", "create name");
  assertEqual(account.kind, "checking", "create kind");
  assertEqual(account.currency, "BRL", "create currency");
  assertEqual(account.openingBalanceMinor, 12500, "create opening balance");
  assertEqual(account.status, "active", "create status");
}

function testCreateAccountValidation(): void {
  assertAccountError(
    () =>
      createAccount({
        id: "account-invalid-name",
        context: tenantA,
        now,
        payload: {
          name: " ",
          kind: "checking",
        },
      }),
    "ACCOUNT_NAME_REQUIRED",
  );

  assertAccountError(
    () =>
      createAccount({
        id: "account-invalid-currency",
        context: tenantA,
        now,
        payload: {
          name: "Conta Demo",
          kind: "checking",
          currency: "REAL",
        },
      }),
    "ACCOUNT_CURRENCY_INVALID",
  );
}

function testCreateAccountWithInstitutionKey(): void {
  const account = createAccount({
    id: "account-with-institution",
    context: tenantA,
    now,
    payload: {
      name: "Conta com instituicao",
      kind: "checking",
      institutionKey: " Inter ",
    },
  });

  assertEqual(account.institutionKey, "inter", "institution key should normalize");
}

function testRejectsInvalidInstitutionKey(): void {
  assertAccountError(
    () =>
      createAccount({
        id: "account-invalid-institution",
        context: tenantA,
        now,
        payload: {
          name: "Conta com chave invalida",
          kind: "checking",
          institutionKey: "logo-livre",
        },
      }),
    "ACCOUNT_INSTITUTION_KEY_INVALID",
  );
}

function testListAccountsFiltersByTenantAndStatus(): void {
  const activeAccount = createAccountFixture(tenantA, "account-active", "active");
  const archivedAccount = createAccountFixture(tenantA, "account-archived", "archived");
  const otherTenantAccount = createAccountFixture(tenantB, "account-other", "active");

  const defaultList = listAccounts(tenantA, [activeAccount, archivedAccount, otherTenantAccount]);
  const allList = listAccounts(tenantA, [activeAccount, archivedAccount, otherTenantAccount], {
    status: "all",
  });

  assertEqual(defaultList.length, 1, "default list length");
  assertEqual(defaultList[0]?.id, activeAccount.id, "default list active account");
  assertEqual(allList.length, 2, "all list length");
}

function testUpdateAccount(): void {
  const account = createAccountFixture(tenantA, "account-update", "active");
  const updatedAccount = updateAccount({
    context: tenantA,
    account,
    now: "2026-06-15T11:00:00.000Z",
    payload: {
      name: " Conta atualizada ",
      kind: "investment",
      openingBalanceMinor: 5000,
    },
  });

  assertEqual(updatedAccount.name, "Conta atualizada", "updated name");
  assertEqual(updatedAccount.kind, "investment", "updated kind");
  assertEqual(updatedAccount.openingBalanceMinor, 5000, "updated opening balance");
  assertEqual(updatedAccount.updatedByUserId, tenantA.userId, "updated actor");
}

function testUpdateAccountInstitutionKey(): void {
  const account = createAccountFixture(tenantA, "account-update-institution", "active");
  const updatedAccount = updateAccount({
    context: tenantA,
    account,
    now: "2026-06-15T11:00:00.000Z",
    payload: {
      institutionKey: "caixa",
    },
  });

  assertEqual(updatedAccount.institutionKey, "caixa", "updated institution key");
}

function testArchiveAccount(): void {
  const account = createAccountFixture(tenantA, "account-archive", "active");
  const archivedAccount = archiveAccount(tenantA, account, "2026-06-15T12:00:00.000Z");

  assertEqual(archivedAccount.status, "archived", "archived status");
  assertEqual(archivedAccount.updatedByUserId, tenantA.userId, "archived actor");
}

function testOtherTenantAccessIsRejected(): void {
  const otherTenantAccount = createAccountFixture(tenantB, "account-other", "active");

  assertTenantAuthorizationError(
    () => getAccount(tenantA, otherTenantAccount),
    "TENANT_RESOURCE_NOT_FOUND",
  );
  assertTenantAuthorizationError(
    () => archiveAccount(tenantA, otherTenantAccount, now),
    "TENANT_RESOURCE_NOT_FOUND",
  );
}

function testOpeningBalanceCanBeOmittedWhenTransactionsExist(): void {
  const account = createAccountFixture(tenantA, "account-balance-omitted", "active");
  const updatedAccount = updateAccount({
    context: tenantA,
    account,
    now,
    hasTransactions: true,
    payload: { name: "Conta atualizada sem saldo" },
  });

  assertEqual(updatedAccount.name, "Conta atualizada sem saldo", "name without opening balance");
  assertEqual(updatedAccount.openingBalanceMinor, 0, "opening balance remains unchanged");
}

function testOpeningBalanceCanBeRepeatedWhenTransactionsExist(): void {
  const account = createAccountFixture(tenantA, "account-balance-repeated", "active");
  const updatedAccount = updateAccount({
    context: tenantA,
    account,
    now,
    hasTransactions: true,
    payload: { openingBalanceMinor: account.openingBalanceMinor },
  });

  assertEqual(updatedAccount.openingBalanceMinor, 0, "identical opening balance is idempotent");
}

function testInvalidOpeningBalanceIsValidatedBeforeLock(): void {
  const account = createAccountFixture(tenantA, "account-balance-invalid", "active");

  assertAccountError(
    () =>
      updateAccount({
        context: tenantA,
        account,
        now,
        hasTransactions: true,
        payload: { openingBalanceMinor: 0.5 },
      }),
    "ACCOUNT_OPENING_BALANCE_INVALID",
  );
}

function testOpeningBalanceIsLockedWhenTransactionsExist(): void {
  const account = createAccountFixture(tenantA, "account-locked", "active");

  assertAccountError(
    () =>
      updateAccount({
        context: tenantA,
        account,
        now,
        hasTransactions: true,
        payload: {
          openingBalanceMinor: 100,
        },
      }),
    "ACCOUNT_OPENING_BALANCE_LOCKED",
  );
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

function assertAccountError(action: () => void, expectedCode: AccountError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof AccountError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected account error ${expectedCode}.`);
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
