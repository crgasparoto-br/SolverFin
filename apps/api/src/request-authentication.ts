import { isDemoAuthAllowed, requireAuthenticatedRequest } from "./auth-service.js";
import { readSessionCookie } from "./session-cookie.js";

export async function prepareRequestAuthenticationHeaders(input: {
  headers: Readonly<Record<string, string | undefined>>;
  pathname: string;
  authHandlerPaths: ReadonlySet<string>;
  env?: Readonly<Record<string, string | undefined>>;
  validateCookieSession?: typeof requireAuthenticatedRequest;
}): Promise<Record<string, string | undefined>> {
  const env = input.env ?? process.env;
  const validateCookieSession = input.validateCookieSession ?? requireAuthenticatedRequest;
  const cookieToken = readSessionCookie(input.headers.cookie, env);
  let effectiveHeaders: Record<string, string | undefined> = isDemoAuthAllowed(env)
    ? { ...input.headers }
    : { ...input.headers, authorization: undefined };

  if (cookieToken && !input.authHandlerPaths.has(input.pathname)) {
    await validateCookieSession(input.headers, env);
    effectiveHeaders = { ...effectiveHeaders, authorization: `Bearer ${cookieToken}` };
  }

  return effectiveHeaders;
}
