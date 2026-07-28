import assert from "node:assert/strict";

import { handleAccountsApiRequest } from "./accounts-router.js";
import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
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
  const profile = await createProfile(token, "Perfil origem relatório");
  const otherProfile = await createProfile(token, "Outro perfil origem relatório");
  const account = await createAccount(token, profile.id, "Conta relatório issue 546");
  const otherProfileAccount = await createAccount(
    token,
    otherProfile.id,
    "Conta outro perfil issue 546",
  );
  const card = await createCard(token, profile.id, "Cartão relatório issue 546");
  const otherProfileCard = await createCard(
    token,
    otherProfile.id,
    "Cartão outro perfil issue 546",
  );

  const validAccount = await reportRequest(token, profile.id, { accountId: account.id });
  assertEmptyReport(validAccount);

  const validCard = await reportRequest(token, profile.id, { cardId: card.id });
  assertEmptyReport(validCard);

  for (const field of ["accountId", "cardId"] as const) {
    const malformed = await reportRequest(token, profile.id, { [field]: "not-a-uuid" });
    assert.equal(malformed.statusCode, 400);
    assert.equal(readError(malformed).code, "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID");
    assert.match(
      readError(malformed).message ?? "",
      field === "accountId" ? /Conta inválida/ : /Cartão inválido/,
    );
    assert.equal(hasReportPayload(malformed), false);
  }

  const combined = await reportRequest(token, profile.id, {
    accountId: account.id,
    cardId: card.id,
  });
  assert.equal(combined.statusCode, 400);
  assert.equal(readError(combined).code, "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID");
  assert.match(readError(combined).message ?? "", /somente uma conta ou um cartão/);
  assert.equal(hasReportPayload(combined), false);

  const crossProfileAccount = await reportRequest(token, profile.id, {
    accountId: otherProfileAccount.id,
  });
  const crossProfileCard = await reportRequest(token, profile.id, {
    cardId: otherProfileCard.id,
  });
  assertSafeUnavailable(crossProfileAccount);
  assertSafeUnavailable(crossProfileCard);

  const missingAccount = await reportRequest(token, profile.id, {
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  const missingCard = await reportRequest(token, profile.id, {
    cardId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assertSafeUnavailable(missingAccount);
  assertSafeUnavailable(missingCard);
  assert.equal(readError(crossProfileAccount).message, readError(missingAccount).message);
  assert.equal(readError(crossProfileCard).message, readError(missingCard).message);
  assert.equal(readError(missingAccount).message, readError(missingCard).message);

  const blocked = await apiRequest(
    token,
    "PATCH",
    `/api/credit-card-accounts/${card.id}?profileId=${profile.id}`,
    { status: "blocked" },
  );
  assert.equal(blocked.statusCode, 200);
  assertEmptyReport(await reportRequest(token, profile.id, { cardId: card.id }));

  const archivedAccount = await apiRequest(
    token,
    "POST",
    `/api/accounts/${account.id}/archive?profileId=${profile.id}`,
  );
  assert.equal(archivedAccount.statusCode, 200);
  assertSafeUnavailable(await reportRequest(token, profile.id, { accountId: account.id }));

  const archivedCard = await apiRequest(
    token,
    "POST",
    `/api/credit-card-accounts/${card.id}/archive?profileId=${profile.id}`,
  );
  assert.equal(archivedCard.statusCode, 200);
  assertSafeUnavailable(await reportRequest(token, profile.id, { cardId: card.id }));
}

async function reportRequest(
  token: string,
  profileId: string,
  source: { accountId?: string; cardId?: string },
): Promise<ApiResponse> {
  const params = new URLSearchParams({
    profileId,
    interval: "monthly",
    start: "2032-03",
    periods: "1",
    ...(source.accountId !== undefined ? { accountId: source.accountId } : {}),
    ...(source.cardId !== undefined ? { cardId: source.cardId } : {}),
  });
  return apiRequest(token, "GET", `/api/reports/category-evolution?${params.toString()}`);
}

function assertEmptyReport(response: ApiResponse): void {
  assert.equal(response.statusCode, 200);
  assert.equal(
    readBody<{ report: { currencyBlocks: unknown[] } }>(response).report.currencyBlocks.length,
    0,
  );
}

function assertSafeUnavailable(response: ApiResponse): void {
  assert.equal(response.statusCode, 404);
  assert.equal(readError(response).code, "REPORT_CATEGORY_EVOLUTION_SOURCE_NOT_AVAILABLE");
  assert.doesNotMatch(
    readError(response).message ?? "",
    /arquivad|bloquead|perfil|tenant|inexistent/i,
  );
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

async function createCard(
  token: string,
  profileId: string,
  prefix: string,
): Promise<{ id: string }> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/credit-card-accounts?profileId=${profileId}`,
    {
      name: `${prefix} ${Date.now().toString(36)}`,
      closingDay: 20,
      dueDay: 10,
      instruments: [
        {
          type: "physical",
          holder: "primary",
          name: "Principal",
          maskedIdentifier: "**** 0546",
        },
      ],
    },
  );
  assert.equal(response.statusCode, 201);
  return readBody<{ creditCardAccount: { id: string } }>(response).creditCardAccount;
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
    (await handleCreditCardAccountsApiRequest(request)) ??
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
