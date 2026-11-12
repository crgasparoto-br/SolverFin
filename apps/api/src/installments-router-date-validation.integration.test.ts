import assert from "node:assert/strict";

import { closePool } from "./db.js";
import { handleInstallmentsApiRequest } from "./installments-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  const token = await loginAndReadToken();
  const invalidDates = ["2026-02-31", "2026-00-10", "2026-13-10", "2026-07-00"];

  for (const date of invalidDates) {
    await assertInvalidFilter(token, `operationalFrom=${date}`);
    await assertInvalidFilter(token, `operationalTo=${date}`);
  }
}

async function assertInvalidFilter(token: string, query: string): Promise<void> {
  const response = await request(token, `/api/installments?${query}`);
  assert.equal(response.statusCode, 400, query);
  assert.equal(readErrorCode(response), "INSTALLMENTS_FILTER_INVALID", query);
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

async function request(token: string, path: string): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method: "GET",
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body: undefined,
  };

  return (
    (await handleInstallmentsApiRequest(request)) ?? {
      statusCode: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { error: { code: "API_ROUTE_NOT_FOUND" } },
    }
  );
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}
