import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
import { closePool, query } from "./db.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest, ApiResponse } from "./router.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEEDED_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

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
    [SEEDED_PROFILE_ID],
  );
  const organizationId = organizationRows[0]?.organizationId;
  assert.ok(organizationId, "Seeded financial profile is required.");

  const profileId = randomUUID();
  const accountId = randomUUID();
  const legacyInsightId = randomUUID();
  const token = await loginAndReadToken();

  try {
    await query(
      `insert into "FinancialProfile"
        ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'PERSONAL', 'ACTIVE', now(), now())`,
      [profileId, organizationId, USER_ID, `Issue 567 remediation ${profileId}`],
    );
    await query(
      `insert into "Account"
        ("id", "organizationId", "financialProfileId", "name", "kind", "status", "currency",
         "openingBalanceMinor", "createdAt", "updatedAt")
       values ($1, $2, $3, 'Conta sem movimentos', 'CHECKING', 'ACTIVE', 'BRL', 0, now(), now())`,
      [accountId, organizationId, profileId],
    );
    await insertPendingInsightV1(organizationId, profileId, legacyInsightId);

    const response = await apiRequest(
      token,
      `/api/ai-review-queue?profileId=${profileId}&status=all&includeLowConfidence=true`,
    );
    assert.equal(response.statusCode, 200);
    const body = readBody<{
      suggestions: Array<{ id: string; status: string; kind: string }>;
      financialInsights?: {
        insufficientData?: Array<{
          currency: string;
          title: string;
          explanation: string;
          periodStartOn: string;
          periodEndOn: string;
        }>;
      };
    }>(response);

    const legacy = body.suggestions.find((item) => item.id === legacyInsightId);
    assert.ok(legacy, "A pending insight V1 must remain in the review queue even with scanner provider metadata.");
    assert.equal(legacy.status, "pending_review");
    assert.equal(legacy.kind, "insight");
    assert.equal(await readSuggestionStatus(legacyInsightId), "PENDING_REVIEW");

    const insufficientData = body.financialInsights?.insufficientData ?? [];
    assert.equal(insufficientData.length, 1);
    assert.equal(insufficientData[0]?.currency, "BRL");
    assert.match(insufficientData[0]?.title ?? "", /Dados insuficientes/i);
    assert.match(insufficientData[0]?.explanation ?? "", /lançamentos realizados|lancamentos realizados/i);
    assert.equal(await countScannerOwnedV2Insights(profileId), 0);
  } finally {
    await query(
      `delete from "AuditLogEntry" where "organizationId" = $1 and "financialProfileId" = $2`,
      [organizationId, profileId],
    );
    await query(`delete from "AiSuggestion" where "financialProfileId" = $1`, [profileId]);
    await query(`delete from "Account" where "id" = $1`, [accountId]);
    await query(`delete from "FinancialProfile" where "id" = $1`, [profileId]);
  }
}

async function insertPendingInsightV1(
  organizationId: string,
  profileId: string,
  insightId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "rule", ruleId: "legacy-financial-insight-rule" },
      target: { entityKind: "financial_profile", entityId: profileId },
      confidence: 0.84,
      reasons: ["Fixture V1 que compartilha o provider do scanner sem pertencer ao contrato V2."],
      audit: { createdAt: now },
      insightType: "summary",
      title: "Insight V1 pendente",
      summary: "Resumo V1 que deve continuar disponível para revisão.",
      periodStartOn: "2026-08-01",
      periodEndOn: "2026-08-11",
      metric: { name: "reviewed_items", value: 2, unit: "count" },
    },
  });

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'INSIGHT', 'PENDING_REVIEW', null, $3, 0.84,
             'Insight V1 que deve permanecer pendente.', $4::jsonb, 'solverfin-rule', 'legacy-v1',
             null, null, $5, $5)`,
    [insightId, organizationId, profileId, JSON.stringify(payload), now],
  );
}

async function apiRequest(token: string, path: string): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method: "GET",
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
  };
  const response = await handleCategorizationAwareAiReviewQueueApiRequest(request);
  assert.ok(response, `${path} should be handled by the categorization-aware review router`);
  return response;
}

async function readSuggestionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  return rows[0]?.status;
}

async function countScannerOwnedV2Insights(profileId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
     where "financialProfileId" = $1 and "kind" = 'INSIGHT' and "provider" = 'solverfin-rule'
       and "payload"->>'payloadVersion' = '2'`,
    [profileId],
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

function readBody<TBody>(response: Pick<ApiResponse, "body">): TBody {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as TBody;
}
