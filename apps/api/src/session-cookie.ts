import { AuthError } from "./auth.js";

const PRODUCTIVE_COOKIE_NAME = "__Host-solverfin_session";
const LOCAL_COOKIE_NAME = "solverfin_session";
const LOCAL_ENVIRONMENTS = new Set(["development", "local", "test"]);

export function resolveSessionCookieName(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return isLocalEnvironment(env) ? LOCAL_COOKIE_NAME : PRODUCTIVE_COOKIE_NAME;
}

export function readSessionCookie(
  cookieHeader: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (!cookieHeader) return undefined;

  const expectedName = resolveSessionCookieName(env);

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

export function serializeSessionCookie(
  token: string,
  expiresAt: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): string {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    throw new AuthError("AUTH_SESSION_INVALID", "Authentication session is invalid.", 401);
  }

  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const attributes = [
    `${resolveSessionCookieName(env)}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (!isLocalEnvironment(env)) attributes.push("Secure");

  return attributes.join("; ");
}

export function clearSessionCookie(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const attributes = [
    `${resolveSessionCookieName(env)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (!isLocalEnvironment(env)) attributes.push("Secure");

  return attributes.join("; ");
}

export function isLocalEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return LOCAL_ENVIRONMENTS.has((env.NODE_ENV ?? "development").trim().toLowerCase());
}
