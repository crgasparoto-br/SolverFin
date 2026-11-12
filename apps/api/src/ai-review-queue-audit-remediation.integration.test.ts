import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const organizationId = await readOrganizationId();
  const accountId = await readActiveAccountId(organizationId);
  const token = await loginAndReadToken();
  const suggestionId = randomUUID();
  const marker = randomUUID();
  const correlationId = `issue-565-audit-remediation-${marker}`;
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "system", component: "issue-565-audit-remediation-test" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: ["Fixture para validar precondicao de versao e replay idempotente."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `issue-565-audit-${marker}`,
      occurredOn: "2026-08-08",
      kind: "expense",
      direction: "outflow",
      amountMinor: 4321,
      currency: "BRL",
      description: `Compra audit remediation ${marker}`,
      accountId,
    },
  });

  try {
    await query(
      `insert into "AiSuggestion"
        ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
         "targetEntityId", "confidence", "explanation", "payload", "payloadFingerprint",
         "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null,
               0.91, 'Fixture de remediacao da issue 565.', $4::jsonb, $5,
               'solverfin-test', 'issue-565-audit-remediation', null, null, $6, $6)`,
      [
        suggestionId,
        organizationId,
        PERSONAL_PROFILE_ID,
        JSON.stringify(payload),
        payload.fingerprint,
        now,
      ],
    );

    for (const [action, body] of [
      ["approve", {}],
      ["reject", {}],
      ["edit", { payload: { description: "Descricao sem versao" } }],
    ] as const) {
      const response = await apiRequest(
        token,
        "POST",
        `/api/ai-review-queue/${suggestionId}/${action}`,
        body,
        correlationId,
      );
      assert.equal(response.statusCode, 428);
      assert.equal(readErrorCode(response), "AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED");
    }

    const pendingRows = await query<{ status: string }>(
      `select "status" from "AiSuggestion" where "id" = $1`,
      [suggestionId],
    );
    assert.equal(pendingRows[0]?.status, "PENDING_REVIEW");
    assert.equal(await countSuggestionTransactions(organizationId, suggestionId), 0);

    const approvedDescription = `Compra audit remediation aprovada ${marker}`;
    const approvalRequest = {
      expectedFingerprint: payload.fingerprint,
      payloadOverride: { amountMinor: 6543, description: approvedDescription },
    };
    const approved = await approveSuggestion(token, suggestionId, approvalRequest, correlationId);
    assert.equal(approved.statusCode, 200);
    const approvedBody = readBody<DecisionBody>(approved);
    assert.equal(approvedBody.suggestion.status, "approved");
    assert.equal(approvedBody.idempotent, false);
    assert.ok(approvedBody.transaction?.id);

    const approvedRow = await readApprovedPayload(suggestionId);
    assert.notEqual(approvedRow?.fingerprint, payload.fingerprint);
    assert.equal(approvedRow?.description, approvedDescription);
    assert.equal(approvedRow?.amountMinor, "6543");

    const staleRequest = { expectedFingerprint: `sha256-${"0".repeat(64)}` };
    const staleReplay = await approveSuggestion(token, suggestionId, staleRequest, correlationId);
    assert.equal(staleReplay.statusCode, 409);
    assert.equal(readErrorCode(staleReplay), "AI_SUGGESTION_PAYLOAD_CONFLICT");
    assert.equal(await countSuggestionTransactions(organizationId, suggestionId), 1);

    const retryCorrelationId = `${correlationId}-retry`;
    const repeated = await approveSuggestion(
      token,
      suggestionId,
      approvalRequest,
      retryCorrelationId,
    );
    assert.equal(repeated.statusCode, 200);
    const repeatedBody = readBody<DecisionBody>(repeated);
    assert.equal(repeatedBody.suggestion.status, "approved");
    assert.equal(repeatedBody.idempotent, true);
    assert.equal(repeatedBody.transaction?.id, approvedBody.transaction?.id);
    assert.equal(await countSuggestionTransactions(organizationId, suggestionId), 1);

    const differentRequest = {
      expectedFingerprint: payload.fingerprint,
      payloadOverride: { description: `Decisao diferente ${marker}` },
    };
    const differentCorrelationId = `${correlationId}-different`;
    const differentDecisionReplay = await approveSuggestion(
      token,
      suggestionId,
      differentRequest,
      differentCorrelationId,
    );
    assert.equal(differentDecisionReplay.statusCode, 409);
    const differentReplayCode = readErrorCode(differentDecisionReplay);
    assert.equal(differentReplayCode, "AI_SUGGESTION_PAYLOAD_CONFLICT");
    assert.equal(await countSuggestionTransactions(organizationId, suggestionId), 1);

    const approvalAudit = await readApprovalAudit(organizationId, suggestionId);
    assert.equal(approvalAudit?.count, "1");
    assert.match(approvalAudit?.replayKey ?? "", /^sha256-[a-f0-9]{64}$/);
  } finally {
    const transactionRows = await query<{ id: string }>(
      `select "id" from "Transaction" where "aiSuggestionId" = $1`,
      [suggestionId],
    );
    const entityIds = [suggestionId, ...transactionRows.map((row) => row.id)];
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
    await query(`delete from "Transaction" where "aiSuggestionId" = $1`, [suggestionId]);
    await query(`delete from "AiSuggestion" where "id" = $1`, [suggestionId]);
  }
}

async function readOrganizationId(): Promise<string> {
  const rows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = rows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");
  return organizationId;
}

async function readActiveAccountId(organizationId: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `select "id" from "Account"
     where "organizationId" = $1 and "financialProfileId" = $2 and "status" = 'ACTIVE'
     order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = rows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");
  return accountId;
}

async function countSuggestionTransactions(
  organizationId: string,
  suggestionId: string,
): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "aiSuggestionId" = $3`,
    [organizationId, PERSONAL_PROFILE_ID, suggestionId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function approveSuggestion(
  token: string,
  suggestionId: string,
  body: unknown,
  correlationId: string,
): Promise<ApiResponse> {
  const path = `/api/ai-review-queue/${suggestionId}/approve`;
  return apiRequest(token, "POST", path, body, correlationId);
}

async function readApprovedPayload(suggestionId: string): Promise<ApprovedPayloadRow | undefined> {
  const rows = await query<ApprovedPayloadRow>(
    `select "payload"->>'fingerprint' as "fingerprint",
            "payload"->>'description' as "description",
            "payload"->>'amountMinor' as "amountMinor"
       from "AiSuggestion" where "id" = $1`,
    [suggestionId],
  );
  return rows[0];
}

async function readApprovalAudit(
  organizationId: string,
  suggestionId: string,
): Promise<ApprovalAuditRow | undefined> {
  const rows = await query<ApprovalAuditRow>(
    `select max("redactedChanges"->>'approvalReplayKey') as "replayKey",
            count(*)::text as "count"
       from "AuditLogEntry"
      where "organizationId" = $1 and "financialProfileId" = $2
        and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3 and "action" = 'APPROVE'`,
    [organizationId, PERSONAL_PROFILE_ID, suggestionId],
  );
  return rows[0];
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
  assert.ok(response, `${method} ${path} should be handled by the public AI review queue router`);
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

interface DecisionBody {
  suggestion: { status: string };
  transaction?: { id: string };
  idempotent?: boolean;
}

interface ApprovedPayloadRow {
  fingerprint: string;
  description: string;
  amountMinor: string;
}

interface ApprovalAuditRow {
  replayKey: string | null;
  count: string;
}
