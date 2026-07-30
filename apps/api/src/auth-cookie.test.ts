import assert from "node:assert/strict";

import { AuthError } from "./auth.js";
import { startOidcLogin, validateInternalReturnTo } from "./oidc-flow.js";
import { assertTrustedMutationOrigin } from "./request-origin.js";
import { clearSessionCookie, readSessionCookie, serializeSessionCookie } from "./session-cookie.js";

const productiveEnv = {
  NODE_ENV: "production",
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

validatesProductiveCookieContract();
validatesOriginContract();
validatesReturnToContract();
await createsBackendControlledOidcAttempt();

function validatesProductiveCookieContract(): void {
  const expiresAt = new Date("2026-07-30T18:00:00.000Z");
  const now = new Date("2026-07-30T17:00:00.000Z");
  const token = "A".repeat(43);
  const cookie = serializeSessionCookie(token, expiresAt, productiveEnv, now);

  assert.match(cookie, /^__Host-solverfin_session=/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=3600/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(readSessionCookie(cookie, productiveEnv), token);
  assert.match(clearSessionCookie(productiveEnv), /Max-Age=0/);

  const localCookie = serializeSessionCookie(token, expiresAt, { NODE_ENV: "test" }, now);
  assert.match(localCookie, /^solverfin_session=/);
  assert.doesNotMatch(localCookie, /Secure/);
}

function validatesOriginContract(): void {
  assert.doesNotThrow(() =>
    assertTrustedMutationOrigin({
      method: "POST",
      headers: {
        cookie: `__Host-solverfin_session=${"B".repeat(43)}`,
        origin: productiveEnv.APP_ORIGIN,
      },
      env: productiveEnv,
    }),
  );

  assert.throws(
    () =>
      assertTrustedMutationOrigin({
        method: "DELETE",
        headers: { cookie: `__Host-solverfin_session=${"B".repeat(43)}` },
        env: productiveEnv,
      }),
    (error) => error instanceof AuthError && error.code === "AUTH_ORIGIN_NOT_ALLOWED",
  );
}

function validatesReturnToContract(): void {
  assert.equal(validateInternalReturnTo("/dashboard?mes=2026-07"), "/dashboard?mes=2026-07");

  for (const invalid of [
    "https://evil.example/",
    "//evil.example/",
    "/dashboard#token",
    "javascript:alert(1)",
    "/\\evil",
  ]) {
    assert.throws(
      () => validateInternalReturnTo(invalid),
      (error) => error instanceof AuthError && error.code === "AUTH_OIDC_ATTEMPT_INVALID",
    );
  }
}

async function createsBackendControlledOidcAttempt(): Promise<void> {
  const captured: { text?: string; params?: readonly unknown[] } = {};
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const result = await startOidcLogin("/dashboard", {
      env: productiveEnv,
      now: new Date("2026-07-30T17:00:00.000Z"),
      executeQuery: async (text, params) => {
        captured.text = text;
        if (params !== undefined) captured.params = params;
        return [];
      },
    });
    const location = new URL(result.location);

    assert.equal(location.searchParams.get("response_type"), "code");
    assert.equal(location.searchParams.get("code_challenge_method"), "S256");
    assert.equal(location.searchParams.get("scope"), "openid email profile");
    assert.ok(location.searchParams.get("state"));
    assert.ok(location.searchParams.get("nonce"));
    assert.ok(location.searchParams.get("code_challenge"));
    assert.match(captured.text ?? "", /insert into "OidcLoginAttempt"/);

    const params = captured.params ?? [];
    const state = location.searchParams.get("state") ?? "";
    const nonce = location.searchParams.get("nonce") ?? "";
    assert.equal(params.includes(state), false);
    assert.equal(params.includes(nonce), false);
    assert.notEqual(params[3], state);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}
