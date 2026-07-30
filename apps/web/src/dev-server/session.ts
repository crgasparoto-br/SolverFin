import type { IncomingMessage } from "node:http";

export const sessionCookieName = "sf_session_token";
const apiSessionCookieNames = ["__Host-solverfin_session", "solverfin_session"] as const;

export function getSessionTokenFromRequest(request: IncomingMessage): string | undefined {
  return parseCookies(request.headers.cookie ?? "")[sessionCookieName];
}

export function getSessionCredentialFromRequest(request: IncomingMessage): string | undefined {
  const cookieHeader = request.headers.cookie ?? "";
  const cookies = parseCookies(cookieHeader);

  if (apiSessionCookieNames.some((name) => Boolean(cookies[name]))) {
    return cookieHeader;
  }

  return cookies[sessionCookieName];
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
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name) cookies[name] = valueParts.join("=");
  }

  return cookies;
}
