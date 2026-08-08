import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";
const USER_ID = "11111111-1111-4111-8111-111111111111";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const token = await loginAndReadToken();
  const marker = randomUUID();
  const sourceId = randomUUID();
  const categorizationId = randomUUID();
  const categoryA = randomUUID();
  const categoryB = randomUUID();
  const correlationId = `issue-565-concurrency-${marker}`;

  try {
    await insertCategory(organizationId, categoryA, `Categoria rollback ${marker}`);
    await insertCategory(organizationId, categoryB, `Categoria corrigida ${marker}`);
    await insertCategorizationFixture(
      organizationId,
      sourceId,
      categorizationId,
      categoryA,
      marker,
    );

    const hidden = await apiRequest(
      token,
      "GET",
      `/api/ai-review-queue/${categorizationId}/payload?profileId=${MEI_PROFILE_ID}`,
      undefined,
      correlationId,
    );
    assert.equal(hidden.statusCode, 404);
    assert.equal(readErrorCode(hidden), "AI_SUGGESTION_PAYLOAD_NOT_FOUND");

    const detail = await apiRequest(
      token,
      "GET",
      `/api/ai-review-queue/${categorizationId}/payload`,
      undefined,
      correlationId,
    );
    assert.equal(detail.statusCode, 200);
    const initial = readBody<PayloadDetail>(detail).payload;

    await query(`update "Category" set "status" = 'ARCHIVED' where "id" = $1`, [categoryA]);
    const blocked = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/approve`,
      { expectedFingerprint: initial.fingerprint },
      correlationId,
    );
    assert.equal(blocked.statusCode, 409);
    assert.equal(readErrorCode(blocked), "AI_REVIEW_CATEGORY_UNAVAILABLE");
    await assertRollbackState(categorizationId, sourceId);
    await query(`update "Category" set "status" = 'ACTIVE' where "id" = $1`, [categoryA]);

    const edited = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${categorizationId}/edit`,
      {
        expectedFingerprint: initial.fingerprint,
        payload: { proposedCategoryId: categoryB },
      },
      correlationId,
    );
    assert.equal(edited.statusCode, 200);
    assert.equal(
      readBody<{ suggestion: { status: string } }>(edited).suggestion.status,
      "pending_review",
    );

    const learning = await query<{
      categoryId: string;
      correctionCount: number;
      lastSourceSuggestionId: string | null;
    }>(
      `select "categoryId", "correctionCount", "lastSourceSuggestionId"
       from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "categoryId" = $3 and "lastSourceSuggestionId" = $4
       order by "updatedAt" desc limit 1`,
      [organizationId, PERSONAL_PROFILE_ID, categoryB, sourceId],
    );
    assert.equal(learning[0]?.categoryId, categoryB);
    assert.equal(learning[0]?.correctionCount, 1);
    assert.equal(learning[0]?.lastSourceSuggestionId, sourceId);

    const learningAudit = await query<{ correlationId: string | null }>(
      `select "correlationId" from "SecurityAuditEvent"
       where "action" = 'CATEGORY_LEARNING_UPDATED' and "correlationId" = $1
       order by "occurredAt" desc limit 1`,
      [correlationId],
    );
    assert.equal(learningAudit[0]?.correlationId, correlationId);

    const currentResponse = await apiRequest(
      token,
      "GET",
      `/api/ai-review-queue/${categorizationId}/payload`,
      undefined,
      correlationId,
    );
    const current = readBody<PayloadDetail>(currentResponse).payload;
    assert.notEqual(current.fingerprint, initial.fingerprint);
    assert.equal(current.proposal.proposedCategoryId, categoryB);

    const [approve, reject] = await Promise.all([
      apiRequest(
        token,
        "POST",
        `/api/ai-review-queue/${categorizationId}/approve`,
        { expectedFingerprint: current.fingerprint },
        `${correlationId}-approve`,
      ),
      apiRequest(
        token,
        "POST",
        `/api/ai-review-queue/${categorizationId}/reject`,
        { expectedFingerprint: current.fingerprint },
        `${correlationId}-reject`,
      ),
    ]);
    assert.deepEqual(
      [approve.statusCode, reject.statusCode].sort((left, right) => left - right),
      [200, 409],
      "Concurrent opposite decisions must converge to one persisted result and one controlled conflict.",
    );

    const finalRows = await query<{ status: string }>(
      `select "status" from "AiSuggestion" where "id" = $1`,
      [categorizationId],
    );
    const finalStatus = finalRows[0]?.status;
    assert.ok(finalStatus === "APPROVED" || finalStatus === "REJECTED");

    const sourceRows = await query<{ categoryId: string | null }>(
      `select "payload"->>'categoryId' as "categoryId" from "AiSuggestion" where "id" = $1`,
      [sourceId],
    );
    if (finalStatus === "APPROVED") {
      assert.equal(sourceRows[0]?.categoryId, categoryB);
      assert.equal(approve.statusCode, 200);
      assert.equal(reject.statusCode, 409);
    } else {
      assert.equal(sourceRows[0]?.categoryId, null);
      assert.equal(reject.statusCode, 200);
      assert.equal(approve.statusCode, 409);
    }

    const decisionAudits = await query<{
      action: string;
      correlationId: string | null;
    }>(
      `select "action", "correlationId" from "AuditLogEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3
         and "action" in ('APPROVE', 'REJECT')
       order by "occurredAt" asc`,
      [organizationId, PERSONAL_PROFILE_ID, categorizationId],
    );
    assert.equal(decisionAudits.length, 1);
    assert.equal(decisionAudits[0]?.action, finalStatus === "APPROVED" ? "APPROVE" : "REJECT");
    assert.equal(
      decisionAudits[0]?.correlationId,
      finalStatus === "APPROVED" ? `${correlationId}-approve` : `${correlationId}-reject`,
    );
  } finally {
    await query(`delete from "SecurityAuditEvent" where "correlationId" like $1`, [
      `${correlationId}%`,
    ]);
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [
      [sourceId, categorizationId],
    ]);
    await query(
      `delete from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and ("categoryId" = any($3::uuid[]) or "lastSourceSuggestionId" = $4)`,
      [organizationId, PERSONAL_PROFILE_ID, [categoryA, categoryB], sourceId],
    );
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [
      [categorizationId, sourceId],
    ]);
    await query(`delete from "Category" where "id" = any($1::uuid[])`, [[categoryA, categoryB]]);
  }
}

async function assertRollbackState(categorizationId: string, sourceId: string): Promise<void> {
  const suggestionRows = await query<{ status: string }>(
    `select "status" from "AiSuggestion" where "id" = $1`,
    [categorizationId],
  );
  assert.equal(suggestionRows[0]?.status, "PENDING_REVIEW");

  const sourceRows = await query<{ categoryId: string | null }>(
    `select "payload"->>'categoryId' as "categoryId" from "AiSuggestion" where "id" = $1`,
    [sourceId],
  );
  assert.equal(sourceRows[0]?.categoryId, null);

  const audits = await query<{ count: string }>(
    `select count(*)::text as "count" from "AuditLogEntry"
     where "entityKind" = 'AI_SUGGESTION' and "entityId" = $1 and "action" = 'APPROVE'`,
    [categorizationId],
  );
  assert.equal(Number(audits[0]?.count ?? 0), 0);
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
      origin: { kind: "system", component: "issue-565-concurrency-test" },
      target: { entityKind: "transaction" },
      confidence: 0.74,
      reasons: ["Fixture ficticia para validar concorrencia da fila."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `issue-565-concurrency-${marker}`,
      occurredOn: "2026-08-07",
      kind: "expense",
      direction: "outflow",
      amountMinor: 4242,
      currency: "BRL",
      description: `Mercado concorrente ${marker}`,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "payloadFingerprint",
       "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null,
             0.74, 'Fixture de origem da issue 565.', $4::jsonb, $5,
             'solverfin-test', 'issue-565-concurrency', null, null, $6, $6)`,
    [
      sourceId,
      organizationId,
      PERSONAL_PROFILE_ID,
      JSON.stringify(sourcePayload),
      sourcePayload.fingerprint,
      now,
    ],
  );

  const categorizationPayload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "system", component: "issue-565-concurrency-test" },
      target: { entityKind: "import_suggestion", entityId: sourceId },
      confidence: 0.68,
      reasons: ["Categoria inicial para revisao concorrente."],
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
             0.68, 'Categoria inicial para revisao concorrente.', $5::jsonb, $4, $6,
             'solverfin-test', 'issue-565-concurrency', null, null, $7, $7)`,
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
  const response = await handleCategorizationAwareAiReviewQueueApiRequest(request);
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
    fingerprint: string;
    proposal: { proposedCategoryId?: string };
  };
}
