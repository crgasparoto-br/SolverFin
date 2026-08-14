import { resolveApplicationOrigin } from "@solverfin/shared";

import { AuthError } from "./auth.js";
import { isLocalEnvironment, readSessionCookie } from "./session-cookie.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOCAL_CONFIGURED_ORIGIN_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "0.0.0.0",
  "[::]",
]);

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

  if (!expected || !received || !originsMatch(expected, received, env)) {
    throw new AuthError(
      "AUTH_REQUEST_ORIGIN_INVALID",
      "Não foi possível validar a origem desta solicitação.",
      403,
    );
  }
}

function originsMatch(
  expected: string,
  received: string,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (received === expected) return true;
  if (!isLocalEnvironment(env)) return false;

  const expectedUrl = new URL(expected);
  const receivedUrl = new URL(received);

  if (!LOCAL_CONFIGURED_ORIGIN_HOSTNAMES.has(expectedUrl.hostname.toLowerCase())) {
    return false;
  }

  // Local development is frequently exposed through LAN addresses, container hosts,
  // port forwarding or HTTPS tunnels while APP_ORIGIN intentionally remains localhost.
  // Require a valid browser web origin, but never apply this compatibility path outside
  // development/local/test or when APP_ORIGIN itself is non-local.
  return receivedUrl.protocol === "http:" || receivedUrl.protocol === "https:";
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
