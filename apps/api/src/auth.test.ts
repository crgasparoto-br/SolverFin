import {
  AuthError,
  createAuthService,
  getBearerSessionId,
  type AuthenticatedUser,
} from "./auth.js";

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
testLogoutInvalidatesSession();
testInvalidCredentialsAreControlled();
testDisabledUserCannotLogin();
testExpiredSessionIsRejected();
testBearerParser();

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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
