import { createHash, randomUUID } from "node:crypto";

import {
  AuthError,
  createAuthService,
  getBearerSessionId,
  type AuthUserCredentials,
  type AuthenticatedUser,
  type LoginInput,
  type LoginResult,
} from "./auth.js";
import { query, withTransaction } from "./db.js";
import {
  validateOidcIdToken,
  validateOidcState,
  type OidcIdentity,
  type OidcProviderConfig,
  type OidcValidationOptions,
} from "./oidc.js";

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
  users: [
    {
      user: demoUser,
      passwordHash: DEMO_PASSWORD_HASH,
    },
  ],
  verifyPassword: ({ password, passwordHash }) => hashPassword(password) === passwordHash,
  createSessionId: () => `sf_${randomUUID()}`,
  sessionTtlMs: resolveSessionTtlMs(),
});

export async function authenticateUser(input: LoginInput): Promise<LoginResult> {
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
  validateOidcState(input.state, input.expectedState);

  const env = options.env ?? process.env;
  const config = resolveOidcProviderConfig(env);
  const validateIdToken = options.validateIdToken ?? validateOidcIdToken;
  const validationOptions: OidcValidationOptions = {};

  if (options.now) {
    validationOptions.now = options.now;
  }

  if (options.fetchJwks) {
    validationOptions.fetchJwks = options.fetchJwks;
  }

  const identity = await validateIdToken(input.idToken, config, validationOptions);

  return signInExternalIdentity(identity);
}

export async function registerUser(input: RegisterUserInput): Promise<LoginResult> {
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
    if (error instanceof AuthError) {
      throw error;
    }

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
): Promise<AuthenticatedUser> {
  const token = getBearerSessionId(headers.authorization);

  if (!token) {
    await auditSecurityEvent({ action: "session_missing", result: "denied" });
    throw new AuthError("AUTH_SESSION_REQUIRED", "Authentication session is required.", 401);
  }

  const persisted = await findPersistedSession(token);

  if (!persisted) {
    return auth.requireAuthenticatedRequest(headers);
  }

  return validatePersistedSession(token, persisted);
}

export async function logoutSession(sessionToken: string): Promise<void> {
  auth.logout(sessionToken);

  if (!process.env.DATABASE_URL) {
    return;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const now = new Date();

  try {
    const rows = await query<{ id: string; userId: string }>(
      `update "ApplicationSession"
       set "revokedAt" = coalesce("revokedAt", $2),
           "revocationReason" = coalesce("revocationReason", 'logout')
       where "tokenHash" = $1
       returning "id", "userId"`,
      [tokenHash, now],
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
    if (!isMissingPersistentSessionStorage(error)) {
      throw error;
    }
  }
}

export async function revokeAllUserSessions(
  userId: string,
  reason = "user_revocation",
): Promise<number> {
  if (!process.env.DATABASE_URL) {
    return 0;
  }

  const now = new Date();

  try {
    const rows = await query<{ id: string }>(
      `update "ApplicationSession"
       set "revokedAt" = $2,
           "revocationReason" = $3
       where "userId" = $1 and "revokedAt" is null
       returning "id"`,
      [userId, now, reason],
    );

    await auditSecurityEvent({
      action: "sessions_revoked",
      result: "success",
      userId,
      metadata: { count: rows.length, reason },
    });

    return rows.length;
  } catch (error) {
    if (isMissingPersistentSessionStorage(error)) {
      return 0;
    }

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

export function assertDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env)) {
    return;
  }

  throw new Error(
    "Demo authentication is blocked outside local/test environments. Configure production authentication or set AUTH_ALLOW_DEMO=true only for an explicit non-production demo.",
  );
}

export function assertAuthenticationModeConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env) || isProductiveOidcAuthConfigured(env)) {
    return;
  }

  throw new Error(
    "Authentication is not configured for this environment. Configure OIDC_ISSUER_URL, OIDC_AUDIENCE and OIDC_JWKS_URI, or set AUTH_ALLOW_DEMO=true only for an explicit non-production demo.",
  );
}

export function isDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();

  if (LOCAL_DEMO_ENVIRONMENTS.has(nodeEnv)) {
    return true;
  }

  return (env.AUTH_ALLOW_DEMO ?? "").trim().toLowerCase() === "true";
}

export function isProductiveOidcAuthConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(readEnv(env, "OIDC_ISSUER_URL") && readEnv(env, "OIDC_AUDIENCE") && readEnv(env, "OIDC_JWKS_URI"));
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
  if (!process.env.DATABASE_URL) {
    return result;
  }

  const sessionId = randomUUID();
  const now = new Date();

  try {
    await query(
      `insert into "ApplicationSession"
       ("id", "userId", "tokenHash", "createdAt", "lastSeenAt", "expiresAt")
       values ($1, $2, $3, $4, $4, $5)`,
      [sessionId, result.user.id, hashSessionToken(result.session.id), now, result.session.expiresAt],
    );
    await auditSecurityEvent({
      action: auditAction,
      result: "success",
      userId: result.user.id,
      sessionId,
    });
  } catch (error) {
    if (!isMissingPersistentSessionStorage(error) && !isForeignKeyViolation(error)) {
      throw error;
    }
  }

  return result;
}

async function findPersistedSession(token: string): Promise<PersistedSessionRow | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

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
    if (isMissingPersistentSessionStorage(error)) {
      return undefined;
    }

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

async function auditSecurityEvent(options: {
  action: string;
  result: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

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
    if (!isMissingPersistentSessionStorage(error) && !isForeignKeyViolation(error)) {
      throw error;
    }
  }
}

async function signInExternalIdentity(identity: OidcIdentity): Promise<LoginResult> {
  const email = identity.email ? normalizeEmail(identity.email) : "";
  const displayName = normalizeDisplayName(identity.displayName ?? email);

  if (!isValidEmail(email) || displayName.length === 0) {
    throw invalidCredentialsError();
  }

  const user = await withTransaction(async (executeQuery) => {
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

    return { id: userId, email, displayName, status: "active" as const };
  });

  const externalPassword = createExternalPasswordSentinel(user.id);
  auth.upsertUserCredentials({ user, passwordHash: hashPassword(externalPassword) });

  return persistLoginSession(auth.login({ email: user.email, password: externalPassword }), "login_success");
}

async function updateExternalUserSnapshot(
  executeQuery: typeof query,
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
  executeQuery: typeof query,
  userId: string,
  displayName: string,
): Promise<void> {
  const activeProfiles = await executeQuery<{ id: string }>(
    `select "id" from "FinancialProfile"
     where "ownerUserId" = $1 and "status" = 'ACTIVE'
     limit 1`,
    [userId],
  );

  if (activeProfiles.length > 0) {
    return;
  }

  await createInitialFinancialProfile(executeQuery, userId, displayName);
}

async function createInitialFinancialProfile(
  executeQuery: typeof query,
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
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

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

function resolveOidcProviderConfig(env: Readonly<Record<string, string | undefined>>): OidcProviderConfig {
  const issuer = readEnv(env, "OIDC_ISSUER_URL");
  const audience = readEnv(env, "OIDC_AUDIENCE");
  const jwksUri = readEnv(env, "OIDC_JWKS_URI");

  if (!issuer || !audience || !jwksUri) {
    throw new Error("OIDC_ISSUER_URL, OIDC_AUDIENCE and OIDC_JWKS_URI are required for productive authentication.");
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
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23503"
  );
}

function isMissingPersistentSessionStorage(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}

function resolveSessionTtlMs(): number {
  return resolvePositiveMinutes("AUTH_SESSION_TTL_MINUTES", DEFAULT_SESSION_TTL_MINUTES) * 60 * 1000;
}

function resolveSessionIdleTimeoutMs(): number {
  return (
    resolvePositiveMinutes("AUTH_SESSION_IDLE_TIMEOUT_MINUTES", DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES) *
    60 *
    1000
  );
}

function resolvePositiveMinutes(key: string, fallback: number): number {
  const value = Number(process.env[key] ?? fallback);

  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function readEnv(env: Readonly<Record<string, string | undefined>>, key: string): string | undefined {
  const value = env[key]?.trim();

  return value ? value : undefined;
}
