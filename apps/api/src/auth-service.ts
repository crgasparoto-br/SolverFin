import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  AuthError,
  createAuthService,
  getBearerSessionId,
  type AuthUserCredentials,
  type AuthenticatedUser,
  type LoginInput,
  type LoginResult,
} from "./auth.js";
import { query, withTransaction, type QueryExecutor } from "./db.js";
import {
  validateOidcIdToken,
  validateOidcState,
  type OidcIdentity,
  type OidcProviderConfig,
  type OidcValidationOptions,
} from "./oidc.js";
import { readSessionCookie } from "./session-cookie.js";

const DEMO_PASSWORD_HASH = "c3fe12298b006ad7e54d9dac3006a98f406506a78e3100ca831c0f96c43f5b60";
const LOCAL_DEMO_ENVIRONMENTS = new Set(["development", "local", "test"]);
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_SESSION_TTL_MINUTES = 60;
const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;

export const demoUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo SolverFin",
  status: "active",
};

interface UserCredentialsRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  passwordHash: string;
}

interface ExternalUserRow {
  id: string;
  email: string;
  displayName: string;
  status: string;
  externalAuthProvider: string | null;
  externalAuthSubject: string | null;
}

interface PersistedSessionRow {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  email: string;
  displayName: string;
  status: string;
}

interface SecurityAuditEventInput {
  action: string;
  result: string;
  userId?: string | undefined;
  sessionId?: string | undefined;
  correlationId?: string | undefined;
  metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface RegisterUserInput extends LoginInput {
  displayName: string;
}

export interface ProductiveAuthInput {
  idToken: string;
  state: string;
  expectedState: string;
}

export interface ProductiveAuthOptions extends OidcValidationOptions {
  env?: Readonly<Record<string, string | undefined>>;
  validateIdToken?: (
    idToken: string,
    config: OidcProviderConfig,
    options?: OidcValidationOptions,
  ) => Promise<OidcIdentity>;
}

assertAuthenticationModeConfigured();

export const auth = createAuthService({
  users: [{ user: demoUser, passwordHash: DEMO_PASSWORD_HASH }],
  verifyPassword: ({ password, passwordHash }) => hashPassword(password) === passwordHash,
  createSessionId: () => `sf_${randomUUID()}`,
  sessionTtlMs: resolveSessionTtlMs(),
});

export async function authenticateUser(
  input: LoginInput,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<LoginResult> {
  assertLocalAuthAllowed(env);
  try {
    return await persistLoginSession(auth.login(input), "login_success");
  } catch (error) {
    if (!(error instanceof AuthError) || error.code !== "AUTH_INVALID_CREDENTIALS") {
      throw error;
    }
  }

  const email = normalizeEmail(input.email);

  if (email === demoUser.email) {
    await auditSecurityEvent({ action: "login_failure", result: "denied" });
    throw invalidCredentialsError();
  }

  const credentials = await findUserCredentialsByEmail(email);

  if (!credentials) {
    await auditSecurityEvent({ action: "login_failure", result: "denied" });
    throw invalidCredentialsError();
  }

  auth.upsertUserCredentials(credentials);

  try {
    return await persistLoginSession(auth.login(input), "login_success");
  } catch (error) {
    if (error instanceof AuthError && error.code === "AUTH_INVALID_CREDENTIALS") {
      await auditSecurityEvent({ action: "login_failure", result: "denied" });
    }

    throw error;
  }
}

export async function authenticateProductiveUser(
  input: ProductiveAuthInput,
  options: ProductiveAuthOptions = {},
): Promise<LoginResult> {
  const env = options.env ?? process.env;
  if (!isDemoAuthAllowed(env)) {
    await auditSecurityEvent({ action: "legacy_oidc_blocked", result: "denied" });
    throw new AuthError(
      "AUTH_LEGACY_OIDC_DISABLED",
      "Este método de autenticação não está disponível neste ambiente.",
      403,
    );
  }

  validateOidcState(input.state, input.expectedState);
  const config = resolveOidcProviderConfig(env);
  const validateIdToken = options.validateIdToken ?? validateOidcIdToken;
  const validationOptions: OidcValidationOptions = {};

  if (options.now) validationOptions.now = options.now;
  if (options.fetchJwks) validationOptions.fetchJwks = options.fetchJwks;

  const identity = await validateIdToken(input.idToken, config, validationOptions);

  return signInExternalIdentity(identity);
}

export async function registerUser(
  input: RegisterUserInput,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<LoginResult> {
  assertLocalAuthAllowed(env);
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  const password = input.password.trim();

  if (!isValidEmail(email) || displayName.length === 0 || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      "AUTH_INVALID_REGISTRATION",
      "Informe nome, email valido e senha com pelo menos 8 caracteres.",
      400,
    );
  }

  const passwordHash = hashPassword(password);
  const userId = randomUUID();

  try {
    await withTransaction(async (executeQuery) => {
      const existing = await executeQuery<{ id: string }>(
        `select "id" from "User" where lower("email") = lower($1) limit 1`,
        [email],
      );

      if (existing.length > 0) {
        throw new AuthError(
          "AUTH_USER_ALREADY_EXISTS",
          "Ja existe uma conta com esse email. Entre com a senha cadastrada.",
          409,
        );
      }

      await executeQuery(
        `insert into "User" ("id", "email", "displayName", "status", "passwordHash", "createdAt", "updatedAt")
         values ($1, $2, $3, 'ACTIVE', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, email, displayName, passwordHash],
      );
      await createInitialFinancialProfile(executeQuery, userId, displayName);
    });
  } catch (error) {
    if (error instanceof AuthError) throw error;

    if (isUniqueViolation(error)) {
      throw new AuthError(
        "AUTH_USER_ALREADY_EXISTS",
        "Ja existe uma conta com esse email. Entre com a senha cadastrada.",
        409,
      );
    }

    throw error;
  }

  auth.upsertUserCredentials({
    user: { id: userId, email, displayName, status: "active" },
    passwordHash,
  });

  return persistLoginSession(auth.login({ email, password }), "login_success");
}

export async function requireAuthenticatedRequest(
  headers: Readonly<Record<string, string | undefined>>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AuthenticatedUser> {
  const cookieToken = readSessionCookie(headers.cookie, env);
  const bearerToken = getBearerSessionId(headers.authorization);
  const token = cookieToken ?? (isDemoAuthAllowed(env) ? bearerToken : undefined);

  if (!token) {
    await auditSecurityEvent({ action: "session_missing", result: "denied" });
    throw new AuthError("AUTH_SESSION_REQUIRED", "Authentication session is required.", 401);
  }

  if (!env.DATABASE_URL) {
    if (isDemoAuthAllowed(env) && bearerToken && !cookieToken) {
      return auth.requireAuthenticatedRequest(headers);
    }

    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is unavailable.", 503);
  }

  const persisted = await findPersistedSession(token);

  if (!persisted) {
    if (isDemoAuthAllowed(env) && bearerToken && !cookieToken) {
      return auth.requireAuthenticatedRequest(headers);
    }

    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
  }

  return validatePersistedSession(token, persisted);
}

export async function renewSession(
  sessionToken: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  if (!process.env.DATABASE_URL) {
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is unavailable.", 503);
  }

  const nextToken = randomBytes(32).toString("base64url");
  const idleBoundary = new Date(now.getTime() - resolveSessionIdleTimeoutMs());
  const rows = await query<{ id: string; userId: string; expiresAt: Date }>(
    `update "ApplicationSession"
     set "tokenHash" = $2, "lastSeenAt" = $3
     where "tokenHash" = $1
       and "revokedAt" is null
       and "expiresAt" > $3
       and "lastSeenAt" > $4
     returning "id", "userId", "expiresAt"`,
    [hashSessionToken(sessionToken), hashSessionToken(nextToken), now, idleBoundary],
  );
  const session = rows[0];

  if (!session) {
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
  }

  auth.logout(sessionToken);
  await auditSecurityEvent({
    action: "session_rotated",
    result: "success",
    userId: session.userId,
    sessionId: session.id,
  });

  return { token: nextToken, expiresAt: session.expiresAt };
}

export async function logoutSession(sessionToken: string): Promise<void> {
  auth.logout(sessionToken);

  if (!process.env.DATABASE_URL) return;

  try {
    const rows = await query<{ id: string; userId: string }>(
      `update "ApplicationSession"
       set "revokedAt" = coalesce("revokedAt", $2),
           "revocationReason" = coalesce("revocationReason", 'logout')
       where "tokenHash" = $1 and "revokedAt" is null
       returning "id", "userId"`,
      [hashSessionToken(sessionToken), new Date()],
    );
    const row = rows[0];

    if (row) {
      await auditSecurityEvent({
        action: "logout",
        result: "success",
        userId: row.userId,
        sessionId: row.id,
      });
    }
  } catch (error) {
    if (!isMissingPersistentSessionStorage(error)) throw error;
  }
}

export async function revokeAllUserSessions(
  userId: string,
  reason = "user_revocation",
): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;

  try {
    const rows = await query<{ id: string }>(
      `update "ApplicationSession"
       set "revokedAt" = $2,
           "revocationReason" = $3
       where "userId" = $1 and "revokedAt" is null
       returning "id"`,
      [userId, new Date(), reason],
    );

    await auditSecurityEvent({
      action: "sessions_revoked",
      result: "success",
      userId,
      metadata: { count: rows.length, reason },
    });

    return rows.length;
  } catch (error) {
    if (isMissingPersistentSessionStorage(error)) return 0;
    throw error;
  }
}

export async function auditProfileAccessDenied(options: {
  userId?: string;
  correlationId?: string;
  reason?: string;
}): Promise<void> {
  await auditSecurityEvent({
    action: "profile_access_denied",
    result: "denied",
    userId: options.userId,
    correlationId: options.correlationId,
    metadata: options.reason ? { reason: options.reason } : undefined,
  });
}

export function assertLocalAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env)) return;

  void auditSecurityEvent({ action: "local_auth_blocked", result: "denied" }).catch(
    () => undefined,
  );
  throw new AuthError(
    "AUTH_LOCAL_AUTH_DISABLED",
    "A autenticação local não está disponível neste ambiente.",
    403,
  );
}

export function assertDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env)) return;

  throw new Error(
    "Demo authentication is blocked outside local/test environments. Configure production authentication or set AUTH_ALLOW_DEMO=true only for an explicit non-production demo.",
  );
}

export function assertAuthenticationModeConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env)) return;

  if (!isProductiveOidcAuthConfigured(env)) {
    throw new Error(
      "Authentication is not configured for this environment. Configure the complete OIDC Authorization Code environment contract, or set AUTH_ALLOW_DEMO=true only for an explicit non-production demo.",
    );
  }

  assertProductiveOidcConfigurationIsCoherent(env);
}

export function isDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();

  if (LOCAL_DEMO_ENVIRONMENTS.has(nodeEnv)) return true;

  return (env.AUTH_ALLOW_DEMO ?? "").trim().toLowerCase() === "true";
}

export function isProductiveOidcAuthConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(
    readEnv(env, "APP_ORIGIN") &&
    readEnv(env, "OIDC_ISSUER_URL") &&
    (readEnv(env, "OIDC_CLIENT_ID") || readEnv(env, "OIDC_AUDIENCE")) &&
    readEnv(env, "OIDC_AUTHORIZATION_URL") &&
    readEnv(env, "OIDC_TOKEN_URL") &&
    readEnv(env, "OIDC_JWKS_URI") &&
    readEnv(env, "OIDC_REDIRECT_URI") &&
    readEnv(env, "OIDC_ATTEMPT_ENCRYPTION_KEY"),
  );
}

function assertProductiveOidcConfigurationIsCoherent(
  env: Readonly<Record<string, string | undefined>>,
): void {
  const appOrigin = new URL(readEnv(env, "APP_ORIGIN") as string);
  const issuer = new URL(readEnv(env, "OIDC_ISSUER_URL") as string);
  const authorizationUrl = new URL(readEnv(env, "OIDC_AUTHORIZATION_URL") as string);
  const tokenUrl = new URL(readEnv(env, "OIDC_TOKEN_URL") as string);
  const jwksUrl = new URL(readEnv(env, "OIDC_JWKS_URI") as string);
  const redirectUrl = new URL(readEnv(env, "OIDC_REDIRECT_URI") as string);
  const clientId = readEnv(env, "OIDC_CLIENT_ID") ?? readEnv(env, "OIDC_AUDIENCE");
  const audience = readEnv(env, "OIDC_AUDIENCE");
  const key = Buffer.from(readEnv(env, "OIDC_ATTEMPT_ENCRYPTION_KEY") as string, "base64");

  const urls = [appOrigin, issuer, authorizationUrl, tokenUrl, jwksUrl, redirectUrl];
  if (urls.some((url) => url.protocol !== "https:" || url.username || url.password)) {
    throw new Error("Productive authentication URLs must use HTTPS without embedded credentials.");
  }

  if (issuer.hostname !== "cognito-idp.sa-east-1.amazonaws.com") {
    throw new Error("OIDC_ISSUER_URL must reference the configured Cognito region sa-east-1.");
  }

  if (redirectUrl.origin !== appOrigin.origin) {
    throw new Error("OIDC_REDIRECT_URI must use the same origin configured in APP_ORIGIN.");
  }

  if (authorizationUrl.origin !== tokenUrl.origin) {
    throw new Error("OIDC authorization and token endpoints must use the same login domain.");
  }

  if (!clientId || (audience && audience !== clientId)) {
    throw new Error(
      "OIDC_AUDIENCE must match OIDC_CLIENT_ID while the compatibility alias exists.",
    );
  }

  if (key.length !== 32) {
    throw new Error("OIDC_ATTEMPT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionInactive(lastSeenAt: Date, now = new Date()): boolean {
  return now.getTime() - lastSeenAt.getTime() >= resolveSessionIdleTimeoutMs();
}

async function persistLoginSession(
  result: LoginResult,
  auditAction: "login_success",
): Promise<LoginResult> {
  if (!process.env.DATABASE_URL) return result;

  const sessionId = randomUUID();
  const now = new Date();

  try {
    await query(
      `insert into "ApplicationSession"
       ("id", "userId", "tokenHash", "transport", "createdAt", "lastSeenAt", "expiresAt")
       values ($1, $2, $3, 'legacy_bearer', $4, $4, $5)`,
      [
        sessionId,
        result.user.id,
        hashSessionToken(result.session.id),
        now,
        result.session.expiresAt,
      ],
    );
    await auditSecurityEvent({
      action: auditAction,
      result: "success",
      userId: result.user.id,
      sessionId,
    });
  } catch (error) {
    if (!isMissingPersistentSessionStorage(error) && !isForeignKeyViolation(error)) throw error;
  }

  return result;
}

async function findPersistedSession(token: string): Promise<PersistedSessionRow | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    const rows = await query<PersistedSessionRow>(
      `select s."id", s."userId", s."createdAt", s."lastSeenAt", s."expiresAt",
              s."revokedAt", s."revocationReason",
              u."email", u."displayName", u."status"
       from "ApplicationSession" s
       inner join "User" u on u."id" = s."userId"
       where s."tokenHash" = $1
       limit 1`,
      [hashSessionToken(token)],
    );

    return rows[0];
  } catch (error) {
    if (isMissingPersistentSessionStorage(error)) return undefined;
    throw error;
  }
}

async function validatePersistedSession(
  token: string,
  session: PersistedSessionRow,
): Promise<AuthenticatedUser> {
  const now = new Date();
  const user = mapPersistedSessionUser(session);

  if (session.revokedAt !== null) {
    await auditSecurityEvent({
      action: "session_revoked_rejected",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
      metadata: session.revocationReason ? { reason: session.revocationReason } : undefined,
    });
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
  }

  if (session.expiresAt.getTime() <= now.getTime()) {
    await revokeSession(token, "expired");
    await auditSecurityEvent({
      action: "session_expired",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
    });
    throw new AuthError("AUTH_SESSION_EXPIRED", "Authentication session expired.", 401);
  }

  if (isSessionInactive(session.lastSeenAt, now)) {
    await revokeSession(token, "idle_timeout");
    await auditSecurityEvent({
      action: "session_idle_timeout",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
    });
    throw new AuthError("AUTH_SESSION_EXPIRED", "Authentication session expired.", 401);
  }

  if (user.status === "disabled") {
    await auditSecurityEvent({
      action: "user_disabled",
      result: "denied",
      userId: session.userId,
      sessionId: session.id,
    });
    throw new AuthError("AUTH_USER_DISABLED", "User is not active.", 403);
  }

  await query(
    `update "ApplicationSession"
     set "lastSeenAt" = $2
     where "id" = $1 and "revokedAt" is null`,
    [session.id, now],
  );

  auth.upsertUserCredentials({ user, passwordHash: hashPassword(`persisted:${user.id}`) });
  auth.rememberSession({
    id: token,
    userId: user.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  });

  return user;
}

async function revokeSession(token: string, reason: string): Promise<void> {
  await query(
    `update "ApplicationSession"
     set "revokedAt" = coalesce("revokedAt", $2),
         "revocationReason" = coalesce("revocationReason", $3)
     where "tokenHash" = $1`,
    [hashSessionToken(token), new Date(), reason],
  );
}

export async function auditSecurityEvent(options: SecurityAuditEventInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    await query(
      `insert into "SecurityAuditEvent"
       ("id", "userId", "sessionId", "occurredAt", "action", "result", "correlationId", "metadata")
       values ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
      [
        randomUUID(),
        options.userId ?? null,
        options.sessionId ?? null,
        options.action,
        options.result,
        options.correlationId ?? null,
        options.metadata ? JSON.stringify(options.metadata) : null,
      ],
    );
  } catch (error) {
    if (!isMissingPersistentSessionStorage(error) && !isForeignKeyViolation(error)) throw error;
  }
}

export async function resolveExternalIdentityUser(
  identity: OidcIdentity,
  executeQuery: QueryExecutor = query,
): Promise<AuthenticatedUser> {
  const email = identity.email ? normalizeEmail(identity.email) : "";
  const displayName = normalizeDisplayName(identity.displayName ?? email);

  if (!isValidEmail(email) || displayName.length === 0) throw invalidCredentialsError();

  const userByExternalIdentity = await executeQuery<ExternalUserRow>(
    `select "id", "email", "displayName", "status", "externalAuthProvider", "externalAuthSubject"
     from "User"
     where "externalAuthProvider" = $1 and "externalAuthSubject" = $2
     limit 1`,
    [identity.provider, identity.subject],
  );
  const existingExternalUser = userByExternalIdentity[0];

  if (existingExternalUser) {
    assertExternalUserIsActive(existingExternalUser);
    await updateExternalUserSnapshot(executeQuery, existingExternalUser.id, email, displayName);
    await ensureInitialFinancialProfile(executeQuery, existingExternalUser.id, displayName);
    return mapExternalUserRow({ ...existingExternalUser, email, displayName });
  }

  const userByEmail = await executeQuery<ExternalUserRow>(
    `select "id", "email", "displayName", "status", "externalAuthProvider", "externalAuthSubject"
     from "User"
     where lower("email") = lower($1)
     limit 1`,
    [email],
  );
  const existingEmailUser = userByEmail[0];

  if (existingEmailUser) {
    assertExternalUserIsActive(existingEmailUser);
    if (existingEmailUser.externalAuthProvider || existingEmailUser.externalAuthSubject) {
      throw invalidCredentialsError();
    }

    await executeQuery(
      `update "User"
       set "externalAuthProvider" = $2,
           "externalAuthSubject" = $3,
           "displayName" = $4,
           "updatedAt" = CURRENT_TIMESTAMP
       where "id" = $1`,
      [existingEmailUser.id, identity.provider, identity.subject, displayName],
    );
    await ensureInitialFinancialProfile(executeQuery, existingEmailUser.id, displayName);
    return mapExternalUserRow({ ...existingEmailUser, displayName });
  }

  const userId = randomUUID();
  await executeQuery(
    `insert into "User"
     ("id", "email", "displayName", "status", "passwordHash", "externalAuthProvider", "externalAuthSubject", "createdAt", "updatedAt")
     values ($1, $2, $3, 'ACTIVE', NULL, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [userId, email, displayName, identity.provider, identity.subject],
  );
  await createInitialFinancialProfile(executeQuery, userId, displayName);
  return { id: userId, email, displayName, status: "active" };
}

export async function createPersistentApplicationSession(
  user: AuthenticatedUser,
  executeQuery: QueryExecutor = query,
  now = new Date(),
): Promise<LoginResult & { session: LoginResult["session"] & { databaseId: string } }> {
  const databaseId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + resolveSessionTtlMs());

  await executeQuery(
    `insert into "ApplicationSession"
     ("id", "userId", "tokenHash", "transport", "createdAt", "lastSeenAt", "expiresAt")
     values ($1, $2, $3, 'cookie', $4, $4, $5)`,
    [databaseId, user.id, hashSessionToken(token), now, expiresAt],
  );

  return {
    user,
    session: { id: token, userId: user.id, createdAt: now, expiresAt, databaseId },
  };
}

async function signInExternalIdentity(identity: OidcIdentity): Promise<LoginResult> {
  const user = await withTransaction((executeQuery) =>
    resolveExternalIdentityUser(identity, executeQuery),
  );
  const externalPassword = createExternalPasswordSentinel(user.id);
  auth.upsertUserCredentials({ user, passwordHash: hashPassword(externalPassword) });
  return persistLoginSession(
    auth.login({ email: user.email, password: externalPassword }),
    "login_success",
  );
}

async function updateExternalUserSnapshot(
  executeQuery: QueryExecutor,
  userId: string,
  email: string,
  displayName: string,
): Promise<void> {
  await executeQuery(
    `update "User"
     set "email" = $2,
         "displayName" = $3,
         "updatedAt" = CURRENT_TIMESTAMP
     where "id" = $1`,
    [userId, email, displayName],
  );
}

async function ensureInitialFinancialProfile(
  executeQuery: QueryExecutor,
  userId: string,
  displayName: string,
): Promise<void> {
  const activeProfiles = await executeQuery<{ id: string }>(
    `select "id" from "FinancialProfile"
     where "ownerUserId" = $1 and "status" = 'ACTIVE'
     limit 1`,
    [userId],
  );

  if (activeProfiles.length > 0) return;

  await createInitialFinancialProfile(executeQuery, userId, displayName);
}

async function createInitialFinancialProfile(
  executeQuery: QueryExecutor,
  userId: string,
  displayName: string,
): Promise<void> {
  const organizationId = randomUUID();
  const financialProfileId = randomUUID();

  await executeQuery(
    `insert into "Organization" ("id", "ownerUserId", "name", "createdAt", "updatedAt")
     values ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [organizationId, userId, `Organizacao de ${displayName}`],
  );

  await executeQuery(
    `insert into "FinancialProfile"
     ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, 'Pessoal', 'PERSONAL', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [financialProfileId, organizationId, userId],
  );
}

async function findUserCredentialsByEmail(email: string): Promise<AuthUserCredentials | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const rows = await query<UserCredentialsRow>(
    `select "id", "email", "displayName", "status", "passwordHash"
     from "User"
     where lower("email") = lower($1) and "passwordHash" is not null
     limit 1`,
    [normalizeEmail(email)],
  );
  const row = rows[0];

  return row ? mapUserCredentialsRow(row) : undefined;
}

function mapUserCredentialsRow(row: UserCredentialsRow): AuthUserCredentials {
  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      status: row.status.toLowerCase() === "disabled" ? "disabled" : "active",
    },
    passwordHash: row.passwordHash,
  };
}

function mapExternalUserRow(row: ExternalUserRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    status: row.status.toLowerCase() === "disabled" ? "disabled" : "active",
  };
}

function mapPersistedSessionUser(row: PersistedSessionRow): AuthenticatedUser {
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    status: row.status.toLowerCase() === "disabled" ? "disabled" : "active",
  };
}

function assertExternalUserIsActive(row: ExternalUserRow): void {
  if (row.status.toLowerCase() === "disabled") {
    throw new AuthError("AUTH_USER_DISABLED", "User is not active.", 403);
  }
}

function resolveOidcProviderConfig(
  env: Readonly<Record<string, string | undefined>>,
): OidcProviderConfig {
  const issuer = readEnv(env, "OIDC_ISSUER_URL");
  const audience = readEnv(env, "OIDC_CLIENT_ID") ?? readEnv(env, "OIDC_AUDIENCE");
  const jwksUri = readEnv(env, "OIDC_JWKS_URI");

  if (!issuer || !audience || !jwksUri) {
    throw new Error(
      "OIDC_ISSUER_URL, OIDC_CLIENT_ID and OIDC_JWKS_URI are required for productive authentication.",
    );
  }

  return { issuer, audience, jwksUri };
}

function createExternalPasswordSentinel(userId: string): string {
  return `external:${userId}`;
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, 160);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function invalidCredentialsError(): AuthError {
  return new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
}

function isUniqueViolation(error: unknown): boolean {
  return hasPgCode(error, "23505");
}

function isForeignKeyViolation(error: unknown): boolean {
  return hasPgCode(error, "23503");
}

function isMissingPersistentSessionStorage(error: unknown): boolean {
  return hasPgCode(error, "42P01");
}

function hasPgCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function resolveSessionTtlMs(): number {
  return (
    resolvePositiveMinutes("AUTH_SESSION_TTL_MINUTES", DEFAULT_SESSION_TTL_MINUTES) * 60 * 1000
  );
}

function resolveSessionIdleTimeoutMs(): number {
  return (
    resolvePositiveMinutes(
      "AUTH_SESSION_IDLE_TIMEOUT_MINUTES",
      DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
    ) *
    60 *
    1000
  );
}

function resolvePositiveMinutes(key: string, fallback: number): number {
  const value = Number(process.env[key] ?? fallback);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();

  return value ? value : undefined;
}
