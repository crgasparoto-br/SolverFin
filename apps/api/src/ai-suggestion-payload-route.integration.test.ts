import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const token = await loginAndReadToken();
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId);
  const suggestionId = randomUUID();
  const legacySuggestionId = randomUUID();
  const concurrentSuggestionId = randomUUID();

  try {
    const payload = buildAiSuggestionPayload({
      payload: {
        contractVersion: 1,
        suggestionKind: "insight",
        payloadVersion: 1,
        origin: { kind: "provider", provider: "private-provider", model: "private-model" },
        target: { entityKind: "financial_profile", entityId: PERSONAL_PROFILE_ID },
        confidence: 0.77,
        reasons: ["Dados ficticios agregados."],
        audit: {
          createdAt: new Date().toISOString(),
          correlationId: "private-correlation",
        },
        insightType: "summary",
        title: "Resumo ficticio",
        summary: "Resumo sem dados pessoais.",
        periodStartOn: "2026-07-01",
        periodEndOn: "2026-07-31",
      },
    });
    const now = new Date().toISOString();
    await query(
      `insert into "AiSuggestion"
        ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
         "payload", "provider", "model", "createdAt", "updatedAt")
       values ($1, $2, $3, 'INSIGHT', 'PENDING_REVIEW', 0.77, 'Texto nao autoritativo.',
               $4::jsonb, 'private-provider', 'private-model', $5, $5)`,
      [suggestionId, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
    );

    const response = await apiRequest(token, `/api/ai-review-queue/${suggestionId}/payload`);
    assert.equal(response.statusCode, 200);
    const serialized = JSON.stringify(response.body);
    assert.match(serialized, /"suggestionKind":"insight"/);
    assert.doesNotMatch(serialized, /private-provider|private-model|private-correlation/);
    assert.doesNotMatch(serialized, new RegExp(PERSONAL_PROFILE_ID));

    const crossProfile = await apiRequest(
      token,
      `/api/ai-review-queue/${suggestionId}/payload?profileId=${MEI_PROFILE_ID}`,
    );
    assert.equal(crossProfile.statusCode, 404);
    assert.equal(readErrorCode(crossProfile), "AI_SUGGESTION_PAYLOAD_NOT_FOUND");

    const malformed = await apiRequest(token, "/api/ai-review-queue/not-a-uuid/payload");
    assert.equal(malformed.statusCode, 400);
    assert.equal(readErrorCode(malformed), "AI_REVIEW_SUGGESTION_ID_INVALID");

    await assertExplanationCannotAuthorizeTransaction(
      token,
      organizationId,
      legacySuggestionId,
    );
    await assertConcurrentApprovalCreatesOneTransaction(
      token,
      organizationId,
      concurrentSuggestionId,
    );
  } finally {
    await query(`delete from "Transaction" where "aiSuggestionId" = any($1::uuid[])`, [
      [legacySuggestionId, concurrentSuggestionId],
    ]);
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [
      [suggestionId, legacySuggestionId, concurrentSuggestionId],
    ]);
  }
}

async function assertConcurrentApprovalCreatesOneTransaction(
  token: string,
  organizationId: string,
  suggestionId: string,
): Promise<void> {
  const accountRows = await query<{ id: string }>(
    `select "id" from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = accountRows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");

  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "test-provider", model: "test-model" },
      target: { entityKind: "transaction" },
      confidence: 0.93,
      reasons: ["Extracao ficticia para prova de concorrencia."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `test-${suggestionId}`,
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: 1234,
      currency: "BRL",
      description: "Compra concorrente ficticia",
      accountId,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
       "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.93,
             'Explicacao sem autoridade financeira.', $4::jsonb, 'test-provider', 'test-model', $5, $5)`,
    [suggestionId, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
  );

  const responses = await Promise.all([
    apiRequest(token, `/api/ai-review-queue/${suggestionId}/approve`, "POST"),
    apiRequest(token, `/api/ai-review-queue/${suggestionId}/approve`, "POST"),
  ]);
  assert.deepEqual(
    responses.map((response) => response.statusCode).sort((left, right) => left - right),
    [200, 409],
  );
  const conflict = responses.find((response) => response.statusCode === 409);
  assert.equal(
    conflict === undefined ? undefined : readErrorCode(conflict),
    "AI_REVIEW_INVALID_TRANSITION",
  );

  const transactionRows = await query<{ total: number }>(
    `select count(*)::int as total from "Transaction" where "aiSuggestionId" = $1`,
    [suggestionId],
  );
  assert.equal(transactionRows[0]?.total, 1);
}

async function assertExplanationCannotAuthorizeTransaction(
  token: string,
  organizationId: string,
  suggestionId: string,
): Promise<void> {
  const accountRows = await query<{ id: string }>(
    `select "id" from "Account"
      where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
      order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = accountRows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");

  const now = new Date().toISOString();
  await query(`alter table "AiSuggestion" disable trigger "AiSuggestionPayloadContractInsert"`);
  try {
    await query(
      `insert into "AiSuggestion"
        ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
         "payload", "provider", "model", "createdAt", "updatedAt")
       values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.95, $4,
               null, 'legacy-provider', 'legacy-model', $5, $5)`,
      [
        suggestionId,
        organizationId,
        PERSONAL_PROFILE_ID,
        `CSV linha 2: 2026-08-04; expense; 9999 centavos; Compra falsa; conta ${accountId}. Revise antes de criar o lancamento final.`,
        now,
      ],
    );
  } finally {
    await query(`alter table "AiSuggestion" enable trigger "AiSuggestionPayloadContractInsert"`);
  }

  const response = await apiRequest(
    token,
    `/api/ai-review-queue/${suggestionId}/approve`,
    "POST",
  );
  assert.equal(response.statusCode, 422);
  assert.equal(readErrorCode(response), "AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED");

  const transactionRows = await query<{ total: number }>(
    `select count(*)::int as total from "Transaction" where "aiSuggestionId" = $1`,
    [suggestionId],
  );
  assert.equal(transactionRows[0]?.total, 0);
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
  path: string,
  method = "GET",
): Promise<ApiResponse> {
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
