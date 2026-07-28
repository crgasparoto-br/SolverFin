import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleFinancialProfilesApiRequest } from "./financial-profiles-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleReportsApiRequest } from "./reports-router.js";
import {
  handleApiRequest,
  type ApiRequest,
  type ApiResponse,
} from "./router.js";

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
  const profile = await createProfile(token);

  const authorized = await apiRequest(
    token,
    "GET",
    `/api/reports/category-evolution?profileId=${profile.id}&interval=monthly&start=2031-01&periods=2`,
  );
  assert.equal(authorized.statusCode, 200);
  const authorizedBody = readBody<{
    report: { periodCount: number; currencyBlocks: unknown[] };
  }>(authorized);
  assert.equal(authorizedBody.report.periodCount, 2);
  assert.deepEqual(authorizedBody.report.currencyBlocks, []);

  const lowerYearMonthly = await apiRequest(
    token,
    "GET",
    `/api/reports/category-evolution?profileId=${profile.id}&interval=monthly&start=0001-01&periods=1`,
  );
  assert.equal(lowerYearMonthly.statusCode, 200);
  assert.equal(
    readBody<{ report: { periods: Array<{ label: string }> } }>(
      lowerYearMonthly,
    ).report.periods[0]?.label,
    "Jan/01",
  );

  const lowerYearRolling = await apiRequest(
    token,
    "GET",
    `/api/reports/category-evolution?profileId=${profile.id}&interval=rolling-year&start=0001-01&periods=1`,
  );
  assert.equal(lowerYearRolling.statusCode, 200);
  assert.equal(
    readBody<{ report: { periods: Array<{ label: string }> } }>(
      lowerYearRolling,
    ).report.periods[0]?.label,
    "Jan/01–Dez/01",
  );

  const invalidFilter = await apiRequest(
    token,
    "GET",
    `/api/reports/category-evolution?profileId=${profile.id}&interval=monthly&start=2031-01&periods=abc`,
  );
  assert.equal(invalidFilter.statusCode, 400);
  assert.equal(
    readError(invalidFilter).code,
    "REPORT_CATEGORY_EVOLUTION_FILTER_INVALID",
  );
  assert.equal(hasReportPayload(invalidFilter), false);

  const missingProfile = await apiRequest(
    token,
    "GET",
    "/api/reports/category-evolution?profileId=33333333-3333-4333-8333-999999999999&interval=monthly&start=2031-01&periods=2",
  );
  assert.equal(missingProfile.statusCode, 403);
  assert.equal(readError(missingProfile).code, "TENANT_ACCESS_DENIED");
  assert.equal(hasReportPayload(missingProfile), false);

  const archiveResponse = await apiRequest(
    token,
    "POST",
    `/api/financial-profiles/${profile.id}/archive`,
  );
  assert.equal(archiveResponse.statusCode, 200);

  const archivedProfile = await apiRequest(
    token,
    "GET",
    `/api/reports/category-evolution?profileId=${profile.id}&interval=monthly&start=2031-01&periods=2`,
  );
  assert.equal(archivedProfile.statusCode, 403);
  assert.match(readError(archivedProfile).code ?? "", /^TENANT_/);
  assert.equal(hasReportPayload(archivedProfile), false);

  const unauthenticated = await apiRequest(
    undefined,
    "GET",
    "/api/reports/category-evolution?interval=monthly&start=2031-01&periods=2",
  );
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(hasReportPayload(unauthenticated), false);
}

async function createProfile(token: string): Promise<{ id: string }> {
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const response = await apiRequest(token, "POST", "/api/financial-profiles", {
    name: `Perfil relatório público ${suffix}`,
    kind: "family",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ profile: { id: string } }>(response).profile;
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
  return (
    readBody<{ error?: { code?: string; message?: string } }>(response).error ??
    {}
  );
}

function hasReportPayload(response: Pick<ApiResponse, "body">): boolean {
  const body = readBody<Record<string, unknown>>(response);
  return Object.prototype.hasOwnProperty.call(body, "report");
}
