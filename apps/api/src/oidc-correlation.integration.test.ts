import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";

import { AuthError } from "./auth.js";
import { closePool, query } from "./db.js";
import { completeOidcCallback, startOidcLogin } from "./oidc-flow.js";

const productiveEnv = {
  NODE_ENV: "production",
  DATABASE_URL: process.env.DATABASE_URL,
  APP_ORIGIN: "https://app.example.invalid",
  OIDC_ISSUER_URL: "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example",
  OIDC_CLIENT_ID: "client-123",
  OIDC_AUDIENCE: "client-123",
  OIDC_AUTHORIZATION_URL:
    "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/authorize",
  OIDC_TOKEN_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/oauth2/token",
  OIDC_JWKS_URI:
    "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example/.well-known/jwks.json",
  OIDC_REDIRECT_URI: "https://app.example.invalid/api/auth/oidc/callback",
  OIDC_LOGOUT_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/logout",
  OIDC_RECOVERY_URL: "https://solverfin-auth.auth.sa-east-1.amazoncognito.com/forgotPassword",
  OIDC_ATTEMPT_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL?.includes("solverfin_ci"));
  await successfulOidcEventsPreserveCorrelation();
  await cancelledOidcEventPreservesCorrelation();
  await disabledOidcUserIsRevokedAndCorrelated();
}

async function successfulOidcEventsPreserveCorrelation(): Promise<void> {
  const now = new Date();
  const start = await startOidcLogin("/dashboard", {
    env: productiveEnv,
    now,
    correlationId: "corr-oidc-start-success",
  });
  const authorizationUrl = new URL(start.location);
  const state = authorizationUrl.searchParams.get("state");
  const nonce = authorizationUrl.searchParams.get("nonce");
  assert.ok(state);
  assert.ok(nonce);

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as unknown as Record<string, unknown>),
    kid: "issue-551-correlation-key",
    alg: "RS256",
  };
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const suffix = randomUUID();
  const idToken = signJwt(privateKey, String(jwk.kid), {
    iss: productiveEnv.OIDC_ISSUER_URL,
    sub: `correlation-${suffix}`,
    aud: productiveEnv.OIDC_CLIENT_ID,
    exp: nowSeconds + 300,
    iat: nowSeconds,
    nonce,
    token_use: "id",
    email: `correlation-${suffix}@example.invalid`,
    email_verified: true,
    name: "Correlation Test",
  });

  const callback = await completeOidcCallback(
    {
      state,
      browserBinding: start.browserBinding,
      code: "authorization-code-redacted",
    },
    {
      env: productiveEnv,
      now,
      correlationId: "corr-oidc-callback-success",
      fetchImpl: async () =>
        new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      fetchJwks: async () => ({ keys: [jwk] }),
    },
  );

  const attemptAudit = await query<{ correlationId: string | null }>(
    `select "correlationId"
     from "SecurityAuditEvent"
     where "action" = 'oidc_attempt_created' and "correlationId" = $1
     order by "occurredAt" desc limit 1`,
    ["corr-oidc-start-success"],
  );
  assert.equal(attemptAudit[0]?.correlationId, "corr-oidc-start-success");

  const callbackAudits = await query<{ action: string; correlationId: string | null }>(
    `select "action", "correlationId"
     from "SecurityAuditEvent"
     where "sessionId" = $1
     order by "action"`,
    [callback.login.session.databaseId],
  );
  assert.deepEqual(callbackAudits, [
    { action: "oidc_callback_consumed", correlationId: "corr-oidc-callback-success" },
    { action: "session_created", correlationId: "corr-oidc-callback-success" },
  ]);
}

async function cancelledOidcEventPreservesCorrelation(): Promise<void> {
  const now = new Date();
  const start = await startOidcLogin("/", {
    env: productiveEnv,
    now,
    correlationId: "corr-oidc-start-cancel",
  });
  const state = new URL(start.location).searchParams.get("state");
  assert.ok(state);

  await assert.rejects(
    () =>
      completeOidcCallback(
        {
          state,
          browserBinding: start.browserBinding,
          error: "access_denied",
        },
        {
          env: productiveEnv,
          now,
          correlationId: "corr-oidc-cancelled",
        },
      ),
    (error) => error instanceof AuthError && error.code === "AUTH_OIDC_ATTEMPT_INVALID",
  );

  const events = await query<{ correlationId: string | null }>(
    `select "correlationId"
     from "SecurityAuditEvent"
     where "action" = 'oidc_callback_cancelled' and "correlationId" = $1
     order by "occurredAt" desc limit 1`,
    ["corr-oidc-cancelled"],
  );
  assert.equal(events[0]?.correlationId, "corr-oidc-cancelled");
}

async function disabledOidcUserIsRevokedAndCorrelated(): Promise<void> {
  const now = new Date();
  const suffix = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const sessionToken = `disabled-${suffix}`;
  const subject = `disabled-subject-${suffix}`;
  const email = `disabled-${suffix}@example.invalid`;

  await query(
    `insert into "User"
     ("id", "email", "displayName", "passwordHash", "externalAuthProvider", "externalAuthSubject", "status", "createdAt", "updatedAt")
     values ($1, $2, 'Disabled OIDC User', NULL, $3, $4, 'DISABLED', $5, $5)`,
    [userId, email, productiveEnv.OIDC_ISSUER_URL, subject, now],
  );
  await query(
    `insert into "ApplicationSession"
     ("id", "userId", "tokenHash", "transport", "createdAt", "lastSeenAt", "expiresAt")
     values ($1, $2, $3, 'cookie', $4, $4, $5)`,
    [
      sessionId,
      userId,
      createHash("sha256").update(sessionToken).digest("hex"),
      now,
      new Date(now.getTime() + 3_600_000),
    ],
  );

  const start = await startOidcLogin("/dashboard", { env: productiveEnv, now });
  const authorizationUrl = new URL(start.location);
  const state = authorizationUrl.searchParams.get("state");
  const nonce = authorizationUrl.searchParams.get("nonce");
  assert.ok(state);
  assert.ok(nonce);

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as unknown as Record<string, unknown>),
    kid: "issue-551-disabled-key",
    alg: "RS256",
  };
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const idToken = signJwt(privateKey, String(jwk.kid), {
    iss: productiveEnv.OIDC_ISSUER_URL,
    sub: subject,
    aud: productiveEnv.OIDC_CLIENT_ID,
    exp: nowSeconds + 300,
    iat: nowSeconds,
    nonce,
    token_use: "id",
    email,
    email_verified: true,
    name: "Disabled OIDC User",
  });

  await assert.rejects(
    () =>
      completeOidcCallback(
        { state, browserBinding: start.browserBinding, code: "disabled-user-code" },
        {
          env: productiveEnv,
          now,
          correlationId: "corr-disabled-oidc-user",
          fetchImpl: async () =>
            new Response(JSON.stringify({ id_token: idToken }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          fetchJwks: async () => ({ keys: [jwk] }),
        },
      ),
    (error) => error instanceof AuthError && error.code === "AUTH_USER_DISABLED",
  );

  const sessions = await query<{ revokedAt: Date | null; revocationReason: string | null }>(
    `select "revokedAt", "revocationReason" from "ApplicationSession" where "id" = $1`,
    [sessionId],
  );
  assert.ok(sessions[0]?.revokedAt);
  assert.equal(sessions[0]?.revocationReason, "user_disabled");

  const events = await query<{ correlationId: string | null }>(
    `select "correlationId"
     from "SecurityAuditEvent"
     where "userId" = $1 and "action" = 'user_disabled'
     order by "occurredAt" desc limit 1`,
    [userId],
  );
  assert.equal(events[0]?.correlationId, "corr-disabled-oidc-user");
}

function signJwt(privateKey: KeyObject, kid: string, claims: Record<string, unknown>): string {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString(
    "base64url",
  );
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
}
