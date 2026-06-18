import assert from "node:assert/strict";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assertIntegrationDatabaseConfigured();

  const token = await loginAndReadToken();
  const fixtures = await createReviewFixtures(token);
  const suggestions = await createImportSuggestions(token, fixtures);

  await assertListsPendingSuggestions(token, suggestions);
  await assertApproveCreatesTransaction(token, suggestions[0]?.id ?? "");
  await assertEditClosesSuggestion(token, suggestions[1]?.id ?? "");
  await assertRejectBlocksSecondReview(token, suggestions[2]?.id ?? "");
  await assertMeiProfileDoesNotExposePersonalSuggestions(token, suggestions);
}

async function createReviewFixtures(token: string): Promise<ReviewFixtures> {
  const suffix = Date.now().toString(36);
  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta revisao ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 50000,
  });
  assert.equal(accountResponse.statusCode, 201);
  const account = readBody<{ account: ApiAccount }>(accountResponse).account;

  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria revisao ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const category = readBody<{ category: ApiCategory }>(categoryResponse).category;

  return { account, category };
}

async function createImportSuggestions(
  token: string,
  fixtures: ReviewFixtures,
): Promise<ApiAiSuggestion[]> {
  const suffix = Date.now().toString(36);
  const csvContent = [
    "date,description,amount,kind,accountId,categoryId",
    `2026-06-18,Compra revisao aprovar ${suffix},-10.00,expense,${fixtures.account.id},${fixtures.category.id}`,
    `2026-06-19,Compra revisao editar ${suffix},-20.00,expense,${fixtures.account.id},${fixtures.category.id}`,
    `2026-06-20,Compra revisao rejeitar ${suffix},-30.00,expense,${fixtures.account.id},${fixtures.category.id}`,
  ].join("\n");

  const importResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `revisao-${suffix}.csv`,
    content: csvContent,
  });
  assert.equal(importResponse.statusCode, 201);

  const imported = readBody<{
    importBatch: ApiImportBatch;
    suggestions: ApiAiSuggestion[];
  }>(importResponse);

  assert.equal(imported.importBatch.financialProfileId, PERSONAL_PROFILE_ID);
  assert.equal(imported.suggestions.length, 3);

  return imported.suggestions;
}

async function assertListsPendingSuggestions(
  token: string,
  suggestions: ApiAiSuggestion[],
): Promise<void> {
  const response = await apiRequest(token, "GET", "/api/ai-review-queue");
  assert.equal(response.statusCode, 200);
  const queue = readBody<{ suggestions: ApiReviewQueueItem[] }>(response).suggestions;

  for (const suggestion of suggestions) {
    const listed = queue.find((item) => item.id === suggestion.id);
    assert.ok(listed, `Expected suggestion ${suggestion.id} in review queue`);
    assert.equal(listed?.status, "pending_review");
    assert.equal(listed?.origin, "import");
    assert.equal(listed?.kind, "transaction_extraction");
    assert.ok(listed?.proposedTransaction);
  }
}

async function assertApproveCreatesTransaction(token: string, suggestionId: string): Promise<void> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${suggestionId}/approve`,
  );
  assert.equal(response.statusCode, 200);
  const result = readBody<{ suggestion: ApiAiSuggestion; transaction: ApiTransaction }>(response);

  assert.equal(result.suggestion.status, "approved");
  assert.equal(result.suggestion.targetEntityId, result.transaction.id);
  assert.equal(result.transaction.kind, "expense");
  assert.equal(result.transaction.aiSuggestionId, suggestionId);
}

async function assertEditClosesSuggestion(token: string, suggestionId: string): Promise<void> {
  const response = await apiRequest(token, "POST", `/api/ai-review-queue/${suggestionId}/edit`, {
    payload: {
      amountMinor: 2199,
      description: "Compra revisada pelo usuario",
    },
    reason: "Valor ajustado antes da confirmacao.",
  });
  assert.equal(response.statusCode, 200);
  const result = readBody<{ suggestion: ApiAiSuggestion }>(response);

  assert.equal(result.suggestion.status, "edited");
  assert.ok(result.suggestion.reviewedAt);
}

async function assertRejectBlocksSecondReview(token: string, suggestionId: string): Promise<void> {
  const response = await apiRequest(token, "POST", `/api/ai-review-queue/${suggestionId}/reject`, {
    reason: "Nao pertence a este extrato.",
  });
  assert.equal(response.statusCode, 200);
  const result = readBody<{ suggestion: ApiAiSuggestion }>(response);

  assert.equal(result.suggestion.status, "rejected");
  assert.ok(result.suggestion.reviewedAt);

  const secondReview = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${suggestionId}/approve`,
  );
  assert.equal(secondReview.statusCode, 400);
  assert.equal(readErrorCode(secondReview), "AI_REVIEW_INVALID_TRANSITION");
}

async function assertMeiProfileDoesNotExposePersonalSuggestions(
  token: string,
  personalSuggestions: ApiAiSuggestion[],
): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/ai-review-queue?status=all&includeLowConfidence=true&profileId=${MEI_PROFILE_ID}`,
  );
  assert.equal(response.statusCode, 200);
  const queue = readBody<{ suggestions: ApiReviewQueueItem[] }>(response).suggestions;

  for (const suggestion of personalSuggestions) {
    assert.equal(queue.some((item) => item.id === suggestion.id), false);
  }
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
  const importBatchesResponse = await handleImportBatchesApiRequest(request);
  const aiReviewQueueResponse =
    importBatchesResponse ?? (await handleAiReviewQueueApiRequest(request));
  const response = aiReviewQueueResponse ?? (await handleApiRequest(request));

  assert.ok(response, `${method} ${path} should be handled by the API router`);

  return response;
}

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);

  return response.body as TBody;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface ReviewFixtures {
  account: ApiAccount;
  category: ApiCategory;
}

interface ApiAccount {
  id: string;
  financialProfileId: string;
}

interface ApiCategory {
  id: string;
  financialProfileId: string;
}

interface ApiImportBatch {
  id: string;
  financialProfileId: string;
}

interface ApiAiSuggestion {
  id: string;
  financialProfileId: string;
  kind: string;
  status: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  reviewedAt?: string;
}

interface ApiTransaction {
  id: string;
  financialProfileId: string;
  kind?: string;
  aiSuggestionId?: string;
}

interface ApiReviewQueueItem {
  id: string;
  kind: string;
  status: string;
  origin: string;
  proposedTransaction?: unknown;
}
