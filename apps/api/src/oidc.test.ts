import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

import { AuthError } from "./auth.js";
import { validateOidcIdToken, validateOidcState, type OidcProviderConfig } from "./oidc.js";

interface TestJwk {
  kid: string;
  alg: string;
  [key: string]: unknown;
}

const now = new Date("2026-06-18T12:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);
const issuer = "https://identity.example.invalid/solverfin";
const audience = "solverfin-api";
const jwksUri = "https://identity.example.invalid/solverfin/.well-known/jwks.json";
const config: OidcProviderConfig = { issuer, audience, jwksUri };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as TestJwk;
jwk.kid = "test-key-1";
jwk.alg = "RS256";

await validatesSignedOidcIdToken();
await rejectsInvalidAudience();
await rejectsExpiredToken();
await rejectsMissingTokenUse();
await rejectsAccessTokenUse();
await rejectsMissingEmailVerification();
await rejectsUnverifiedEmail();
await validatesNonceHash();
rejectsInvalidState();

async function validatesSignedOidcIdToken(): Promise<void> {
  const token = signJwt(privateKey, validClaims());

  const identity = await validateOidcIdToken(token, config, validationOptions());

  assert.equal(identity.provider, issuer);
  assert.equal(identity.subject, "provider-user-123");
  assert.equal(identity.email, "Pessoa@SolverFin.Example.Invalid");
  assert.equal(identity.displayName, "Pessoa SolverFin");
}

async function rejectsInvalidAudience(): Promise<void> {
  await rejectsClaims({ aud: "wrong-api" });
}

async function rejectsExpiredToken(): Promise<void> {
  await rejectsClaims({ exp: nowSeconds - 120 });
}

async function rejectsMissingTokenUse(): Promise<void> {
  const claims = validClaims();
  delete claims.token_use;
  await rejectsToken(signJwt(privateKey, claims));
}

async function rejectsAccessTokenUse(): Promise<void> {
  await rejectsClaims({ token_use: "access" });
}

async function rejectsMissingEmailVerification(): Promise<void> {
  const claims = validClaims();
  delete claims.email_verified;
  await rejectsToken(signJwt(privateKey, claims));
}

async function rejectsUnverifiedEmail(): Promise<void> {
  await rejectsClaims({ email_verified: false });
}

function rejectsInvalidState(): void {
  assert.throws(
    () => validateOidcState("received-state", "expected-state"),
    (error) => error instanceof AuthError && error.code === "AUTH_INVALID_CREDENTIALS",
  );
}

async function validatesNonceHash(): Promise<void> {
  const nonce = "nonce-value-123";
  const nonceHash = createHash("sha256").update(nonce).digest("hex");
  const token = signJwt(privateKey, validClaims({ nonce }));

  await assert.doesNotReject(() =>
    validateOidcIdToken(token, config, {
      ...validationOptions(),
      expectedNonceHash: nonceHash,
    }),
  );

  await assert.rejects(
    () =>
      validateOidcIdToken(token, config, {
        ...validationOptions(),
        expectedNonceHash: "0".repeat(64),
      }),
    isInvalidCredentials,
  );
}

async function rejectsClaims(overrides: Record<string, unknown>): Promise<void> {
  await rejectsToken(signJwt(privateKey, validClaims(overrides)));
}

async function rejectsToken(token: string): Promise<void> {
  await assert.rejects(
    () => validateOidcIdToken(token, config, validationOptions()),
    isInvalidCredentials,
  );
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: issuer,
    sub: "provider-user-123",
    aud: audience,
    exp: nowSeconds + 300,
    iat: nowSeconds,
    token_use: "id",
    email: "Pessoa@SolverFin.Example.Invalid",
    email_verified: true,
    name: "Pessoa SolverFin",
    ...overrides,
  };
}

function validationOptions() {
  return {
    now: () => now,
    fetchJwks: async () => ({ keys: [jwk] }),
  };
}

function isInvalidCredentials(error: unknown): boolean {
  return error instanceof AuthError && error.code === "AUTH_INVALID_CREDENTIALS";
}

function signJwt(privateKeyObject: KeyObject, claims: Record<string, unknown>): string {
  const header = { alg: "RS256", kid: jwk.kid, typ: "JWT" };
  const encodedHeader = encodeBase64UrlJson(header);
  const encodedClaims = encodeBase64UrlJson(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signer = createSign("RSA-SHA256");

  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${signer.sign(privateKeyObject).toString("base64url")}`;
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
