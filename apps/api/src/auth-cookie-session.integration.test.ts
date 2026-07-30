import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

import { AuthError } from "./auth.js";
import {
  createPersistentApplicationSession,
  demoUser,
  logoutSession,
  renewSession,
  requireAuthenticatedRequest,
} from "./auth-service.js";
import { closePool, query } from "./db.js";
import { completeOidcCallback, expireOidcLoginAttempts, startOidcLogin } from "./oidc-flow.js";
import { serializeSessionCookie } from "./session-cookie.js";

const productiveEnv = {
  NODE_ENV: "production",
  DATABASE_URL: process.env.DATABASE_URL,
  APP_ORIGIN: "https://app.example.invalid",
  OIDC_ISSUER_URL: "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example",
  OIDC_CLIENT_ID: "client-123",
  OIDC_AUTHORIZATION_URL: "https://solverfin-auth.example.invalid/oauth2/authorize",
  OIDC_TOKEN_URL: "https://solverfin-auth.example.invalid/oauth2/token",
  OIDC_JWKS_URI:
    "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example/.well-known/jwks.json",
  OIDC_REDIRECT_URI: "https://app.example.invalid/api/auth/oidc/callback",
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
  await query(`delete from "SecurityAuditEvent" where "metadata"->>'test' = 'issue-551'`);
  await query(`delete from "ApplicationSession" where "userId" = $1`, [demoUser.id]);
  await query(`delete from "OidcLoginAttempt" where "issuer" = $1`, [
    productiveEnv.OIDC_ISSUER_URL,
  ]);

  await validatesSessionRotationAndRevocation();
  await validatesSuccessfulCallbackAndSingleUse();
  await validatesAttemptCancellationReplayAndExpiry();
}

async function validatesSessionRotationAndRevocation(): Promise<void> {
  const sessionNow = new Date();
  const rotationNow = new Date(sessionNow.getTime() + 60_000);
  const created = await createPersistentApplicationSession(demoUser, query, sessionNow);
  const cookie = serializeSessionCookie(
    created.session.id,
    created.session.expiresAt,
    productiveEnv,
    sessionNow,
  );
  const persisted = await query<{ tokenHash: string; transport: string }>(
    `select "tokenHash", "transport" from "ApplicationSession" where "id" = $1`,
    [created.session.databaseId],
  );

  assert.equal(persisted[0]?.transport, "cookie");
  assert.notEqual(persisted[0]?.tokenHash, created.session.id);
  assert.equal(JSON.stringify(persisted).includes(created.session.id), false);

  const authenticated = await requireAuthenticatedRequest({ cookie }, productiveEnv);
  assert.equal(authenticated.id, demoUser.id);

  const attempts = await Promise.allSettled([
    renewSession(created.session.id, rotationNow),
    renewSession(created.session.id, rotationNow),
  ]);
  const fulfilled = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<{ token: string; expiresAt: Date }> =>
      attempt.status === "fulfilled",
  );
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(
    fulfilled[0]?.value.expiresAt.toISOString(),
    created.session.expiresAt.toISOString(),
  );

  const rotated = fulfilled[0]?.value;
  assert.ok(rotated);
  await assert.rejects(
    () => requireAuthenticatedRequest({ cookie }, productiveEnv),
    (error) => error instanceof AuthError && error.code === "AUTH_SESSION_INVALID",
  );

  const rotatedCookie = serializeSessionCookie(rotated.token, rotated.expiresAt, productiveEnv);
  assert.equal(
    (await requireAuthenticatedRequest({ cookie: rotatedCookie }, productiveEnv)).id,
    demoUser.id,
  );

  await logoutSession(rotated.token);
  await logoutSession(rotated.token);

  const session = await query<{ revokedAt: Date | null; revocationReason: string | null }>(
    `select "revokedAt", "revocationReason" from "ApplicationSession" where "id" = $1`,
    [created.session.databaseId],
  );
  assert.ok(session[0]?.revokedAt);
  assert.equal(session[0]?.revocationReason, "logout");

  const logoutAudits = await query<{ count: string }>(
    `select count(*)::text as count from "SecurityAuditEvent" where "sessionId" = $1 and "action" = 'logout'`,
    [created.session.databaseId],
  );
  assert.equal(logoutAudits[0]?.count, "1");
}

async function validatesSuccessfulCallbackAndSingleUse(): Promise<void> {
  const oidcNow = new Date();
  const start = await startOidcLogin("/dashboard", {
    env: productiveEnv,
    now: oidcNow,
  });
  const authorizationUrl = new URL(start.location);
  const state = authorizationUrl.searchParams.get("state");
  const nonce = authorizationUrl.searchParams.get("nonce");
  assert.ok(state);
  assert.ok(nonce);

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...(publicKey.export({ format: "jwk" }) as unknown as Record<string, unknown>),
    kid: "issue-551-key",
    alg: "RS256",
  };
  const nowSeconds = Math.floor(oidcNow.getTime() / 1000);
  const idToken = signJwt(privateKey, jwk.kid, {
    iss: productiveEnv.OIDC_ISSUER_URL,
    sub: `issue-551-${Date.now()}`,
    aud: productiveEnv.OIDC_CLIENT_ID,
    exp: nowSeconds + 300,
    iat: nowSeconds,
    nonce,
    email: `issue-551-${Date.now()}@example.invalid`,
    name: "Issue 551 Teste",
  });
  let exchangedBody = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    exchangedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ id_token: idToken }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const callback = await completeOidcCallback(
    { state, code: "authorization-code-do-not-log" },
    {
      env: productiveEnv,
      now: oidcNow,
      fetchImpl,
      fetchJwks: async () => ({ keys: [jwk] }),
    },
  );

  assert.equal(callback.returnTo, "/dashboard");
  assert.equal(callback.login.user.displayName, "Issue 551 Teste");
  assert.match(exchangedBody, /grant_type=authorization_code/);
  assert.match(exchangedBody, /code_verifier=/);
  assert.doesNotMatch(JSON.stringify(callback), /authorization-code-do-not-log/);

  await assert.rejects(
    () =>
      completeOidcCallback(
        { state, code: "replayed-code" },
        { env: productiveEnv, fetchImpl, fetchJwks: async () => ({ keys: [jwk] }) },
      ),
    (error) => error instanceof AuthError && error.code === "AUTH_OIDC_ATTEMPT_INVALID",
  );
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

async function validatesAttemptCancellationReplayAndExpiry(): Promise<void> {
  const start = await startOidcLogin("/dashboard", {
    env: productiveEnv,
    now: new Date("2026-07-30T17:00:00.000Z"),
  });
  const state = new URL(start.location).searchParams.get("state");
  assert.ok(state);

  await assert.rejects(
    () => completeOidcCallback({ state, error: "access_denied" }, { env: productiveEnv }),
    (error) => error instanceof AuthError && error.code === "AUTH_OIDC_ATTEMPT_INVALID",
  );
  await assert.rejects(
    () => completeOidcCallback({ state, error: "access_denied" }, { env: productiveEnv }),
    (error) => error instanceof AuthError && error.code === "AUTH_OIDC_ATTEMPT_INVALID",
  );

  const cancelled = await query<{ status: string; terminalReason: string | null }>(
    `select "status", "terminalReason" from "OidcLoginAttempt" where "issuer" = $1 order by "createdAt" desc limit 1`,
    [productiveEnv.OIDC_ISSUER_URL],
  );
  assert.equal(cancelled[0]?.status, "CANCELLED");
  assert.equal(cancelled[0]?.terminalReason, "access_denied");

  await startOidcLogin("/", {
    env: productiveEnv,
    now: new Date("2026-07-30T16:00:00.000Z"),
  });
  assert.ok((await expireOidcLoginAttempts(new Date("2026-07-30T18:00:00.000Z"))) >= 1);
}
