import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for timeout recovery tests.");

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}-timeout`;
  const accountId = await createAccount(token, suffix);
  const batch = await createBatch(token, accountId, suffix);
  const suggestion = batch.suggestions[0];
  assert.ok(suggestion);

  await assert.rejects(
    approveAndLoseCommittedResponse(token, batch.importBatch.id, suggestion.id),
    /SIMULATED_TIMEOUT_AFTER_COMMIT/,
  );

  const reread = await apiRequest(token, "GET", `/api/import-batches/${batch.importBatch.id}`);
  assert.equal(reread.statusCode, 200);
  const recovered = readBody<ImportDetail>(reread).suggestions[0];
  assert.equal(recovered?.status, "approved");
  assert.ok(recovered?.transaction?.id);
  assert.equal(recovered?.targetEntityId, recovered?.transaction?.id);

  const retry = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${batch.importBatch.id}/suggestions/${suggestion.id}/approve`,
  );
  assert.equal(retry.statusCode, 200);
  const retryBody = readBody<ImportDecision>(retry);
  assert.equal(retryBody.idempotent, true);
  assert.equal(retryBody.transaction.id, recovered?.transaction?.id);

  const rows = await query<{ count: number }>(
    `select count(*)::int as "count" from "Transaction" where "aiSuggestionId" = $1`,
    [suggestion.id],
  );
  assert.equal(rows[0]?.count, 1);

  const statement = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-10-31`,
  );
  assert.equal(statement.statusCode, 200);
  assert.equal(
    readBody<{ transactions: Array<{ aiSuggestionId?: string }> }>(statement).transactions.filter(
      (transaction) => transaction.aiSuggestionId === suggestion.id,
    ).length,
    1,
  );
}

async function approveAndLoseCommittedResponse(
  token: string,
  importBatchId: string,
  suggestionId: string,
): Promise<never> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}/approve`,
  );
  assert.equal(response.statusCode, 200);
  assert.ok(readBody<ImportDecision>(response).transaction.id);
  throw new Error("SIMULATED_TIMEOUT_AFTER_COMMIT");
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta timeout ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function createBatch(
  token: string,
  accountId: string,
  suffix: string,
): Promise<ImportDetail> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `timeout-${suffix}.csv`,
    content: `date,description,amount,kind
2026-10-14,Timeout ${suffix},-14.25,expense`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  return readBody<ImportDetail>(response);
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
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  };
  const response =
    (await handleImportBatchesApiRequest(request)) ?? (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled`);
  return response;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: Array<{
    id: string;
    status: string;
    targetEntityId?: string;
    transaction?: { id: string };
  }>;
}

interface ImportDecision {
  idempotent: boolean;
  transaction: { id: string };
}
