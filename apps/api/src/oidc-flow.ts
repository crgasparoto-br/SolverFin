import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import { AuthError, type LoginResult } from "./auth.js";
import { auditSecurityEvent, createPersistentApplicationSession } from "./auth-service.js";
import { assertTrustedCognitoEndpoints } from "./cognito-config.js";
import { query, withTransaction, type QueryExecutor } from "./db.js";
import {
  readDisabledExternalUserContext,
  resolveProductiveExternalIdentityUser,
} from "./external-identity.js";
import { validateOidcIdToken, type JsonWebKeySet, type OidcProviderConfig } from "./oidc.js";

const DEFAULT_ATTEMPT_TTL_MINUTES = 10;
const OIDC_SCOPES = "openid email profile";
const CODE_VERIFIER_ENVELOPE_VERSION = "v1";

type OidcAttemptStatus = "PENDING" | "PROCESSING" | "CONSUMED" | "CANCELLED" | "EXPIRED" | "FAILED";

interface OidcAttemptRow {
  id: string;
  stateHash: string;
  nonceHash: string;
  encryptedCodeVerifier: string;
  issuer: string;
  returnTo: string;
  status: OidcAttemptStatus;
  version: number;
  expiresAt: Date;
}

export interface OidcRuntimeConfig extends OidcProviderConfig {
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export interface OidcStartResult {
  location: string;
  expiresAt: Date;
  state: string;
  browserBinding: string;
}

export interface OidcCallbackInput {
  state?: string;
  code?: string;
  error?: string;
  browserBinding?: string;
}

export interface OidcCallbackResult {
  login: LoginResult & {
    session: LoginResult["session"] & { databaseId: string };
  };
  returnTo: string;
}

export async function startOidcLogin(
  returnToInput: string | null | undefined,
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: Date;
    executeQuery?: QueryExecutor;
    correlationId?: string | undefined;
  } = {},
): Promise<OidcStartResult> {
  const env = options.env ?? process.env;
  const config = resolveOidcRuntimeConfig(env);
  const executeQuery = options.executeQuery ?? query;
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + resolveAttemptTtlMs(env));
  const returnTo = validateInternalReturnTo(returnToInput ?? "/");
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const browserBinding = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  await executeQuery(
    `insert into "OidcLoginAttempt"
     ("id", "stateHash", "nonceHash", "encryptedCodeVerifier", "issuer", "returnTo", "status", "version", "createdAt", "expiresAt")
     values ($1, $2, $3, $4, $5, $6, 'PENDING', 0, $7, $8)`,
    [
      randomUUID(),
      hashTransientValue(state),
      hashTransientValue(nonce),
      encryptCodeVerifier(codeVerifier, config.encryptionKey, hashTransientValue(browserBinding)),
      config.issuer,
      returnTo,
      now,
      expiresAt,
    ],
  );

  const location = new URL(config.authorizationUrl);
  location.searchParams.set("response_type", "code");
  location.searchParams.set("client_id", config.clientId);
  location.searchParams.set("redirect_uri", config.redirectUri);
  location.searchParams.set("scope", OIDC_SCOPES);
  location.searchParams.set("state", state);
  location.searchParams.set("nonce", nonce);
  location.searchParams.set("code_challenge", codeChallenge);
  location.searchParams.set("code_challenge_method", "S256");

  await auditSecurityEvent({
    action: "oidc_attempt_created",
    result: "success",
    correlationId: options.correlationId,
    metadata: { provider: "amazon_cognito", expiresAt: expiresAt.toISOString() },
  });

  return {
    location: location.toString(),
    expiresAt,
    state,
    browserBinding,
  };
}

export async function completeOidcCallback(
  input: OidcCallbackInput,
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: Date;
    fetchImpl?: typeof fetch;
    fetchJwks?: (jwksUri: string) => Promise<JsonWebKeySet>;
    correlationId?: string | undefined;
  } = {},
): Promise<OidcCallbackResult> {
  const env = options.env ?? process.env;
  const config = resolveOidcRuntimeConfig(env);
  const now = options.now ?? new Date();
  const state = requireOpaqueCallbackValue(input.state);
  const browserBinding = requireOpaqueCallbackValue(input.browserBinding);

  if (input.error) {
    await cancelOidcAttempt(state, browserBinding, normalizeProviderError(input.error), now);
    await auditSecurityEvent({
      action: "oidc_callback_cancelled",
      result: "cancelled",
      correlationId: options.correlationId,
      metadata: { reason: normalizeProviderError(input.error) },
    });
    throw invalidAttemptError();
  }

  const code = requireOpaqueCallbackValue(input.code);
  const attempt = await claimOidcAttempt(state, browserBinding, now);

  try {
    if (attempt.issuer !== config.issuer) throw invalidAttemptError();

    const codeVerifier = decryptCodeVerifier(attempt.encryptedCodeVerifier, config.encryptionKey);
    const idToken = await exchangeAuthorizationCode(
      { code, codeVerifier },
      config,
      options.fetchImpl ?? fetch,
    );
    const identity = await validateOidcIdToken(idToken, config, {
      expectedNonceHash: attempt.nonceHash,
      ...(options.fetchJwks ? { fetchJwks: options.fetchJwks } : {}),
    });

    const login = await withTransaction(async (executeQuery) => {
      const user = await resolveProductiveExternalIdentityUser(identity, executeQuery, {
        correlationId: options.correlationId,
      });
      const created = await createPersistentApplicationSession(user, executeQuery, now);
      const finalized = await executeQuery<{ id: string }>(
        `update "OidcLoginAttempt"
         set "status" = 'CONSUMED', "consumedAt" = $2, "version" = "version" + 1
         where "id" = $1 and "status" = 'PROCESSING' and "version" = $3
         returning "id"`,
        [attempt.id, now, attempt.version],
      );

      if (finalized.length !== 1) throw invalidAttemptError();

      await insertSecurityAuditEvent(executeQuery, {
        action: "session_created",
        result: "success",
        userId: user.id,
        sessionId: created.session.databaseId,
        correlationId: options.correlationId,
        metadata: { transport: "cookie" },
      });
      await insertSecurityAuditEvent(executeQuery, {
        action: "oidc_callback_consumed",
        result: "success",
        userId: user.id,
        sessionId: created.session.databaseId,
        correlationId: options.correlationId,
        metadata: { provider: "amazon_cognito" },
      });

      return created;
    });

    return { login, returnTo: attempt.returnTo };
  } catch (error) {
    await markOidcAttemptFailed(attempt.id, "callback_failed", now);
    const disabledUser = readDisabledExternalUserContext(error);
    if (disabledUser) {
      await auditSecurityEvent({
        action: "user_disabled",
        result: "denied",
        userId: disabledUser.userId,
        correlationId: options.correlationId,
        metadata: { revokedSessions: disabledUser.revokedSessions },
      }).catch(() => undefined);
    }
    await auditSecurityEvent({
      action: "oidc_callback_failed",
      result: "denied",
      correlationId: options.correlationId,
      metadata: { reason: "callback_failed" },
    });

    if (error instanceof AuthError) throw error;
    throw invalidAttemptError();
  }
}

export async function expireOidcLoginAttempts(
  now = new Date(),
  executeQuery: QueryExecutor = query,
): Promise<number> {
  const rows = await executeQuery<{ id: string }>(
    `update "OidcLoginAttempt"
     set "status" = case when "status" = 'PENDING' then 'EXPIRED'::"OidcLoginAttemptStatus" else 'FAILED'::"OidcLoginAttemptStatus" end,
         "terminalReason" = 'timeout',
         "consumedAt" = coalesce("consumedAt", $1),
         "version" = "version" + 1
     where "status" in ('PENDING', 'PROCESSING') and "expiresAt" <= $1
     returning "id"`,
    [now],
  );

  return rows.length;
}

export function validateInternalReturnTo(value: string): string {
  const normalized = value.trim();

  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("#") ||
    normalized.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    throw returnToError();
  }

  const parsed = new URL(normalized, "https://solverfin.invalid");
  if (parsed.origin !== "https://solverfin.invalid" || parsed.username || parsed.password) {
    throw returnToError();
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function resolveOidcRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OidcRuntimeConfig {
  const issuer = requireHttpsUrl(env, "OIDC_ISSUER_URL");
  const clientId = requireEnv(env, "OIDC_CLIENT_ID", env.OIDC_AUDIENCE);
  const authorizationUrl = requireHttpsUrl(env, "OIDC_AUTHORIZATION_URL");
  const tokenUrl = requireHttpsUrl(env, "OIDC_TOKEN_URL");
  const jwksUri = requireHttpsUrl(env, "OIDC_JWKS_URI");
  const redirectUri = requireHttpsUrl(env, "OIDC_REDIRECT_URI");
  const encryptionKeyValue = requireEnv(env, "OIDC_ATTEMPT_ENCRYPTION_KEY");
  const encryptionKey = Buffer.from(encryptionKeyValue, "base64");

  if (encryptionKey.length !== 32) {
    throw configurationError("OIDC_ATTEMPT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  assertTrustedCognitoEndpoints({
    appOrigin: requireHttpsUrl(env, "APP_ORIGIN"),
    issuer,
    authorizationUrl,
    tokenUrl,
    jwksUri,
    redirectUri,
    logoutUrl: env.OIDC_LOGOUT_URL,
    recoveryUrl: env.OIDC_RECOVERY_URL,
  });

  return {
    issuer,
    audience: clientId,
    clientId,
    authorizationUrl,
    tokenUrl,
    jwksUri,
    redirectUri,
    encryptionKey,
  };
}

async function claimOidcAttempt(
  state: string,
  browserBinding: string,
  now: Date,
): Promise<OidcAttemptRow> {
  const stateHash = hashTransientValue(state);
  const browserBindingHash = hashTransientValue(browserBinding);
  const rows = await query<OidcAttemptRow>(
    `update "OidcLoginAttempt"
     set "status" = 'PROCESSING', "version" = "version" + 1
     where "stateHash" = $1
       and "status" = 'PENDING'
       and "expiresAt" > $2
       and split_part("encryptedCodeVerifier", '.', 2) = $3
     returning "id", "stateHash", "nonceHash", "encryptedCodeVerifier", "issuer", "returnTo", "status", "version", "expiresAt"`,
    [stateHash, now, browserBindingHash],
  );
  const attempt = rows[0];

  if (!attempt) {
    await query(
      `update "OidcLoginAttempt"
       set "status" = 'EXPIRED', "terminalReason" = 'timeout', "consumedAt" = $2, "version" = "version" + 1
       where "stateHash" = $1
         and "status" = 'PENDING'
         and "expiresAt" <= $2
         and split_part("encryptedCodeVerifier", '.', 2) = $3`,
      [stateHash, now, browserBindingHash],
    );
    throw invalidAttemptError();
  }

  return attempt;
}

async function cancelOidcAttempt(
  state: string,
  browserBinding: string,
  reason: string,
  now: Date,
): Promise<void> {
  const rows = await query<{ id: string }>(
    `update "OidcLoginAttempt"
     set "status" = 'CANCELLED', "terminalReason" = $3, "consumedAt" = $4, "version" = "version" + 1
     where "stateHash" = $1
       and "status" = 'PENDING'
       and "expiresAt" > $4
       and split_part("encryptedCodeVerifier", '.', 2) = $2
     returning "id"`,
    [hashTransientValue(state), hashTransientValue(browserBinding), reason, now],
  );

  if (rows.length !== 1) throw invalidAttemptError();
}

async function markOidcAttemptFailed(id: string, reason: string, now: Date): Promise<void> {
  await query(
    `update "OidcLoginAttempt"
     set "status" = 'FAILED', "terminalReason" = $2, "consumedAt" = $3, "version" = "version" + 1
     where "id" = $1 and "status" = 'PROCESSING'`,
    [id, reason, now],
  ).catch(() => undefined);
}

async function exchangeAuthorizationCode(
  input: { code: string; codeVerifier: string },
  config: OidcRuntimeConfig,
  fetchImpl: typeof fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code: input.code,
    redirect_uri: config.redirectUri,
    code_verifier: input.codeVerifier,
  });
  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) throw invalidAttemptError();

  const payload = (await response.json()) as { id_token?: unknown };
  if (typeof payload.id_token !== "string" || payload.id_token.length === 0) {
    throw invalidAttemptError();
  }

  return payload.id_token;
}

async function insertSecurityAuditEvent(
  executeQuery: QueryExecutor,
  input: {
    action: string;
    result: string;
    userId?: string | undefined;
    sessionId?: string | undefined;
    correlationId?: string | undefined;
    metadata?: Readonly<Record<string, unknown>> | undefined;
  },
): Promise<void> {
  await executeQuery(
    `insert into "SecurityAuditEvent"
     ("id", "userId", "sessionId", "occurredAt", "action", "result", "correlationId", "metadata")
     values ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7)`,
    [
      randomUUID(),
      input.userId ?? null,
      input.sessionId ?? null,
      input.action,
      input.result,
      input.correlationId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

function encryptCodeVerifier(value: string, key: Buffer, browserBindingHash: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    CODE_VERIFIER_ENVELOPE_VERSION,
    browserBindingHash,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptCodeVerifier(value: string, key: Buffer): string {
  const [version, browserBindingHash, ivValue, tagValue, ciphertextValue, extra] = value.split(".");
  if (
    version !== CODE_VERIFIER_ENVELOPE_VERSION ||
    !browserBindingHash ||
    !/^[a-f0-9]{64}$/.test(browserBindingHash) ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra
  ) {
    throw invalidAttemptError();
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw invalidAttemptError();
  }
}

function hashTransientValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireOpaqueCallbackValue(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 4096) throw invalidAttemptError();
  return normalized;
}

function normalizeProviderError(value: string): string {
  return value.trim().toLowerCase() === "access_denied" ? "access_denied" : "provider_error";
}

function resolveAttemptTtlMs(env: Readonly<Record<string, string | undefined>>): number {
  const value = Number(env.OIDC_ATTEMPT_TTL_MINUTES ?? DEFAULT_ATTEMPT_TTL_MINUTES);
  const minutes =
    Number.isFinite(value) && value > 0 ? Math.min(value, 30) : DEFAULT_ATTEMPT_TTL_MINUTES;
  return minutes * 60 * 1000;
}

function requireHttpsUrl(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = requireEnv(env, key);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw configurationError(`${key} must be a valid HTTPS URL.`);
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw configurationError(`${key} must be a valid HTTPS URL without credentials.`);
  }

  return url.toString();
}

function requireEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback?: string,
): string {
  const value = env[key]?.trim() || fallback?.trim();
  if (!value) throw configurationError(`Missing required environment variable: ${key}.`);
  return value;
}

function returnToError(): AuthError {
  return new AuthError(
    "AUTH_RETURN_TO_INVALID",
    "O destino solicitado para o login não é permitido.",
    400,
  );
}

function invalidAttemptError(): AuthError {
  return new AuthError(
    "AUTH_OIDC_ATTEMPT_INVALID",
    "Não foi possível concluir a autenticação.",
    401,
  );
}

function configurationError(message: string): AuthError {
  return new AuthError("AUTH_OIDC_CONFIGURATION_INVALID", message, 503);
}
