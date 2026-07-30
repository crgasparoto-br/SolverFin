import { AuthError } from "./auth.js";
import { isLocalEnvironment, readSessionCookie } from "./session-cookie.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertTrustedMutationOrigin(input: {
  method: string;
  headers: Readonly<Record<string, string | undefined>>;
  env?: Readonly<Record<string, string | undefined>>;
}): void {
  const env = input.env ?? process.env;
  if (SAFE_METHODS.has(input.method.toUpperCase())) return;
  if (!readSessionCookie(input.headers.cookie, env)) return;
  if (isLocalEnvironment(env) && (env.AUTH_ALLOW_MISSING_ORIGIN ?? "").toLowerCase() === "true") {
    return;
  }

  const expected = env.APP_ORIGIN?.trim();
  const received = input.headers.origin?.trim();

  if (!expected || !received || received !== expected) {
    throw new AuthError(
      "AUTH_ORIGIN_NOT_ALLOWED",
      "Não foi possível validar a origem desta solicitação.",
      403,
    );
  }
}
