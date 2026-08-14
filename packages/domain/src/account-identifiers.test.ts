import type { TenantContext } from "./tenant.js";
import { AccountError, createAccount, updateAccount } from "./accounts.js";

const tenant: TenantContext = {
  userId: "user-demo",
  organizationId: "org-demo",
  financialProfileId: "profile-demo",
  financialProfileKind: "personal",
};
const now = "2026-08-14T12:00:00.000Z";

testCreateWithSeparateIdentifiers();
testUpdateAndClearSeparateIdentifiers();
testLegacyIdentifierRemainsCompatible();
testIdentifierLengthValidation();

function testCreateWithSeparateIdentifiers(): void {
  const account = createAccount({
    id: "account-identifiers-create",
    context: tenant,
    now,
    payload: {
      name: "Conta de teste",
      kind: "checking",
      agencyIdentifier: " 0001 ",
      accountIdentifier: " 12345-6 ",
    },
  });

  assertEqual(
    account.agencyIdentifier,
    "0001",
    "agency identifier should be trimmed",
  );
  assertEqual(
    account.accountIdentifier,
    "12345-6",
    "account identifier should be trimmed",
  );
  assertEqual(
    account.maskedIdentifier,
    undefined,
    "new accounts should not synthesize legacy identifier",
  );
}

function testUpdateAndClearSeparateIdentifiers(): void {
  const account = createAccount({
    id: "account-identifiers-update",
    context: tenant,
    now,
    payload: {
      name: "Conta de teste",
      kind: "checking",
      agencyIdentifier: "0001",
      accountIdentifier: "12345-6",
    },
  });

  const updated = updateAccount({
    context: tenant,
    account,
    now: "2026-08-14T12:10:00.000Z",
    payload: {
      agencyIdentifier: " 0002 ",
      accountIdentifier: " ",
    },
  });

  assertEqual(
    updated.agencyIdentifier,
    "0002",
    "agency identifier should update independently",
  );
  assertEqual(
    updated.accountIdentifier,
    undefined,
    "empty account identifier should clear the value",
  );
}

function testLegacyIdentifierRemainsCompatible(): void {
  const account = createAccount({
    id: "account-identifiers-legacy",
    context: tenant,
    now,
    payload: {
      name: "Conta legada",
      kind: "checking",
      maskedIdentifier: "Ag **** · Conta **** 7788",
    },
  });

  const updated = updateAccount({
    context: tenant,
    account,
    now: "2026-08-14T12:20:00.000Z",
    payload: {
      agencyIdentifier: "0003",
      accountIdentifier: "99887-1",
    },
  });

  assertEqual(
    updated.maskedIdentifier,
    "Ag **** · Conta **** 7788",
    "legacy identifier should be preserved",
  );
  assertEqual(
    updated.agencyIdentifier,
    "0003",
    "legacy account can receive agency identifier",
  );
  assertEqual(
    updated.accountIdentifier,
    "99887-1",
    "legacy account can receive account identifier",
  );
}

function testIdentifierLengthValidation(): void {
  assertAccountError(
    () =>
      createAccount({
        id: "account-identifiers-invalid-agency",
        context: tenant,
        now,
        payload: {
          name: "Conta de teste",
          kind: "checking",
          agencyIdentifier: "1".repeat(81),
        },
      }),
    "ACCOUNT_AGENCY_IDENTIFIER_INVALID",
  );

  assertAccountError(
    () =>
      createAccount({
        id: "account-identifiers-invalid-account",
        context: tenant,
        now,
        payload: {
          name: "Conta de teste",
          kind: "checking",
          accountIdentifier: "1".repeat(81),
        },
      }),
    "ACCOUNT_IDENTIFIER_INVALID",
  );
}

function assertAccountError(
  callback: () => unknown,
  expectedCode: AccountError["code"],
): void {
  try {
    callback();
  } catch (error) {
    if (error instanceof AccountError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected AccountError ${expectedCode}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}
