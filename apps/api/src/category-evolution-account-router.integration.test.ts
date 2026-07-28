import assert from "node:assert/strict";

import { handleAccountsApiRequest } from "./accounts-router.js";
import { closePool } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleReportsApiRequest } from "./reports-router.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run the integration database before this test.",
  );

  const token = await loginAndReadToken();
  const profile = await createProfile(token, "Perfil conta relatório");
  const otherProfile = await createProfile(token, "Outro perfil conta relatório");
  const account = await createAccount(token, profile.id, "Conta relatório issue 546");
  const otherProfileAccount = await createAccount(
    token,
    otherProfile.id,
    "Conta outro perfil issue 546",
  );

  const valid = await reportRequest(token, profile.id, account.id);
  assert.equal(valid.statusCode, 200);
  assert.equal(
    readBody<{ report: { currencyBlocks: unknown[] } }>(valid).report.currencyBlocks.length,
    0,
  );

  const malformed = await reportRequest(token, profile.id, "not-a-uuid");
  assert.equal(malformed.statusCode, 400);
  assert.equal(readError(malformed).code, "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID");
  assert.match(readError(malformed).message ?? "", /Conta inválida/);
  assert.equal(hasReportPayload(malformed), false);

  const crossProfile = await reportRequest(token, profile.id, otherProfileAccount.id);
  assertSafeUnavailable(crossProfile);

  const missing = await reportRequest(token, profile.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assertSafeUnavailable(missing);
  assert.equal(readError(crossProfile).message, readError(missing).message);

  const archived = await apiRequest(
    token,
    "POST",
    `/api/accounts/${account.id}/archive?profileId=${profile.id}`,
  );
  assert.equal(archived.statusCode, 200);
  const archivedReport = await reportRequest(token, profile.id, account.id);
  assertSafeUnavailable(archivedReport);
  assert.equal(readError(archivedReport).message, readError(missing).message);
}

async function reportRequest(
  token: string,
  profileId: string,
  accountId: string,
): Promise<ApiResponse> {
  return apiRequest(
    token,
    "GET",
    `/api/reports/category-evolution?profileId=${profileId}&accountId=${accountId}&interval=monthly&start=2032-03&periods=1`,
  );
}

function assertSafeUnavailable(response: ApiResponse): void {
  assert.equal(response.statusCode, 404);
  assert.equal(readError(response).code, "REPORT_CATEGORY_EVOLUTION_ACCOUNT_NOT_AVAILABLE");
  assert.doesNotMatch(readError(response).message ?? "", /arquivada|perfil|tenant|inexistente/i);
  assert.equal(hasReportPayload(response), false);
}

async function createProfile(token: string, prefix: string): Promise<{ id: string }> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const response = await apiRequest(token, "POST", "/api/financial-profiles", {
    name: `${prefix} ${suffix}`,
    kind: "family",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ profile: { id: string } }>(response).profile;
}

async function createAccount(
  token: string,
  profileId: string,
  prefix: string,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", `/api/accounts?profileId=${profileId}`, {
    name: `${prefix} ${Date.now().toString(36)}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function apiRequest(
  token: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  };
  const response =
    (await handleFinancialProfilesApiRequest(request)) ??
    (await handleAccountsApiRequest(request)) ??
    (await handleReportsApiRequest(request)) ??
    (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled by the API router`);
  return response;
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}

function readError(response: Pick<ApiResponse, "body">): {
  code?: string;
  message?: string;
} {
  return readBody<{ error?: { code?: string; message?: string } }>(response).error ?? {};
}

function hasReportPayload(response: Pick<ApiResponse, "body">): boolean {
  const body = readBody<Record<string, unknown>>(response);
  return Object.prototype.hasOwnProperty.call(body, "report");
}
