import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { AuthError } from "./auth.js";
import { assertTrustedCognitoEndpoints } from "./cognito-config.js";
import { startOidcLogin, validateInternalReturnTo } from "./oidc-flow.js";
import { prepareRequestAuthenticationHeaders } from "./request-authentication.js";
import { assertTrustedMutationOrigin } from "./request-origin.js";
import {
  clearOidcBindingCookie,
  clearSessionCookie,
  readOidcBindingCookie,
  readSessionCookie,
  serializeOidcBindingCookie,
  serializeSessionCookie,
} from "./session-cookie.js";

const productiveEnv = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.invalid",
  OIDC_ISSUER_URL: "https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_example",
  OIDC_CLIENT_ID: "client-123",
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

validatesProductiveCookieContract();
validatesOriginContract();
validatesReturnToContract();
validatesTrustedCognitoConfiguration();
await validatesBearerBoundary();
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

  const state = "state-for-browser-binding";
  const browserBinding = "B".repeat(43);
  const bindingCookie = serializeOidcBindingCookie(
    state,
    browserBinding,
    expiresAt,
    productiveEnv,
    now,
  );
  assert.match(bindingCookie, /^__Host-solverfin_oidc_[a-f0-9]{24}=/);
  assert.match(bindingCookie, /HttpOnly/);
  assert.match(bindingCookie, /Secure/);
  assert.match(bindingCookie, /SameSite=Lax/);
  assert.equal(readOidcBindingCookie(bindingCookie, state, productiveEnv), browserBinding);
  assert.match(clearOidcBindingCookie(state, productiveEnv), /Max-Age=0/);

  const localBindingCookie = serializeOidcBindingCookie(
    state,
    browserBinding,
    expiresAt,
    { NODE_ENV: "test" },
    now,
  );
  assert.match(localBindingCookie, /^solverfin_oidc_[a-f0-9]{24}=/);
  assert.doesNotMatch(localBindingCookie, /Secure/);
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
    (error) => error instanceof AuthError && error.code === "AUTH_REQUEST_ORIGIN_INVALID",
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
      (error) => error instanceof AuthError && error.code === "AUTH_RETURN_TO_INVALID",
    );
  }
}

function validatesTrustedCognitoConfiguration(): void {
  assert.doesNotThrow(() =>
    assertTrustedCognitoEndpoints({
      appOrigin: productiveEnv.APP_ORIGIN,
      issuer: productiveEnv.OIDC_ISSUER_URL,
      authorizationUrl: productiveEnv.OIDC_AUTHORIZATION_URL,
      tokenUrl: productiveEnv.OIDC_TOKEN_URL,
      jwksUri: productiveEnv.OIDC_JWKS_URI,
      redirectUri: productiveEnv.OIDC_REDIRECT_URI,
      logoutUrl: productiveEnv.OIDC_LOGOUT_URL,
      recoveryUrl: productiveEnv.OIDC_RECOVERY_URL,
    }),
  );

  assert.throws(
    () =>
      assertTrustedCognitoEndpoints({
        appOrigin: productiveEnv.APP_ORIGIN,
        issuer: productiveEnv.OIDC_ISSUER_URL,
        authorizationUrl: productiveEnv.OIDC_AUTHORIZATION_URL,
        tokenUrl: productiveEnv.OIDC_TOKEN_URL,
        jwksUri: "https://attacker.example.invalid/.well-known/jwks.json",
        redirectUri: productiveEnv.OIDC_REDIRECT_URI,
      }),
    (error) => error instanceof AuthError && error.code === "AUTH_OIDC_CONFIGURATION_INVALID",
  );

  assert.throws(
    () =>
      assertTrustedCognitoEndpoints({
        appOrigin: productiveEnv.APP_ORIGIN,
        issuer: productiveEnv.OIDC_ISSUER_URL,
        authorizationUrl: "https://login.example.invalid/oauth2/authorize",
        tokenUrl: "https://login.example.invalid/oauth2/token",
        jwksUri: productiveEnv.OIDC_JWKS_URI,
        redirectUri: productiveEnv.OIDC_REDIRECT_URI,
      }),
    (error) => error instanceof AuthError && error.code === "AUTH_OIDC_CONFIGURATION_INVALID",
  );
}

async function validatesBearerBoundary(): Promise<void> {
  const token = "C".repeat(43);
  const authHandlerPaths = new Set(["/api/me", "/api/session"]);
  let validations = 0;
  const validateCookieSession = async () => {
    validations += 1;
    return {
      id: "11111111-1111-4111-8111-111111111111",
      email: "demo@solverfin.example.invalid",
      displayName: "Demo",
      status: "active" as const,
    };
  };

  const stripped = await prepareRequestAuthenticationHeaders({
    headers: { authorization: `Bearer ${token}` },
    pathname: "/api/accounts",
    authHandlerPaths,
    env: productiveEnv,
    validateCookieSession,
  });
  assert.equal(stripped.authorization, undefined);
  assert.equal(validations, 0);

  const bridged = await prepareRequestAuthenticationHeaders({
    headers: { cookie: `__Host-solverfin_session=${token}` },
    pathname: "/api/accounts",
    authHandlerPaths,
    env: productiveEnv,
    validateCookieSession,
  });
  assert.equal(bridged.authorization, `Bearer ${token}`);
  assert.equal(validations, 1);

  const local = await prepareRequestAuthenticationHeaders({
    headers: { authorization: `Bearer ${token}` },
    pathname: "/api/accounts",
    authHandlerPaths,
    env: { NODE_ENV: "test" },
    validateCookieSession,
  });
  assert.equal(local.authorization, `Bearer ${token}`);
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
    assert.equal(result.state, location.searchParams.get("state"));
    assert.match(result.browserBinding, /^[A-Za-z0-9_-]{32,}$/);
    assert.match(captured.text ?? "", /insert into "OidcLoginAttempt"/);

    const params = captured.params ?? [];
    const state = location.searchParams.get("state") ?? "";
    const nonce = location.searchParams.get("nonce") ?? "";
    const encryptedEnvelope = String(params[3] ?? "");
    const browserBindingHash = createHash("sha256").update(result.browserBinding).digest("hex");

    assert.equal(params.includes(state), false);
    assert.equal(params.includes(nonce), false);
    assert.equal(params.includes(result.browserBinding), false);
    assert.equal(encryptedEnvelope.includes(result.browserBinding), false);
    assert.match(encryptedEnvelope, /^v1\.[a-f0-9]{64}\./);
    assert.equal(encryptedEnvelope.split(".")[1], browserBindingHash);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}
