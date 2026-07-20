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
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for CSV import final review integration tests.",
  );

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}-final`;
  const sourceAccountId = await createAccount(token, `Origem ${suffix}`);
  const reviewedAccountId = await createAccount(token, `Revisada ${suffix}`);
  const incomeCategoryId = await createCategory(token, suffix);

  const created = await createBatch(token, sourceAccountId, suffix);
  const manuallyReviewed = requireSuggestion(created, 0);
  const bulkSuccess = requireSuggestion(created, 1);
  const inconsistent = requireSuggestion(created, 2);

  await assertManualReviewReachesCanonicalTransaction(
    token,
    created.importBatch.id,
    manuallyReviewed.id,
    reviewedAccountId,
    incomeCategoryId,
    suffix,
  );
  await assertBulkKeepsSuccessAndMapsInconsistency(
    token,
    created.importBatch.id,
    bulkSuccess.id,
    inconsistent.id,
    sourceAccountId,
  );
}

async function createBatch(
  token: string,
  accountId: string,
  suffix: string,
): Promise<ImportDetail> {
  const content = [
    "date,description,amount,kind",
    `2026-05-31,Antes da revisao ${suffix},-1.00,expense`,
    `2026-06-21,Sucesso parcial ${suffix},-20.00,expense`,
    `2026-06-22,Inconsistente parcial ${suffix},-30.00,expense`,
  ].join("\n");
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `final-review-${suffix}.csv`,
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  const detail = readBody<ImportDetail>(response);
  assert.equal(detail.suggestions.length, 3);
  return detail;
}

async function assertManualReviewReachesCanonicalTransaction(
  token: string,
  importBatchId: string,
  suggestionId: string,
  accountId: string,
  categoryId: string,
  suffix: string,
): Promise<void> {
  const description = `Depois da revisao ${suffix}`;
  const update = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}`,
    {
      occurredOn: "2026-06-20",
      kind: "income",
      amountMinor: 5_555,
      description,
      accountId,
      categoryId,
    },
  );
  assert.equal(update.statusCode, 200);

  const approval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}/approve`,
  );
  assert.equal(approval.statusCode, 200);
  const transaction = readBody<{ transaction: TransactionRecord }>(approval).transaction;
  assert.deepEqual(
    {
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      kind: transaction.kind,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      description: transaction.description,
      occurredOn: transaction.occurredOn,
      plannedOn: transaction.plannedOn,
      effectiveOn: transaction.effectiveOn,
      source: transaction.source,
      status: transaction.status,
      importBatchId: transaction.importBatchId,
      aiSuggestionId: transaction.aiSuggestionId,
    },
    {
      accountId,
      categoryId,
      kind: "income",
      amountMinor: 5_555,
      currency: "BRL",
      description,
      occurredOn: "2026-06-20",
      plannedOn: "2026-06-20",
      effectiveOn: "2026-06-20",
      source: "import",
      status: "posted",
      importBatchId,
      aiSuggestionId: suggestionId,
    },
  );

  const statement = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-06-30`,
  );
  assert.equal(statement.statusCode, 200);
  const matches = readBody<{ transactions: TransactionRecord[] }>(statement).transactions.filter(
    (candidate) => candidate.aiSuggestionId === suggestionId,
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.id, transaction.id);
}

async function assertBulkKeepsSuccessAndMapsInconsistency(
  token: string,
  importBatchId: string,
  successfulSuggestionId: string,
  inconsistentSuggestionId: string,
  accountId: string,
): Promise<void> {
  await query(
    `update "AiSuggestion"
        set "status" = 'APPROVED', "targetEntityId" = null, "reviewedAt" = now(), "updatedAt" = now()
      where "id" = $1 and "sourceEntityId" = $2`,
    [inconsistentSuggestionId, importBatchId],
  );

  const response = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${importBatchId}/approve-selected`,
    { suggestionIds: [successfulSuggestionId, inconsistentSuggestionId] },
  );
  assert.equal(response.statusCode, 200);
  const body = readBody<BulkDecision>(response);
  assert.deepEqual(body.summary, {
    requested: 2,
    approved: 1,
    failed: 1,
    idempotent: 0,
  });
  assert.equal(
    body.results.find((item) => item.suggestionId === successfulSuggestionId)?.status,
    "approved",
  );
  assert.equal(
    body.results.find((item) => item.suggestionId === inconsistentSuggestionId)?.error?.code,
    "IMPORT_APPROVED_TRANSACTION_MISSING",
  );
  assert.equal(
    body.failures.find((item) => item.suggestionId === inconsistentSuggestionId)?.code,
    "IMPORT_APPROVED_TRANSACTION_MISSING",
  );

  const persisted = await query<{ aiSuggestionId: string }>(
    `select "aiSuggestionId" from "Transaction"
      where "importBatchId" = $1 and "aiSuggestionId" = any($2::uuid[])
      order by "aiSuggestionId" asc`,
    [importBatchId, [successfulSuggestionId, inconsistentSuggestionId]],
  );
  assert.deepEqual(
    persisted.map((row) => row.aiSuggestionId),
    [successfulSuggestionId],
  );

  const statement = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-06-30`,
  );
  assert.equal(statement.statusCode, 200);
  assert.equal(
    readBody<{ transactions: TransactionRecord[] }>(statement).transactions.filter(
      (candidate) => candidate.aiSuggestionId === successfulSuggestionId,
    ).length,
    1,
  );

  const detail = await apiRequest(token, "GET", `/api/import-batches/${importBatchId}`);
  assert.equal(detail.statusCode, 409);
  assert.equal(readErrorCode(detail), "IMPORT_APPROVED_TRANSACTION_MISSING");

  const repeated = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${importBatchId}/suggestions/${inconsistentSuggestionId}/approve`,
  );
  assert.equal(repeated.statusCode, 409);
  assert.equal(readErrorCode(repeated), "IMPORT_APPROVED_TRANSACTION_MISSING");
}

async function createAccount(token: string, name: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function createCategory(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/categories", {
    name: `Receita revisada ${suffix}`,
    kind: "income",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ category: { id: string } }>(response).category.id;
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

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function requireSuggestion(detail: ImportDetail, index: number): ImportSuggestion {
  const suggestion = detail.suggestions[index];
  assert.ok(suggestion, `Expected suggestion at index ${index}`);
  return suggestion;
}

interface ImportSuggestion {
  id: string;
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: ImportSuggestion[];
}

interface BulkDecision {
  summary: {
    requested: number;
    approved: number;
    failed: number;
    idempotent: number;
  };
  results: Array<{
    suggestionId: string;
    status: string;
    error?: { code: string };
  }>;
  failures: Array<{ suggestionId: string; code: string }>;
}

interface TransactionRecord {
  id: string;
  accountId?: string;
  categoryId?: string;
  importBatchId?: string;
  aiSuggestionId?: string;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  plannedOn: string;
  effectiveOn?: string;
  description: string;
}
