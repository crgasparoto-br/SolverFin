import { createHash, randomUUID } from "node:crypto";

import { createAuthService, type AuthenticatedUser } from "./auth.js";

const DEMO_PASSWORD_HASH = "c3fe12298b006ad7e54d9dac3006a98f406506a78e3100ca831c0f96c43f5b60";

export const demoUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "demo@solverfin.example.invalid",
  displayName: "Usuario Demo SolverFin",
  status: "active",
};

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
