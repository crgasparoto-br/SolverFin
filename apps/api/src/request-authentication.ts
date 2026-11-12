import type { AuthenticatedUser } from "./auth.js";
import { isDemoAuthAllowed } from "./auth-service.js";
import { resolveCorrelationId } from "./errors.js";
import { authenticatePersistentSession } from "./persistent-session.js";
import { readSessionCookie } from "./session-cookie.js";

type CookieSessionValidator = (
  headers: Readonly<Record<string, string | undefined>>,
  env: Readonly<Record<string, string | undefined>>,
) => Promise<AuthenticatedUser>;

export async function prepareRequestAuthenticationHeaders(input: {
  headers: Readonly<Record<string, string | undefined>>;
  pathname: string;
  authHandlerPaths: ReadonlySet<string>;
  env?: Readonly<Record<string, string | undefined>>;
  validateCookieSession?: CookieSessionValidator;
}): Promise<Record<string, string | undefined>> {
  const env = input.env ?? process.env;
  const validateCookieSession =
    input.validateCookieSession ??
    ((headers, validatorEnv) =>
      authenticatePersistentSession(headers, {
        env: validatorEnv,
        correlationId: resolveCorrelationId(headers),
      }));
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
