import {
  AuthError,
  createAuthService,
  getBearerSessionId,
  type AuthenticatedUser,
} from "./auth.js";
import {
  assertAuthenticationModeConfigured,
  assertDemoAuthAllowed,
  hashSessionToken,
  isDemoAuthAllowed,
  isProductiveOidcAuthConfigured,
  isSessionInactive,
} from "./auth-service.js";

const activeUser: AuthenticatedUser = {
  id: "user-demo-1",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo",
  status: "active",
};

const disabledUser: AuthenticatedUser = {
  id: "user-demo-2",
  email: "disabled@solverfin.example.invalid",
  displayName: "Usuario Desabilitado",
  status: "disabled",
};

let currentTime = new Date("2026-06-15T10:00:00.000Z");

const auth = createAuthService({
  users: [
    {
      user: activeUser,
      passwordHash: "demo-password",
    },
    {
      user: disabledUser,
      passwordHash: "disabled-password",
    },
  ],
  verifyPassword: ({ password, passwordHash }) => password === passwordHash,
  createSessionId: (user) => `session-${user.id}`,
  now: () => currentTime,
  sessionTtlMs: 60_000,
});

testPublicRouteAllowsAnonymousUser();
testLoginAndPrivateRoute();
testPersistedCredentialsCanBeAdded();
testLogoutInvalidatesSession();
testInvalidCredentialsAreControlled();
testDisabledUserCannotLogin();
testExpiredSessionIsRejected();
testBearerParser();
testSessionTokenHashNeverStoresRawToken();
testSessionInactivityTimeout();
testDemoAuthAllowsLocalEnvironments();
testDemoAuthBlocksProductionWithoutExplicitOptIn();
testDemoAuthRequiresExplicitOptInValue();
testProductiveOidcConfigurationAllowsNonLocalEnvironment();
testAuthenticationModeRequiresDemoOrProductiveOidc();

function testPublicRouteAllowsAnonymousUser(): void {
  const user = auth.getOptionalAuthenticatedRequest({});

  assertEqual(user, undefined, "public route should allow anonymous access");
}

function testLoginAndPrivateRoute(): void {
  const result = auth.login({
    email: " DEMO@solverfin.example.invalid ",
    password: "demo-password",
  });

  assertEqual(result.user.id, activeUser.id, "login should return the authenticated user");
  assertEqual(
    result.session.id,
    "session-user-demo-1",
    "login should create a deterministic test session",
  );

  const privateUser = auth.requireAuthenticatedRequest({
    authorization: `Bearer ${result.session.id}`,
  });

  assertEqual(privateUser.id, activeUser.id, "private route should resolve the active user");
}

function testPersistedCredentialsCanBeAdded(): void {
  auth.upsertUserCredentials({
    user: {
      id: "user-db-1",
      email: "nova@solverfin.example.invalid",
      displayName: "Nova Pessoa",
      status: "active",
    },
    passwordHash: "senha-cadastrada",
  });

  const result = auth.login({
    email: " NOVA@solverfin.example.invalid ",
    password: "senha-cadastrada",
  });

  assertEqual(result.user.id, "user-db-1", "login should use added persisted credentials");
}

function testLogoutInvalidatesSession(): void {
  const result = auth.login({
    email: activeUser.email,
    password: "demo-password",
  });

  auth.logout(result.session.id);

  assertAuthError(
    () => auth.requireAuthenticatedRequest({ authorization: `Bearer ${result.session.id}` }),
    "AUTH_SESSION_INVALID",
  );
}

function testInvalidCredentialsAreControlled(): void {
  assertAuthError(
    () =>
      auth.login({
        email: activeUser.email,
        password: "wrong-password",
      }),
    "AUTH_INVALID_CREDENTIALS",
  );
}

function testDisabledUserCannotLogin(): void {
  assertAuthError(
    () =>
      auth.login({
        email: disabledUser.email,
        password: "disabled-password",
      }),
    "AUTH_USER_DISABLED",
  );
}

function testExpiredSessionIsRejected(): void {
  currentTime = new Date("2026-06-15T11:00:00.000Z");

  const expiringAuth = createAuthService({
    users: [
      {
        user: activeUser,
        passwordHash: "demo-password",
      },
    ],
    verifyPassword: ({ password, passwordHash }) => password === passwordHash,
    createSessionId: (user) => `expiring-session-${user.id}`,
    now: () => currentTime,
    sessionTtlMs: 1_000,
  });

  const result = expiringAuth.login({
    email: activeUser.email,
    password: "demo-password",
  });

  currentTime = new Date("2026-06-15T11:00:02.000Z");

  assertAuthError(
    () =>
      expiringAuth.requireAuthenticatedRequest({
        authorization: `Bearer ${result.session.id}`,
      }),
    "AUTH_SESSION_EXPIRED",
  );

  currentTime = new Date("2026-06-15T10:00:00.000Z");
}

function testBearerParser(): void {
  assertEqual(
    getBearerSessionId("Bearer token-demo"),
    "token-demo",
    "bearer parser should return token",
  );
  assertEqual(
    getBearerSessionId("Basic token-demo"),
    undefined,
    "bearer parser should reject other schemes",
  );
  assertEqual(
    getBearerSessionId("Bearer token extra"),
    undefined,
    "bearer parser should reject extra parts",
  );
}

function testSessionTokenHashNeverStoresRawToken(): void {
  const token = "sf_test-session-token";
  const hash = hashSessionToken(token);

  assertEqual(hash.length, 64, "session token hash should use sha256 hex output");
  assertNotEqual(hash, token, "session token hash should not store the raw token");
  assertEqual(hashSessionToken(token), hash, "session token hash should be deterministic");
}

function testSessionInactivityTimeout(): void {
  const previousIdleTimeout = process.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES;
  process.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES = "30";

  try {
    assertEqual(
      isSessionInactive(new Date("2026-06-15T10:00:00.000Z"), new Date("2026-06-15T10:29:59.000Z")),
      false,
      "session should remain active before inactivity timeout",
    );
    assertEqual(
      isSessionInactive(new Date("2026-06-15T10:00:00.000Z"), new Date("2026-06-15T10:30:00.000Z")),
      true,
      "session should expire at inactivity timeout",
    );
  } finally {
    if (previousIdleTimeout === undefined) {
      delete process.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES;
    } else {
      process.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES = previousIdleTimeout;
    }
  }
}

function testDemoAuthAllowsLocalEnvironments(): void {
  assertEqual(isDemoAuthAllowed({ NODE_ENV: "development" }), true, "demo auth should allow dev");
  assertEqual(isDemoAuthAllowed({ NODE_ENV: "local" }), true, "demo auth should allow local");
  assertEqual(isDemoAuthAllowed({ NODE_ENV: "test" }), true, "demo auth should allow test");
}

function testDemoAuthBlocksProductionWithoutExplicitOptIn(): void {
  assertThrows(
    () => assertDemoAuthAllowed({ NODE_ENV: "production" }),
    /Demo authentication is blocked/,
    "demo auth should block production by default",
  );
}

function testDemoAuthRequiresExplicitOptInValue(): void {
  assertEqual(
    isDemoAuthAllowed({ AUTH_ALLOW_DEMO: "false", NODE_ENV: "production" }),
    false,
    "demo auth should reject false opt-in",
  );
  assertEqual(
    isDemoAuthAllowed({ AUTH_ALLOW_DEMO: "true", NODE_ENV: "production" }),
    true,
    "demo auth should allow explicit opt-in",
  );
}

function testProductiveOidcConfigurationAllowsNonLocalEnvironment(): void {
  const env = {
    NODE_ENV: "production",
    OIDC_ISSUER_URL: "https://identity.example.invalid/solverfin",
    OIDC_AUDIENCE: "solverfin-api",
    OIDC_JWKS_URI: "https://identity.example.invalid/solverfin/.well-known/jwks.json",
  };

  assertEqual(
    isProductiveOidcAuthConfigured(env),
    true,
    "OIDC config should enable productive auth mode",
  );
  assertAuthenticationModeConfigured(env);
}

function testAuthenticationModeRequiresDemoOrProductiveOidc(): void {
  assertThrows(
    () => assertAuthenticationModeConfigured({ NODE_ENV: "production" }),
    /Authentication is not configured/,
    "production should require OIDC config or explicit demo opt-in",
  );
}

function assertAuthError(action: () => void, expectedCode: AuthError["code"]): void {
  try {
    action();
  } catch (error) {
    if (error instanceof AuthError && error.code === expectedCode) {
      return;
    }

    throw error;
  }

  throw new Error(`Expected auth error ${expectedCode}.`);
}

function assertThrows(action: () => void, pattern: RegExp, message: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) {
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

function assertNotEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    throw new Error(`${message}. Expected values to differ.`);
  }
}
