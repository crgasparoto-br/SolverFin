import type { IncomingMessage } from "node:http";

export const sessionCookieName = "sf_session_token";
const productiveApiSessionCookieName = "__Host-solverfin_session";
const localApiSessionCookieName = "solverfin_session";
const localEnvironments = new Set(["development", "local", "test"]);

export function getSessionTokenFromRequest(request: IncomingMessage): string | undefined {
  return parseCookies(request.headers.cookie ?? "")[sessionCookieName];
}

export function getSessionCredentialFromRequest(
  request: IncomingMessage,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const cookieHeader = request.headers.cookie ?? "";
  const cookies = parseCookies(cookieHeader);

  if (isLegacyWebCredentialAllowed(env)) {
    if (cookies[productiveApiSessionCookieName] || cookies[localApiSessionCookieName]) {
      return cookieHeader;
    }

    return cookies[sessionCookieName];
  }

  return cookies[productiveApiSessionCookieName] ? cookieHeader : undefined;
}

export function buildUpstreamAuthenticationHeaders(credential: string): Record<string, string> {
  return credential.includes("=")
    ? { cookie: credential }
    : { authorization: `Bearer ${credential}` };
}

export function serializeSessionCookie(session: { token: string; expiresAt: string }): string {
  const maxAgeSeconds = Math.max(
    1,
    Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
  );

  return `${sessionCookieName}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return serializeExpiredCookie(sessionCookieName, false);
}

export function clearApiSessionCookies(): string[] {
  return [
    serializeExpiredCookie(productiveApiSessionCookieName, true),
    serializeExpiredCookie(localApiSessionCookieName, false),
  ];
}

export function isDemoAuthenticationAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv && localEnvironments.has(nodeEnv)) return true;
  return env.AUTH_ALLOW_DEMO?.trim().toLowerCase() === "true";
}

function isLegacyWebCredentialAllowed(env: Readonly<Record<string, string | undefined>>): boolean {
  return isDemoAuthenticationAllowed(env) || env.SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION === "1";
}

function serializeExpiredCookie(name: string, secure: boolean): string {
  const attributes = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name) cookies[name] = valueParts.join("=");
  }

  return cookies;
}
