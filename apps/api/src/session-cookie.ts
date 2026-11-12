import { createHash } from "node:crypto";

import { AuthError, type AuthErrorCode } from "./auth.js";

const PRODUCTIVE_COOKIE_NAME = "__Host-solverfin_session";
const LOCAL_COOKIE_NAME = "solverfin_session";
const PRODUCTIVE_OIDC_BINDING_COOKIE_PREFIX = "__Host-solverfin_oidc_";
const LOCAL_OIDC_BINDING_COOKIE_PREFIX = "solverfin_oidc_";
const LOCAL_ENVIRONMENTS = new Set(["development", "local", "test"]);

export function resolveSessionCookieName(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return isLocalEnvironment(env) ? LOCAL_COOKIE_NAME : PRODUCTIVE_COOKIE_NAME;
}

export function resolveOidcBindingCookieName(
  state: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const prefix = isLocalEnvironment(env)
    ? LOCAL_OIDC_BINDING_COOKIE_PREFIX
    : PRODUCTIVE_OIDC_BINDING_COOKIE_PREFIX;
  return `${prefix}${deriveOidcBindingCookieKey(state)}`;
}

export function readSessionCookie(
  cookieHeader: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return readCookie(cookieHeader, resolveSessionCookieName(env));
}

export function readOidcBindingCookie(
  cookieHeader: string | undefined,
  state: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return readCookie(cookieHeader, resolveOidcBindingCookieName(state, env));
}

export function serializeSessionCookie(
  token: string,
  expiresAt: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): string {
  assertOpaqueCookieValue(token, "AUTH_SESSION_INVALID");
  return serializeCookie(resolveSessionCookieName(env), token, expiresAt, env, now);
}

export function serializeOidcBindingCookie(
  state: string,
  browserBinding: string,
  expiresAt: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): string {
  assertOpaqueCookieValue(browserBinding, "AUTH_OIDC_ATTEMPT_INVALID");
  return serializeCookie(
    resolveOidcBindingCookieName(state, env),
    browserBinding,
    expiresAt,
    env,
    now,
  );
}

export function clearSessionCookie(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return clearCookie(resolveSessionCookieName(env), env);
}

export function clearOidcBindingCookie(
  state: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return clearCookie(resolveOidcBindingCookieName(state, env), env);
}

export function isLocalEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return LOCAL_ENVIRONMENTS.has((env.NODE_ENV ?? "development").trim().toLowerCase());
}

function deriveOidcBindingCookieKey(state: string): string {
  return createHash("sha256").update(state.trim()).digest("hex").slice(0, 24);
}

function readCookie(cookieHeader: string | undefined, expectedName: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;

    const name = part.slice(0, separator).trim();
    if (name !== expectedName) continue;

    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function serializeCookie(
  name: string,
  value: string,
  expiresAt: Date,
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (!isLocalEnvironment(env)) attributes.push("Secure");

  return attributes.join("; ");
}

function clearCookie(name: string, env: Readonly<Record<string, string | undefined>>): string {
  const attributes = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (!isLocalEnvironment(env)) attributes.push("Secure");

  return attributes.join("; ");
}

function assertOpaqueCookieValue(value: string, code: AuthErrorCode): void {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(value)) {
    throw new AuthError(code, "Authentication session is invalid.", 401);
  }
}
