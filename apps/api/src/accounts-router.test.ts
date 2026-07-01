import assert from "node:assert/strict";

import { handleAccountsApiRequest } from "./accounts-router.js";
import type { ApiRequest, ApiResponse } from "./router.js";

await nonAccountsRoutesAreIgnored();
await unknownAccountsRoutesAreIgnored();
await accountsRoutesRequireAuthentication();

async function nonAccountsRoutesAreIgnored(): Promise<void> {
  const response = await handleAccountsApiRequest(buildRequest("GET", "/api/categories"));

  assert.equal(response, undefined);
}

async function unknownAccountsRoutesAreIgnored(): Promise<void> {
  const response = await handleAccountsApiRequest(
    buildRequest("GET", "/api/accounts/account-demo-1/unknown"),
  );

  assert.equal(response, undefined);
}

async function accountsRoutesRequireAuthentication(): Promise<void> {
  const response = await handleAccountsApiRequest(buildRequest("GET", "/api/accounts"));

  assert.ok(response);
  assert.equal(response.statusCode, 401);
  assert.equal(readErrorCode(response), "AUTH_SESSION_REQUIRED");
}

function buildRequest(method: string, path: string, body?: unknown): ApiRequest {
  const url = new URL(path, "http://solverfin.test");

  return {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: {},
    body,
  };
}

function readErrorCode(response: ApiResponse): string | undefined {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return (response.body as { error?: { code?: string } }).error?.code;
}
