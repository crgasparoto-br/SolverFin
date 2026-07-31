import { resolveApplicationOrigin } from "@solverfin/shared";

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

  const expected = normalizeOrigin(env.APP_ORIGIN, env);
  const received = normalizeOrigin(input.headers.origin, env);

  if (!expected || !received || received !== expected) {
    throw new AuthError(
      "AUTH_REQUEST_ORIGIN_INVALID",
      "Não foi possível validar a origem desta solicitação.",
      403,
    );
  }
}

function normalizeOrigin(
  value: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    return resolveApplicationOrigin(value.trim(), {
      key: "Origin",
      allowHttp: isLocalEnvironment(env),
    });
  } catch {
    return undefined;
  }
}
