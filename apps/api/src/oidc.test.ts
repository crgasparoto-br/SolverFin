import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";

import { AuthError } from "./auth.js";
import { validateOidcIdToken, validateOidcState, type OidcProviderConfig } from "./oidc.js";

const now = new Date("2026-06-18T12:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);
const issuer = "https://identity.example.invalid/solverfin";
const audience = "solverfin-api";
const jwksUri = "https://identity.example.invalid/solverfin/.well-known/jwks.json";
const config: OidcProviderConfig = { issuer, audience, jwksUri };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey & { kid: string; alg: string };
jwk.kid = "test-key-1";
jwk.alg = "RS256";

await validatesSignedOidcIdToken();
await rejectsInvalidAudience();
await rejectsExpiredToken();
rejectsInvalidState();

async function validatesSignedOidcIdToken(): Promise<void> {
  const token = signJwt(privateKey, {
    iss: issuer,
    sub: "provider-user-123",
    aud: audience,
    exp: nowSeconds + 300,
    iat: nowSeconds,
    email: "Pessoa@SolverFin.Example.Invalid",
    name: "Pessoa SolverFin",
  });

  const identity = await validateOidcIdToken(token, config, {
    now: () => now,
    fetchJwks: async () => ({ keys: [jwk] }),
  });

  assert.equal(identity.provider, issuer);
  assert.equal(identity.subject, "provider-user-123");
  assert.equal(identity.email, "Pessoa@SolverFin.Example.Invalid");
  assert.equal(identity.displayName, "Pessoa SolverFin");
}

async function rejectsInvalidAudience(): Promise<void> {
  const token = signJwt(privateKey, {
    iss: issuer,
    sub: "provider-user-123",
    aud: "wrong-api",
    exp: nowSeconds + 300,
  });

  await assert.rejects(
    () =>
      validateOidcIdToken(token, config, {
        now: () => now,
        fetchJwks: async () => ({ keys: [jwk] }),
      }),
    (error) => error instanceof AuthError && error.code === "AUTH_INVALID_CREDENTIALS",
  );
}

async function rejectsExpiredToken(): Promise<void> {
  const token = signJwt(privateKey, {
    iss: issuer,
    sub: "provider-user-123",
    aud: audience,
    exp: nowSeconds - 120,
  });

  await assert.rejects(
    () =>
      validateOidcIdToken(token, config, {
        now: () => now,
        fetchJwks: async () => ({ keys: [jwk] }),
      }),
    (error) => error instanceof AuthError && error.code === "AUTH_INVALID_CREDENTIALS",
  );
}

function rejectsInvalidState(): void {
  assert.throws(
    () => validateOidcState("received-state", "expected-state"),
    (error) => error instanceof AuthError && error.code === "AUTH_INVALID_CREDENTIALS",
  );
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
