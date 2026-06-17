import { createHash, randomUUID } from "node:crypto";

import { createAuthService, type AuthenticatedUser } from "./auth.js";

const DEMO_PASSWORD_HASH = "c3fe12298b006ad7e54d9dac3006a98f406506a78e3100ca831c0f96c43f5b60";
const LOCAL_DEMO_ENVIRONMENTS = new Set(["development", "local", "test"]);

export const demoUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo SolverFin",
  status: "active",
};

assertDemoAuthAllowed();

export const auth = createAuthService({
  users: [
    {
      user: demoUser,
      passwordHash: DEMO_PASSWORD_HASH,
    },
  ],
  verifyPassword: ({ password, passwordHash }) => hashPassword(password) === passwordHash,
  createSessionId: () => `sf_${randomUUID()}`,
  sessionTtlMs: resolveSessionTtlMs(),
});

export function assertDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (isDemoAuthAllowed(env)) {
    return;
  }

  throw new Error(
    "Demo authentication is blocked outside local/test environments. Configure production authentication or set AUTH_ALLOW_DEMO=true only for an explicit non-production demo.",
  );
}

export function isDemoAuthAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();

  if (LOCAL_DEMO_ENVIRONMENTS.has(nodeEnv)) {
    return true;
  }

  return (env.AUTH_ALLOW_DEMO ?? "").trim().toLowerCase() === "true";
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function resolveSessionTtlMs(): number {
  const ttlMinutes = Number(process.env.AUTH_SESSION_TTL_MINUTES ?? 60);

  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return 60 * 60 * 1000;
  }

  return ttlMinutes * 60 * 1000;
}
