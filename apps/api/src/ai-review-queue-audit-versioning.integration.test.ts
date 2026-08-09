import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
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
  const organizationId = await readOrganizationId();
  const accountId = await readActiveAccountId(organizationId);
  const token = await loginAndReadToken();
  const marker = randomUUID();
  const approvalSuggestionId = randomUUID();
  const editableSuggestionId = randomUUID();
  const now = new Date().toISOString();
  const approvalPayload = buildPayload({
    now,
    marker,
    accountId,
    sourceRowNumber: 1,
    sourceHash: `issue-565-audit-version-approve-${marker}`,
    description: `Compra sensivel aprovacao ${marker}`,
    amountMinor: 4321,
  });
  const editablePayload = buildPayload({
    now,
    marker,
    accountId,
    sourceRowNumber: 2,
    sourceHash: `issue-565-audit-version-edit-${marker}`,
    description: `Compra sensivel edicao ${marker}`,
    amountMinor: 8765,
  });

  try {
    await insertSuggestion(organizationId, approvalSuggestionId, approvalPayload, now);
    await insertSuggestion(organizationId, editableSuggestionId, editablePayload, now);

    const approvedDescription = `Descricao aprovada confidencial ${marker}`;
    const approveCorrelationId = `issue-565-audit-version-approve-${marker}`;
    const approved = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${approvalSuggestionId}/approve`,
      {
        expectedFingerprint: approvalPayload.fingerprint,
        payloadOverride: { amountMinor: 6543, description: approvedDescription },
      },
      approveCorrelationId,
    );
    assert.equal(approved.statusCode, 200);
    const approvedVersion = await readSuggestionVersion(approvalSuggestionId);
    assert.equal(approvedVersion?.status, "approved");
    assert.ok(approvedVersion?.fingerprint);
    assert.notEqual(approvedVersion?.fingerprint, approvalPayload.fingerprint);

    const approvalAudit = await readAuditVersion(
      organizationId,
      approvalSuggestionId,
      "APPROVE",
    );
    assert.equal(approvalAudit?.actorId, USER_ID);
    assert.equal(approvalAudit?.correlationId, approveCorrelationId);
    assert.ok(approvalAudit?.occurredAt instanceof Date);
    assert.equal(
      approvalAudit?.previousVersionRef,
      `pending_review@${approvalPayload.fingerprint}`,
    );
    assert.equal(
      approvalAudit?.nextVersionRef,
      `approved@${approvedVersion?.fingerprint}`,
    );
    assertRedacted(approvalAudit?.changes, [approvedDescription, "6543", "4321"]);

    const editedDescription = `Descricao editada confidencial ${marker}`;
    const editCorrelationId = `issue-565-audit-version-edit-${marker}`;
    const edited = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${editableSuggestionId}/edit`,
      {
        expectedFingerprint: editablePayload.fingerprint,
        payload: { description: editedDescription },
      },
      editCorrelationId,
    );
    assert.equal(edited.statusCode, 200);
    const editedVersion = await readSuggestionVersion(editableSuggestionId);
    assert.equal(editedVersion?.status, "pending_review");
    assert.ok(editedVersion?.fingerprint);
    assert.notEqual(editedVersion?.fingerprint, editablePayload.fingerprint);

    const editAudit = await readAuditVersion(organizationId, editableSuggestionId, "UPDATE");
    assert.equal(editAudit?.actorId, USER_ID);
    assert.equal(editAudit?.correlationId, editCorrelationId);
    assert.equal(editAudit?.previousVersionRef, `pending_review@${editablePayload.fingerprint}`);
    assert.equal(editAudit?.nextVersionRef, `pending_review@${editedVersion?.fingerprint}`);
    assertRedacted(editAudit?.changes, [editedDescription, "8765"]);

    const rejectCorrelationId = `issue-565-audit-version-reject-${marker}`;
    const rejected = await apiRequest(
      token,
      "POST",
      `/api/ai-review-queue/${editableSuggestionId}/reject`,
      { expectedFingerprint: editedVersion?.fingerprint },
      rejectCorrelationId,
    );
    assert.equal(rejected.statusCode, 200);
    const rejectedVersion = await readSuggestionVersion(editableSuggestionId);
    assert.equal(rejectedVersion?.status, "rejected");
    assert.equal(rejectedVersion?.fingerprint, editedVersion?.fingerprint);

    const rejectAudit = await readAuditVersion(organizationId, editableSuggestionId, "REJECT");
    assert.equal(rejectAudit?.actorId, USER_ID);
    assert.equal(rejectAudit?.correlationId, rejectCorrelationId);
    assert.equal(rejectAudit?.previousVersionRef, `pending_review@${editedVersion?.fingerprint}`);
    assert.equal(rejectAudit?.nextVersionRef, `rejected@${editedVersion?.fingerprint}`);
    assertRedacted(rejectAudit?.changes, [editedDescription, "8765"]);
  } finally {
    const suggestionIds = [approvalSuggestionId, editableSuggestionId];
    const transactionRows = await query<{ id: string }>(
      `select "id" from "Transaction" where "aiSuggestionId" = any($1::uuid[])`,
      [suggestionIds],
    );
    const entityIds = [...suggestionIds, ...transactionRows.map((row) => row.id)];
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
    await query(`delete from "Transaction" where "aiSuggestionId" = any($1::uuid[])`, [suggestionIds]);
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [suggestionIds]);
  }
}

function buildPayload(input: {
  now: string;
  marker: string;
  accountId: string;
  sourceRowNumber: number;
  sourceHash: string;
  description: string;
  amountMinor: number;
}) {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "system", component: "issue-565-audit-versioning-test" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: [`Fixture ficticia de auditoria ${input.marker}.`],
      audit: { createdAt: input.now },
      sourceRowNumber: input.sourceRowNumber,
      sourceHash: input.sourceHash,
      occurredOn: "2026-08-09",
      kind: "expense",
      direction: "outflow",
      amountMinor: input.amountMinor,
      currency: "BRL",
      description: input.description,
      accountId: input.accountId,
    },
  });
}

async function insertSuggestion(
  organizationId: string,
  suggestionId: string,
  payload: ReturnType<typeof buildPayload>,
  now: string,
): Promise<void> {
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "payloadFingerprint",
       "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null,
             0.91, 'Fixture de auditoria de versao da issue 565.', $4::jsonb, $5,
             'solverfin-test', 'issue-565-audit-versioning', null, null, $6, $6)`,
    [
      suggestionId,
      organizationId,
      PERSONAL_PROFILE_ID,
      JSON.stringify(payload),
      payload.fingerprint,
      now,
    ],
  );
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

async function readSuggestionVersion(
  suggestionId: string,
): Promise<SuggestionVersionRow | undefined> {
  const rows = await query<SuggestionVersionRow>(
    `select lower("status"::text) as "status",
            coalesce("payload"->>'fingerprint', "payloadFingerprint") as "fingerprint"
       from "AiSuggestion" where "id" = $1`,
    [suggestionId],
  );
  return rows[0];
}

async function readAuditVersion(
  organizationId: string,
  suggestionId: string,
  action: "APPROVE" | "UPDATE" | "REJECT",
): Promise<AuditVersionRow | undefined> {
  const rows = await query<AuditVersionRow>(
    `select "actorId",
            "occurredAt",
            "correlationId",
            "redactedChanges"->>'previousVersionRef' as "previousVersionRef",
            "redactedChanges"->>'nextVersionRef' as "nextVersionRef",
            "redactedChanges"::text as "changes"
       from "AuditLogEntry"
      where "organizationId" = $1 and "financialProfileId" = $2
        and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3 and "action" = $4
      order by "occurredAt" desc, "id" desc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID, suggestionId, action],
  );
  return rows[0];
}

function assertRedacted(changes: string | null | undefined, forbidden: readonly string[]): void {
  assert.ok(changes, "Expected redacted audit changes.");
  for (const value of forbidden) {
    assert.equal(
      changes.includes(value),
      false,
      `Audit version metadata must not contain sensitive value ${value}.`,
    );
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

interface SuggestionVersionRow {
  status: string;
  fingerprint: string | null;
}

interface AuditVersionRow {
  actorId: string | null;
  occurredAt: Date;
  correlationId: string | null;
  previousVersionRef: string | null;
  nextVersionRef: string | null;
  changes: string | null;
}
