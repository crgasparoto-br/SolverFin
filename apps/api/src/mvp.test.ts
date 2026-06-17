import assert from "node:assert/strict";

import { buildDemoFinancialSummary, handleMvpApiRequest } from "./mvp.js";

loginCreatesSessionAndAllowsPrivateContracts();
invalidCredentialsUseSafeError();
privateContractsRequireSession();
summaryUsesDemoDataInMinorUnits();

function loginCreatesSessionAndAllowsPrivateContracts(): void {
  const login = handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: " DEMO@solverfin.example.invalid ",
      password: "SolverFinDemo!2026",
    },
  });

  assert.equal(login.statusCode, 201);

  const token = readToken(login.body);
  const me = handleMvpApiRequest({
    method: "GET",
    path: "/api/me",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(me.statusCode, 200);
  assert.equal(JSON.stringify(me.body).includes("SolverFinDemo!2026"), false);

  const logout = handleMvpApiRequest({
    method: "DELETE",
    path: "/api/session",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(logout.statusCode, 204);
}

function invalidCredentialsUseSafeError(): void {
  const response = handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "senha-incorreta",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(JSON.stringify(response.body).includes("demo@solverfin"), false);
  assert.equal(JSON.stringify(response.body).includes("senha-incorreta"), false);
}

function privateContractsRequireSession(): void {
  const response = handleMvpApiRequest({
    method: "GET",
    path: "/api/financial-summary",
  });

  assert.equal(response.statusCode, 401);
  assert.match(JSON.stringify(response.body), /correlationId/);
}

function summaryUsesDemoDataInMinorUnits(): void {
  const summary = buildDemoFinancialSummary();

  assert.equal(summary.currency, "BRL");
  assert.equal(Number.isInteger(summary.availableBalanceMinor), true);
  assert.equal(summary.profile.name, "Pessoal Demo");
  assert.equal(
    summary.recentItems.some((item) => item.status === "planned"),
    true,
  );
}

function readToken(body: unknown): string {
  if (!isSessionBody(body)) {
    throw new Error("Expected session token in login response.");
  }

  return body.session.token;
}

function isSessionBody(body: unknown): body is { session: { token: string } } {
  if (typeof body !== "object" || body === null || !("session" in body)) {
    return false;
  }

  const session = (body as { session?: unknown }).session;

  if (typeof session !== "object" || session === null || !("token" in session)) {
    return false;
  }

  return typeof (session as { token?: unknown }).token === "string";
}
