import { AuthError, type AuthenticatedUser } from "./auth.js";
import {
  MASTER_EMAILS_ENV_KEY,
  isMasterUser,
  listConfiguredMasterEmails,
  requireMasterUser,
} from "./admin-auth.js";

const masterUser: AuthenticatedUser = {
  id: "user-master-1",
  email: "Master@SolverFin.example.invalid",
  displayName: "Usuario Master",
  status: "active",
};

const regularUser: AuthenticatedUser = {
  id: "user-regular-1",
  email: "regular@solverfin.example.invalid",
  displayName: "Usuario Comum",
  status: "active",
};

const disabledMasterUser: AuthenticatedUser = {
  id: "user-master-disabled-1",
  email: "master@solverfin.example.invalid",
  displayName: "Usuario Master Desabilitado",
  status: "disabled",
};

const configuredMasterEnv = {
  [MASTER_EMAILS_ENV_KEY]: " master@solverfin.example.invalid , outro-master@solverfin.example.invalid ",
};

testMasterConfigurationIsNormalized();
testMissingMasterConfigurationFailsSafely();
testConfiguredActiveMasterIsAllowed();
testRegularUserIsDenied();
testDisabledConfiguredMasterIsDenied();
testInvalidConfiguredEmailsAreIgnored();

function testMasterConfigurationIsNormalized(): void {
  assertDeepEqual(
    listConfiguredMasterEmails(configuredMasterEnv),
    ["master@solverfin.example.invalid", "outro-master@solverfin.example.invalid"],
    "master email configuration should be normalized",
  );
}

function testMissingMasterConfigurationFailsSafely(): void {
  assertEqual(
    isMasterUser(masterUser, { env: {} }),
    false,
    "missing master configuration should not grant admin access",
  );

  assertAuthError(
    () => requireMasterUser(masterUser, { env: {} }),
    "AUTH_ADMIN_REQUIRED",
    "missing master configuration should deny access",
  );
}

function testConfiguredActiveMasterIsAllowed(): void {
  assertEqual(
    isMasterUser(masterUser, { env: configuredMasterEnv }),
    true,
    "configured active master should be recognized",
  );
  assertEqual(
    requireMasterUser(masterUser, { env: configuredMasterEnv }).id,
    masterUser.id,
    "configured active master should pass the guard",
  );
}

function testRegularUserIsDenied(): void {
  assertEqual(
    isMasterUser(regularUser, { env: configuredMasterEnv }),
    false,
    "regular user should not be recognized as master",
  );
  assertAuthError(
    () => requireMasterUser(regularUser, { env: configuredMasterEnv }),
    "AUTH_ADMIN_REQUIRED",
    "regular user should be denied",
  );
}

function testDisabledConfiguredMasterIsDenied(): void {
  assertEqual(
    isMasterUser(disabledMasterUser, { env: configuredMasterEnv }),
    false,
    "disabled configured master should be denied",
  );
  assertAuthError(
    () => requireMasterUser(disabledMasterUser, { env: configuredMasterEnv }),
    "AUTH_ADMIN_REQUIRED",
    "disabled configured master should be denied by the guard",
  );
}

function testInvalidConfiguredEmailsAreIgnored(): void {
  assertDeepEqual(
    listConfiguredMasterEmails({
      [MASTER_EMAILS_ENV_KEY]: "master@solverfin.example.invalid,invalid,email-sem-dominio@",
    }),
    ["master@solverfin.example.invalid"],
    "invalid configured emails should be ignored",
  );
}

function assertAuthError(
  action: () => void,
  expectedCode: AuthError["code"],
  message: string,
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof AuthError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
