import { createPublicKey, createVerify, timingSafeEqual } from "node:crypto";

import { AuthError } from "./auth.js";

export interface OidcProviderConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
  clockSkewSeconds?: number;
}

export interface OidcIdentity {
  provider: string;
  subject: string;
  email?: string;
  displayName?: string;
}

export interface OidcValidationOptions {
  now?: () => Date;
  fetchJwks?: (jwksUri: string) => Promise<JsonWebKeySet>;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtClaims {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  email?: unknown;
  name?: unknown;
  preferred_username?: unknown;
}

interface JsonWebKeySet {
  keys?: unknown;
}

interface JwkWithKid {
  kty?: string;
  kid?: string;
  alg?: string;
  [key: string]: unknown;
}

const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const SUPPORTED_ALGORITHMS = new Set(["RS256"]);

export async function validateOidcIdToken(
  idToken: string,
  config: OidcProviderConfig,
  options: OidcValidationOptions = {},
): Promise<OidcIdentity> {
  const parsed = parseJwt(idToken);
  const alg = parsed.header.alg;

  if (!alg || !SUPPORTED_ALGORITHMS.has(alg) || !parsed.header.kid) {
    throw invalidProviderTokenError();
  }

  const jwks = await (options.fetchJwks ?? fetchJwks)(config.jwksUri);
  const key = selectSigningKey(jwks, parsed.header.kid, alg);

  if (!verifyJwtSignature(idToken, key, alg)) {
    throw invalidProviderTokenError();
  }

  validateClaims(parsed.claims, config, options.now ?? (() => new Date()));

  return mapClaimsToIdentity(parsed.claims, config.issuer);
}

export function validateOidcState(receivedState: string, expectedState: string): void {
  const received = receivedState.trim();
  const expected = expectedState.trim();

  if (!received || !expected || !constantTimeEquals(received, expected)) {
    throw invalidProviderTokenError();
  }
}

function parseJwt(idToken: string): {
  header: JwtHeader;
  claims: JwtClaims;
  signingInput: string;
  signature: Buffer;
} {
  const parts = idToken.split(".");

  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw invalidProviderTokenError();
  }

  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];

  return {
    header: parseBase64UrlJson<JwtHeader>(encodedHeader),
    claims: parseBase64UrlJson<JwtClaims>(encodedClaims),
    signingInput: `${encodedHeader}.${encodedClaims}`,
    signature: Buffer.from(encodedSignature, "base64url"),
  };
}

function parseBase64UrlJson<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw invalidProviderTokenError();
  }
}

async function fetchJwks(jwksUri: string): Promise<JsonWebKeySet> {
  const response = await fetch(jwksUri, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw invalidProviderTokenError();
  }

  return (await response.json()) as JsonWebKeySet;
}

function selectSigningKey(jwks: JsonWebKeySet, kid: string, alg: string): JwkWithKid {
  const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
  const key = keys.find((candidate): candidate is JwkWithKid => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }

    const jwk = candidate as JwkWithKid;

    return jwk.kid === kid && (!jwk.alg || jwk.alg === alg);
  });

  if (!key) {
    throw invalidProviderTokenError();
  }

  return key;
}

function verifyJwtSignature(idToken: string, key: JwkWithKid, alg: string): boolean {
  const { signingInput, signature } = parseJwt(idToken);
  const publicKey = createPublicKey({ key: key as never, format: "jwk" });
  const verifier = createVerify(signatureAlgorithm(alg));

  verifier.update(signingInput);
  verifier.end();

  return verifier.verify(publicKey, signature);
}

function signatureAlgorithm(alg: string): string {
  if (alg === "RS256") {
    return "RSA-SHA256";
  }

  throw invalidProviderTokenError();
}

function validateClaims(claims: JwtClaims, config: OidcProviderConfig, now: () => Date): void {
  const skewSeconds = config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const currentSeconds = Math.floor(now().getTime() / 1000);

  if (claims.iss !== config.issuer) {
    throw invalidProviderTokenError();
  }

  if (typeof claims.sub !== "string" || claims.sub.trim().length === 0) {
    throw invalidProviderTokenError();
  }

  if (!audienceIncludes(claims.aud, config.audience)) {
    throw invalidProviderTokenError();
  }

  if (!isNumericDate(claims.exp) || claims.exp <= currentSeconds - skewSeconds) {
    throw invalidProviderTokenError();
  }

  if (
    claims.nbf !== undefined &&
    (!isNumericDate(claims.nbf) || claims.nbf > currentSeconds + skewSeconds)
  ) {
    throw invalidProviderTokenError();
  }

  if (
    claims.iat !== undefined &&
    (!isNumericDate(claims.iat) || claims.iat > currentSeconds + skewSeconds)
  ) {
    throw invalidProviderTokenError();
  }
}

function mapClaimsToIdentity(claims: JwtClaims, provider: string): OidcIdentity {
  const email = typeof claims.email === "string" ? normalizeOptional(claims.email) : undefined;
  const name = typeof claims.name === "string" ? normalizeOptional(claims.name) : undefined;
  const preferredUsername =
    typeof claims.preferred_username === "string"
      ? normalizeOptional(claims.preferred_username)
      : undefined;
  const displayName = name ?? preferredUsername;
  const identity: OidcIdentity = {
    provider,
    subject: String(claims.sub).trim(),
  };

  if (email) {
    identity.email = email;
  }

  if (displayName) {
    identity.displayName = displayName;
  }

  return identity;
}

function audienceIncludes(audience: unknown, expectedAudience: string): boolean {
  if (typeof audience === "string") {
    return audience === expectedAudience;
  }

  return Array.isArray(audience) && audience.includes(expectedAudience);
}

function isNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOptional(value: string): string | undefined {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function constantTimeEquals(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function invalidProviderTokenError(): AuthError {
  return new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid authentication provider response.");
}
