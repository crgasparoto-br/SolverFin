import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const USER_ID = "11111111-1111-4111-8111-111111111111";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const organizationRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = organizationRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const token = await loginAndReadToken();
  const sourceId = randomUUID();
  const categorizationId = randomUUID();
  const insightId = randomUUID();
  const categoryA = randomUUID();
  const categoryB = randomUUID();
  const marker = randomUUID();
  const correlationId = `issue-565-${marker}`;

  try {
    await insertCategory(organizationId, categoryA, `Categoria A ${marker}`);
    await insertCategory(organizationId, categoryB, `Categoria B ${marker}`);
    await insertCategorizationFixture(
      organizationId,
      sourceId,
      categorizationId,
      categoryA,
      marker,
    );
    await insertInsightFixture(organizationId, insightId, marker);

    const initial = await apiRequest(
      token,
      "GET",
      `/api/ai-review-queue/${categorizationId}/payload`,
      undefined,
      correlationId,
    );
    assert.equal(initial.statusCode, 200);
    const initialPayload = readBody<PayloadDetail>(initial).payload;
    assert.equal(initialPayload.suggestionKind, "categorization");
    assert.equal(initialPayload.proposal.proposedCategoryId, categoryA);

    const unsupportedEdit = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/edit`,
      {
        expectedFingerprint: initialPayload.fingerprint,
        payload: { targetEntityId: sourceId },
      },
      correlationId,
    );
    assert.equal(unsupportedEdit.statusCode, 422);
    assert.equal(readErrorCode(unsupportedEdit), "AI_REVIEW_EDIT_FIELD_UNSUPPORTED");

    await query(`update "Category" set "status" = 'ARCHIVED' where "id" = $1`, [categoryA]);
    const archivedCategoryApproval = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/approve`,
      { expectedFingerprint: initialPayload.fingerprint },
      correlationId,
    );
    assert.equal(archivedCategoryApproval.statusCode, 409);
    assert.equal(readErrorCode(archivedCategoryApproval), "AI_REVIEW_CATEGORY_UNAVAILABLE");
    await query(`update "Category" set "status" = 'ACTIVE' where "id" = $1`, [categoryA]);

    const edited = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/edit`,
      {
        expectedFingerprint: initialPayload.fingerprint,
        payload: { proposedCategoryId: categoryB },
      },
      correlationId,
    );
    assert.equal(edited.statusCode, 200);
    assert.equal(
      readBody<{ suggestion: { status: string } }>(edited).suggestion.status,
      "pending_review",
    );

    const staleEdit = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/edit`,
      {
        expectedFingerprint: initialPayload.fingerprint,
        payload: { proposedCategoryId: categoryA },
      },
      correlationId,
    );
    assert.equal(staleEdit.statusCode, 409);
    assert.equal(readErrorCode(staleEdit), "AI_SUGGESTION_PAYLOAD_CONFLICT");

    const current = await apiRequest(
      token,
      "GET",
      `/api/ai-review-queue/${categorizationId}/payload`,
      undefined,
      correlationId,
    );
    const currentPayload = readBody<PayloadDetail>(current).payload;
    assert.notEqual(currentPayload.fingerprint, initialPayload.fingerprint);
    assert.equal(currentPayload.proposal.proposedCategoryId, categoryB);

    const approved = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/approve`,
      { expectedFingerprint: currentPayload.fingerprint },
      correlationId,
    );
    assert.equal(approved.statusCode, 200);
    assert.equal(
      readBody<{ suggestion: { status: string } }>(approved).suggestion.status,
      "approved",
    );

    const sourceRows = await query<{ categoryId: string | null }>(
      `select "payload"->>'categoryId' as "categoryId" from "AiSuggestion" where "id" = $1`,
      [sourceId],
    );
    assert.equal(sourceRows[0]?.categoryId, categoryB);

    const repeated = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/approve`,
      { expectedFingerprint: currentPayload.fingerprint },
      correlationId,
    );
    assert.equal(repeated.statusCode, 200);
    assert.equal(readBody<{ idempotent?: boolean }>(repeated).idempotent, true);

    const audits = await query<{ action: string; correlationId: string | null }>(
      `select "action", "correlationId" from "AuditLogEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3
         and "action" in ('UPDATE', 'APPROVE')
       order by "occurredAt" asc`,
      [organizationId, PERSONAL_PROFILE_ID, categorizationId],
    );
    assert.ok(
      audits.some((entry) => entry.action === "UPDATE" && entry.correlationId === correlationId),
    );
    assert.ok(
      audits.some((entry) => entry.action === "APPROVE" && entry.correlationId === correlationId),
    );

    const transactionCountBeforeInsight = await readTransactionCount(organizationId);
    const insightDetail = await apiRequest(
      token,
      "GET",
      `/api/ai-review-queue/${insightId}/payload`,
      undefined,
      correlationId,
    );
    const insightPayload = readBody<PayloadDetail>(insightDetail).payload;
    assert.equal(insightPayload.suggestionKind, "insight");

    const insightApproval = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${insightId}/approve`,
      { expectedFingerprint: insightPayload.fingerprint },
      correlationId,
    );
    assert.equal(insightApproval.statusCode, 200);
    assert.equal(
      readBody<{ suggestion: { status: string }; transaction?: unknown }>(insightApproval).suggestion
        .status,
      "approved",
    );
    assert.equal(
      readBody<{ transaction?: unknown }>(insightApproval).transaction,
      undefined,
      "Insight approval must not create a financial transaction.",
    );
    assert.equal(await readTransactionCount(organizationId), transactionCountBeforeInsight);

    const repeatedInsight = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${insightId}/approve`,
      { expectedFingerprint: insightPayload.fingerprint },
      correlationId,
    );
    assert.equal(repeatedInsight.statusCode, 200);
    assert.equal(readBody<{ idempotent?: boolean }>(repeatedInsight).idempotent, true);
  } finally {
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [
      [sourceId, categorizationId, insightId],
    ]);
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [
      [categorizationId, insightId, sourceId],
    ]);
    await query(`delete from "Category" where "id" = any($1::uuid[])`, [[categoryA, categoryB]]);
  }
}

async function insertCategory(organizationId: string, id: string, name: string): Promise<void> {
  await query(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "name", "kind", "status",
       "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'ACTIVE', $5, $5, clock_timestamp(), clock_timestamp())`,
    [id, organizationId, PERSONAL_PROFILE_ID, name, USER_ID],
  );
}

async function insertCategorizationFixture(
  organizationId: string,
  sourceId: string,
  categorizationId: string,
  categoryId: string,
  marker: string,
): Promise<void> {
  const now = new Date().toISOString();
  const sourcePayload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "system", component: "issue-565-integration-test" },
      target: { entityKind: "transaction" },
      confidence: 0.81,
      reasons: ["Fixture ficticia da issue 565."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `issue-565-${marker}`,
      occurredOn: "2026-08-07",
      kind: "expense",
      direction: "outflow",
      amountMinor: 1990,
      currency: "BRL",
      description: `Mercado issue 565 ${marker}`,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null,
             0.81, 'Fixture ficticia da issue 565.', $4::jsonb, 'solverfin-test', 'issue-565',
             null, null, $5, $5)`,
    [sourceId, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(sourcePayload), now],
  );

  const categorizationPayload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "system", component: "issue-565-integration-test" },
      target: { entityKind: "import_suggestion", entityId: sourceId },
      confidence: 0.72,
      reasons: ["Categoria sugerida para revisao."],
      audit: { createdAt: now, sourceFingerprint: sourcePayload.fingerprint },
      targetEntityId: sourceId,
      sourceSuggestionId: sourceId,
      proposedCategoryId: categoryId,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "sourceSuggestionId",
       "payloadFingerprint", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'CATEGORIZATION', 'PENDING_REVIEW', $4, $4,
             0.72, 'Categoria sugerida para revisao.', $5::jsonb, $4, $6,
             'solverfin-test', 'issue-565', null, null, $7, $7)`,
    [
      categorizationId,
      organizationId,
      PERSONAL_PROFILE_ID,
      sourceId,
      JSON.stringify(categorizationPayload),
      categorizationPayload.fingerprint,
      now,
    ],
  );
}

async function insertInsightFixture(
  organizationId: string,
  insightId: string,
  marker: string,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "system", component: "issue-565-integration-test" },
      target: { entityKind: "financial_profile", entityId: PERSONAL_PROFILE_ID },
      confidence: 0.84,
      reasons: ["Insight ficticio para validar reconhecimento sem efeito financeiro."],
      audit: { createdAt: now },
      insightType: "summary",
      title: "Resumo ficticio da issue 565",
      summary: `Resumo seguro ${marker}`,
      periodStartOn: "2026-08-01",
      periodEndOn: "2026-08-07",
      metric: { name: "reviewed_items", value: 2, unit: "count" },
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'INSIGHT', 'PENDING_REVIEW', null, null,
             0.84, 'Insight ficticio para revisao.', $4::jsonb, 'solverfin-test', 'issue-565',
             null, null, $5, $5)`,
    [insightId, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
  );
}

async function readTransactionCount(organizationId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  return Number(rows[0]?.count ?? 0);
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
  body: unknown,
  correlationId: string,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: {
      authorization: `Bearer ${token}`,
      "x-correlation-id": correlationId,
    },
    body,
  };
  const response = await handleAiReviewQueueApiRequest(request);
  assert.ok(response, `${method} ${path} should be handled by the AI review queue router`);
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

interface PayloadDetail {
  payload: {
    suggestionKind: string;
    fingerprint: string;
    proposal: { proposedCategoryId?: string };
  };
}
