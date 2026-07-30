import assert from "node:assert/strict";

import { resolveOidcCallbackLocation } from "./api.js";

assert.equal(
  resolveOidcCallbackLocation({
    requestPath: "/api/auth/oidc/callback",
    status: 303,
    location: "/dashboard?mes=2026-07",
    setCookies: [
      `__Host-solverfin_session=${"A".repeat(43)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ],
  }),
  "/login?auth=complete&returnTo=%2Fdashboard%3Fmes%3D2026-07",
);

assert.equal(
  resolveOidcCallbackLocation({
    requestPath: "/api/auth/oidc/callback",
    status: 303,
    location: "/login?erro=autenticacao",
    setCookies: [],
  }),
  "/login?erro=autenticacao",
);

assert.equal(
  resolveOidcCallbackLocation({
    requestPath: "/api/auth/oidc/callback",
    status: 303,
    location: "https://attacker.example.invalid/",
    setCookies: [
      `__Host-solverfin_session=${"B".repeat(43)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    ],
  }),
  "/login?erro=autenticacao",
);

assert.equal(
  resolveOidcCallbackLocation({
    requestPath: "/api/auth/oidc/start",
    status: 302,
    location: "https://provider.example.invalid/oauth2/authorize",
    setCookies: [],
  }),
  "https://provider.example.invalid/oauth2/authorize",
);
