import assert from "node:assert/strict";

import { createAuthService, type AuthenticatedUser } from "./auth.js";

const user: AuthenticatedUser = {
  id: "credential-refresh-user",
  email: "credential-refresh@solverfin.example.invalid",
  displayName: "Nome Inicial",
  status: "active",
};

const auth = createAuthService({
  users: [{ user, passwordHash: "original-password" }],
  verifyPassword: ({ password, passwordHash }) => password === passwordHash,
  createSessionId: () => "credential-refresh-session",
});

auth.upsertUserCredentials({
  user: { ...user, displayName: "Nome Atualizado" },
  passwordHash: "persisted-session-sentinel",
});

const login = auth.login({
  email: user.email,
  password: "original-password",
});

assert.equal(login.user.id, user.id);
assert.equal(login.user.displayName, "Nome Atualizado");
assert.throws(
  () => auth.login({ email: user.email, password: "persisted-session-sentinel" }),
  (error) => error instanceof Error && "code" in error && error.code === "AUTH_INVALID_CREDENTIALS",
);
