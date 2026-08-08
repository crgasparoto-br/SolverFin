import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  buildAiSuggestionPayload,
  type AiSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for dependency freshness integration tests.",
  );

  const token = await loginAndReadToken();
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const accountRows = await query<{ id: string }>(
    `select "id" from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = accountRows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");

  const categoryRows = await query<{ id: string }>(
    `select "id" from "Category"
      where "organizationId" = $1 and "financialProfileId" = $2
        and "status" = 'ACTIVE' and "kind" = 'EXPENSE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const categoryId = categoryRows[0]?.id;
  assert.ok(categoryId, "An active expense category seed is required.");

  const createdIds: string[] = [];
  try {
    await assertFreshAndObsoleteDependencies(
      token,
      organizationId,
      accountId,
      categoryId,
      createdIds,
    );
    await assertMissingSourceIsObsolete(token, organizationId, categoryId, createdIds);
    await assertArchivedAccountBlocksApproval(token, organizationId, accountId, createdIds);
    await assertArchivedCategoryBlocksApproval(
      token,
      organizationId,
      accountId,
      categoryId,
      createdIds,
    );
  } finally {
    await query(`update "Account" set "status" = 'ACTIVE' where "id" = $1`, [accountId]);
    await query(`update "Category" set "status" = 'ACTIVE' where "id" = $1`, [categoryId]);
    if (createdIds.length > 0) {
      await query(`delete from "Transaction" where "aiSuggestionId" = any($1::uuid[])`, [
        createdIds,
      ]);
      await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [createdIds]);
    }
  }
}

async function assertFreshAndObsoleteDependencies(
  token: string,
  organizationId: string,
  accountId: string,
  categoryId: string,
  createdIds: string[],
): Promise<void> {
  const sourceId = randomUUID();
  const freshDependentId = randomUUID();
  const staleDependentId = randomUUID();
  createdIds.push(sourceId, freshDependentId, staleDependentId);

  const now = new Date().toISOString();
  const sourcePayload = buildTransactionPayload({
    now,
    sourceId,
    accountId,
    description: "Origem ficticia inicial",
  });
  await insertSuggestion({
    id: sourceId,
    organizationId,
    kind: "transaction_extraction",
    payload: sourcePayload,
    provider: "test-provider",
    now,
  });

  await insertSuggestion({
    id: freshDependentId,
    organizationId,
    kind: "categorization",
    payload: buildCategorizationPayload({
      now,
      sourceId,
      sourceFingerprint: sourcePayload.fingerprint,
      categoryId,
    }),
    provider: "solverfin-automation",
    now,
  });
  const freshResponse = await apiRequest(
    token,
    `/api/ai-review-queue/${freshDependentId}/approve`,
    "POST",
  );
  assert.equal(freshResponse.statusCode, 200);

  await insertSuggestion({
    id: staleDependentId,
    organizationId,
    kind: "categorization",
    payload: buildCategorizationPayload({
      now,
      sourceId,
      sourceFingerprint: sourcePayload.fingerprint,
      categoryId,
    }),
    provider: "solverfin-automation",
    now,
  });

  const changedPayload = buildTransactionPayload({
    now,
    sourceId,
    accountId,
    description: "Origem ficticia alterada",
  });
  assert.notEqual(changedPayload.fingerprint, sourcePayload.fingerprint);
  await query(
    `update "AiSuggestion" set "payload" = $2::jsonb, "updatedAt" = now()
      where "id" = $1`,
    [sourceId, JSON.stringify(changedPayload)],
  );

  const staleResponse = await apiRequest(
    token,
    `/api/ai-review-queue/${staleDependentId}/approve`,
    "POST",
  );
  assert.equal(staleResponse.statusCode, 409);
  assert.equal(readErrorCode(staleResponse), "AI_SUGGESTION_PAYLOAD_OBSOLETE");
  await assertSuggestionRemainsPending(staleDependentId);
}

async function assertMissingSourceIsObsolete(
  token: string,
  organizationId: string,
  categoryId: string,
  createdIds: string[],
): Promise<void> {
  const suggestionId = randomUUID();
  createdIds.push(suggestionId);
  const missingSourceId = randomUUID();
  const now = new Date().toISOString();

  await insertSuggestion({
    id: suggestionId,
    organizationId,
    kind: "categorization",
    payload: buildCategorizationPayload({
      now,
      sourceId: missingSourceId,
      sourceFingerprint: `sha256-${"f".repeat(64)}`,
      categoryId,
    }),
    provider: "solverfin-automation",
    now,
  });

  const response = await apiRequest(token, `/api/ai-review-queue/${suggestionId}/approve`, "POST");
  assert.equal(response.statusCode, 409);
  assert.equal(readErrorCode(response), "AI_SUGGESTION_PAYLOAD_OBSOLETE");
  await assertSuggestionRemainsPending(suggestionId);
}

async function assertArchivedAccountBlocksApproval(
  token: string,
  organizationId: string,
  accountId: string,
  createdIds: string[],
): Promise<void> {
  const suggestionId = randomUUID();
  createdIds.push(suggestionId);
  const now = new Date().toISOString();
  await insertSuggestion({
    id: suggestionId,
    organizationId,
    kind: "transaction_extraction",
    payload: buildTransactionPayload({
      now,
      sourceId: suggestionId,
      accountId,
      description: "Conta arquivada ficticia",
    }),
    provider: "test-provider",
    now,
  });

  await query(`update "Account" set "status" = 'ARCHIVED' where "id" = $1`, [accountId]);
  try {
    const response = await apiRequest(
      token,
      `/api/ai-review-queue/${suggestionId}/approve`,
      "POST",
    );
    assert.equal(response.statusCode, 400);
    assert.equal(readErrorCode(response), "TRANSACTION_ACCOUNT_ARCHIVED");
    await assertSuggestionRemainsPending(suggestionId);
    await assertNoTransaction(suggestionId);
  } finally {
    await query(`update "Account" set "status" = 'ACTIVE' where "id" = $1`, [accountId]);
  }
}

async function assertArchivedCategoryBlocksApproval(
  token: string,
  organizationId: string,
  accountId: string,
  categoryId: string,
  createdIds: string[],
): Promise<void> {
  const suggestionId = randomUUID();
  createdIds.push(suggestionId);
  const now = new Date().toISOString();
  const payload = buildTransactionPayload({
    now,
    sourceId: suggestionId,
    accountId,
    description: "Categoria arquivada ficticia",
  });
  const { fingerprint: _fingerprint, ...payloadDraft } = payload;
  void _fingerprint;
  await insertSuggestion({
    id: suggestionId,
    organizationId,
    kind: "transaction_extraction",
    payload: buildAiSuggestionPayload({
      payload: { ...payloadDraft, categoryId },
    }),
    provider: "test-provider",
    now,
  });

  await query(`update "Category" set "status" = 'ARCHIVED' where "id" = $1`, [categoryId]);
  try {
    const response = await apiRequest(
      token,
      `/api/ai-review-queue/${suggestionId}/approve`,
      "POST",
    );
    assert.equal(response.statusCode, 400);
    assert.equal(readErrorCode(response), "TRANSACTION_CATEGORY_ARCHIVED");
    await assertSuggestionRemainsPending(suggestionId);
    await assertNoTransaction(suggestionId);
  } finally {
    await query(`update "Category" set "status" = 'ACTIVE' where "id" = $1`, [categoryId]);
  }
}

function buildTransactionPayload(input: {
  now: string;
  sourceId: string;
  accountId: string;
  description: string;
}): Extract<AiSuggestionPayload, { suggestionKind: "transaction_extraction" }> {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "test-provider" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: ["Fixture ficticia para validar decisao protegida."],
      audit: { createdAt: input.now },
      sourceRowNumber: 1,
      sourceHash: `test-${input.sourceId}`,
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: 1299,
      currency: "BRL",
      description: input.description,
      accountId: input.accountId,
    },
  });
}

function buildCategorizationPayload(input: {
  now: string;
  sourceId: string;
  sourceFingerprint: string;
  categoryId: string;
}): Extract<AiSuggestionPayload, { suggestionKind: "categorization" }> {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "automation" },
      target: {
        entityKind: "import_suggestion",
        entityId: input.sourceId,
      },
      confidence: 0.9,
      reasons: ["Dependencia ficticia estruturada."],
      audit: {
        createdAt: input.now,
        sourceFingerprint: input.sourceFingerprint,
      },
      targetEntityId: input.sourceId,
      sourceSuggestionId: input.sourceId,
      proposedCategoryId: input.categoryId,
      proposedStatus: "posted",
    },
  });
}

async function insertSuggestion(input: {
  id: string;
  organizationId: string;
  kind: AiSuggestionPayload["suggestionKind"];
  payload: AiSuggestionPayload;
  provider: string;
  now: string;
}): Promise<void> {
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence",
       "explanation", "payload", "provider", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'PENDING_REVIEW', 0.9,
             'Texto apresentacional ficticio.', $5::jsonb, $6, $7, $7)`,
    [
      input.id,
      input.organizationId,
      PERSONAL_PROFILE_ID,
      input.kind.toUpperCase(),
      JSON.stringify(input.payload),
      input.provider,
      input.now,
    ],
  );
}

async function assertSuggestionRemainsPending(suggestionId: string): Promise<void> {
  const rows = await query<{
    status: string;
    reviewedAt: Date | null;
    reviewedByUserId: string | null;
  }>(
    `select "status", "reviewedAt", "reviewedByUserId"
       from "AiSuggestion" where "id" = $1`,
    [suggestionId],
  );
  assert.equal(rows[0]?.status, "PENDING_REVIEW");
  assert.equal(rows[0]?.reviewedAt, null);
  assert.equal(rows[0]?.reviewedByUserId, null);
}

async function assertNoTransaction(suggestionId: string): Promise<void> {
  const rows = await query<{ total: number }>(
    `select count(*)::int as total from "Transaction" where "aiSuggestionId" = $1`,
    [suggestionId],
  );
  assert.equal(rows[0]?.total, 0);
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

async function apiRequest(token: string, path: string, method = "GET"): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body: undefined,
  };
  const response = await handleAiReviewQueueApiRequest(request);
  assert.ok(response);
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
