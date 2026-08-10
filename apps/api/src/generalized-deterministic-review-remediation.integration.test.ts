import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";
import type { PoolClient } from "pg";

import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
import { closePool, getPool, query } from "./db.js";
import { tryHandleGeneralizedDeterministicDecisionForContext } from "./generalized-deterministic-review-decision.js";
import { scanPendingDeterministicReviewSuggestionsForContext } from "./generalized-deterministic-review-scan.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const CHECKING_ACCOUNT_ID = "44444444-4444-4444-8444-444444444441";

const context: TenantContext = {
  userId: USER_ID,
  organizationId: ORGANIZATION_ID,
  financialProfileId: PERSONAL_PROFILE_ID,
  financialProfileKind: "personal",
};

interface Ledger {
  suggestionIds: string[];
  transactionIds: string[];
  importBatchIds: string[];
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const marker = randomUUID();
  const token = await loginAndReadToken();
  const ledger: Ledger = {
    suggestionIds: [],
    transactionIds: [],
    importBatchIds: [],
  };

  try {
    await assertProducerLinksAndApiContracts(token, marker, ledger);
    await assertDiscardedBatchLifecycle(token, marker, ledger);
    await assertScannerDecisionSerialization(marker, ledger);
  } finally {
    await cleanup(ledger);
  }
}

async function assertProducerLinksAndApiContracts(
  token: string,
  marker: string,
  ledger: Ledger,
): Promise<void> {
  const description = `Contrato generalizado ${marker}`;
  const targetId = await insertTransaction(
    {
      description,
      amountMinor: 18001,
      occurredOn: "2026-08-10",
    },
    ledger,
  );

  const producerSpecs = [
    ["csv", "solverfin-import-csv", "CSV"],
    ["ofx", "solverfin-import-ofx", "OFX"],
    ["bank", "solverfin-rule-bank-message-inbox", "BANK_MESSAGE"],
  ] as const;
  const sources = new Map<string, { sourceId: string; batchId: string }>();

  for (const [name, provider, sourceKind] of producerSpecs) {
    const batchId = await insertImportBatch(sourceKind, `${name}-${marker}`, ledger);
    const source = await insertExtraction(
      {
        provider,
        description,
        amountMinor: 18001,
        occurredOn: "2026-08-10",
        sourceHash: `${name}-source-${marker}`,
        sourceEntityId: batchId,
      },
      ledger,
    );
    sources.set(name, { sourceId: source.id, batchId });
  }

  const aiSource = await insertExtraction(
    {
      provider: "fake-provider",
      description,
      amountMinor: 18001,
      occurredOn: "2026-08-10",
      sourceHash: `ai-source-${marker}`,
    },
    ledger,
  );

  const listed = await apiRequest(
    token,
    "GET",
    "/api/ai-review-queue?status=all&includeLowConfidence=true",
  );
  assert.equal(listed.statusCode, 200);

  for (const source of sources.values()) {
    assert.equal(await countCandidates(source.sourceId, "PENDING_REVIEW"), 2);
  }
  assert.equal(await countCandidates(aiSource.id, "PENDING_REVIEW"), 2);

  const csv = requireSource(sources, "csv");
  const importedCandidate = await readPendingCandidate(csv.sourceId, "DEDUPLICATION", targetId);
  const importedDetail = await readCandidateDetail(token, importedCandidate.id);
  const importedDecision = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${importedCandidate.id}/approve`,
    { expectedFingerprint: importedDetail.fingerprint },
  );
  assert.equal(importedDecision.statusCode, 200);
  const importedBody = readBody<DecisionBody>(importedDecision);
  assert.equal(importedBody.suggestion.status, "approved");
  assert.equal(importedBody.sourceSuggestion?.status, "rejected");
  assert.equal(importedBody.importBatch?.id, csv.batchId);
  assert.equal(importedBody.transaction, undefined);

  const aiCandidate = await readPendingCandidate(aiSource.id, "DEDUPLICATION", targetId);
  const aiDetail = await readCandidateDetail(token, aiCandidate.id);
  const aiDecision = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${aiCandidate.id}/approve`,
    { expectedFingerprint: aiDetail.fingerprint },
  );
  assert.equal(aiDecision.statusCode, 200);
  const aiBody = readBody<DecisionBody>(aiDecision);
  assert.equal(aiBody.suggestion.status, "approved");
  assert.equal(aiBody.sourceSuggestion?.status, "rejected");
  assert.equal(aiBody.importBatch, undefined);
  assert.equal(aiBody.transaction, undefined);
}

async function assertDiscardedBatchLifecycle(
  token: string,
  marker: string,
  ledger: Ledger,
): Promise<void> {
  const description = `Mensagem descartada ${marker}`;
  const targetId = await insertTransaction(
    {
      description,
      amountMinor: 28002,
      occurredOn: "2026-08-11",
    },
    ledger,
  );
  const batchId = await insertImportBatch("BANK_MESSAGE", `discard-${marker}`, ledger);
  const source = await insertExtraction(
    {
      provider: "solverfin-rule-bank-message-inbox",
      description,
      amountMinor: 28002,
      occurredOn: "2026-08-11",
      sourceHash: `discard-source-${marker}`,
      sourceEntityId: batchId,
    },
    ledger,
  );

  await scanPendingDeterministicReviewSuggestionsForContext(context);
  assert.equal(await countCandidates(source.id, "PENDING_REVIEW"), 2);
  const candidate = await readPendingCandidate(source.id, "DEDUPLICATION", targetId);
  const detail = await readCandidateDetail(token, candidate.id);

  await query(
    `update "ImportBatch" set "status" = 'DISCARDED', "updatedAt" = now() where "id" = $1`,
    [batchId],
  );

  const rejectedDecision = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${candidate.id}/approve`,
    { expectedFingerprint: detail.fingerprint },
  );
  assert.equal(rejectedDecision.statusCode, 409);
  assert.equal(readErrorCode(rejectedDecision), "AI_REVIEW_SOURCE_DISCARDED");

  const scan = await scanPendingDeterministicReviewSuggestionsForContext(context);
  assert.ok(scan.expiredCandidates >= 2);
  assert.equal(await countCandidates(source.id, "PENDING_REVIEW"), 0);
  assert.equal(await countCandidates(source.id, "EXPIRED"), 2);
  assert.equal(await readSuggestionStatus(source.id), "PENDING_REVIEW");
}

async function assertScannerDecisionSerialization(marker: string, ledger: Ledger): Promise<void> {
  const description = `Corrida scanner decisão ${marker}`;
  const firstTargetId = await insertTransaction(
    {
      description,
      amountMinor: 38003,
      occurredOn: "2026-08-12",
    },
    ledger,
  );
  const source = await insertExtraction(
    {
      provider: "fake-provider",
      description,
      amountMinor: 38003,
      occurredOn: "2026-08-12",
      sourceHash: `race-source-${marker}`,
    },
    ledger,
  );
  await scanPendingDeterministicReviewSuggestionsForContext(context);
  const decisionCandidate = await readPendingCandidate(source.id, "DEDUPLICATION", firstTargetId);

  const secondTargetId = await insertTransaction(
    {
      description,
      amountMinor: 38003,
      occurredOn: "2026-08-12",
    },
    ledger,
  );

  const blocker = await getPool().connect();
  let blockerOpen = false;
  try {
    await blocker.query("BEGIN");
    blockerOpen = true;
    await insertBlockingCandidate(blocker, source, secondTargetId);

    const scanPromise = scanPendingDeterministicReviewSuggestionsForContext(context);
    await waitUntilSourceLocked(source.id);

    const decisionPromise = tryHandleGeneralizedDeterministicDecisionForContext(
      context,
      decisionCandidate.id,
      "approve",
      { expectedFingerprint: decisionCandidate.fingerprint },
    );

    await blocker.query("ROLLBACK");
    blockerOpen = false;

    await scanPromise;
    const decision = await decisionPromise;
    assert.equal(decision?.suggestion.status, "approved");
    assert.equal(decision?.sourceSuggestion?.status, "rejected");
    assert.equal(await countCandidates(source.id, "PENDING_REVIEW"), 0);
    assert.equal(await readSuggestionStatus(source.id), "REJECTED");
  } finally {
    if (blockerOpen) await blocker.query("ROLLBACK");
    blocker.release();
  }
}

async function insertTransaction(
  input: { description: string; amountMinor: number; occurredOn: string },
  ledger: Ledger,
): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into "Transaction"
      ("id", "organizationId", "financialProfileId", "accountId", "kind", "status", "source",
       "amountMinor", "currency", "occurredOn", "plannedOn", "description", "createdByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'POSTED', 'MANUAL', $5, 'BRL', $6::date, $6::date, $7, $8, now(), now())`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      CHECKING_ACCOUNT_ID,
      input.amountMinor,
      input.occurredOn,
      input.description,
      USER_ID,
    ],
  );
  ledger.transactionIds.push(id);
  return id;
}

async function insertImportBatch(
  sourceKind: "CSV" | "OFX" | "BANK_MESSAGE",
  sourceHash: string,
  ledger: Ledger,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `insert into "ImportBatch"
      ("id", "organizationId", "financialProfileId", "sourceKind", "status", "originalFileName",
       "sourceHash", "totalRows", "validRows", "problems", "receivedAt", "completedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'REVIEWING', $5, $6, 1, 1, '[]'::jsonb, $7, null, $7, $7)`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      sourceKind,
      `issue-566-${sourceKind}.fixture`,
      sourceHash,
      now,
    ],
  );
  ledger.importBatchIds.push(id);
  return id;
}

async function insertExtraction(
  input: {
    provider: string;
    description: string;
    amountMinor: number;
    occurredOn: string;
    sourceHash: string;
    sourceEntityId?: string;
  },
  ledger: Ledger,
): Promise<{ id: string; fingerprint: string }> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: input.provider },
      target: { entityKind: "transaction" },
      confidence: 0.96,
      reasons: ["Fixture de remediação da issue 566."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: input.sourceHash,
      occurredOn: input.occurredOn,
      kind: "expense",
      direction: "outflow",
      amountMinor: input.amountMinor,
      currency: "BRL",
      description: input.description,
      accountId: CHECKING_ACCOUNT_ID,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', $4, null, 0.96,
             'Fixture de remediação da issue 566.', $5::jsonb, $6, $7, 'issue-566-remediation', null, null, $8, $8)`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      input.sourceEntityId ?? null,
      JSON.stringify(payload),
      payload.fingerprint,
      input.provider,
      now,
    ],
  );
  ledger.suggestionIds.push(id);
  return { id, fingerprint: payload.fingerprint };
}

async function insertBlockingCandidate(
  client: PoolClient,
  source: { id: string; fingerprint: string },
  targetId: string,
): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "deduplication",
      payloadVersion: 1,
      origin: { kind: "rule", ruleId: "deterministic-review-v3" },
      target: { entityKind: "transaction", entityId: targetId },
      confidence: 0.9,
      reasons: ["Fixture transacional de bloqueio da issue 566."],
      audit: { createdAt: now, sourceFingerprint: source.fingerprint },
      sourceSuggestionId: source.id,
      sourcePayloadFingerprint: source.fingerprint,
      targetTransactionId: targetId,
      conflicts: [],
    },
  });
  await client.query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "sourceSuggestionId", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'DEDUPLICATION', 'PENDING_REVIEW', null, $4, 0.9,
             'Fixture transacional de bloqueio da issue 566.', $5::jsonb, $6, $7,
             'solverfin-rule', 'deduplication-v3', null, null, $8, $8)`,
    [
      id,
      ORGANIZATION_ID,
      PERSONAL_PROFILE_ID,
      targetId,
      JSON.stringify(payload),
      source.id,
      source.fingerprint,
      now,
    ],
  );
}

async function waitUntilSourceLocked(sourceId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await client.query("BEGIN");
      try {
        await client.query(`select "id" from "AiSuggestion" where "id" = $1 for update nowait`, [
          sourceId,
        ]);
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        if (readPgErrorCode(error) === "55P03") return;
        throw error;
      }
      await delay(10);
    }
  } finally {
    client.release();
  }
  assert.fail("Scanner should hold the source row lock while creating deterministic candidates.");
}

async function readPendingCandidate(
  sourceId: string,
  kind: "DEDUPLICATION" | "RECONCILIATION",
  targetId: string,
): Promise<{ id: string; fingerprint: string }> {
  const rows = await query<{
    id: string;
    fingerprint: string;
  }>(
    `select "id", "payload"->>'fingerprint' as "fingerprint" from "AiSuggestion"
     where "sourceSuggestionId" = $1 and "kind" = $2 and "targetEntityId" = $3
       and "status" = 'PENDING_REVIEW'
     order by "createdAt" desc limit 1`,
    [sourceId, kind, targetId],
  );
  assert.ok(rows[0], `Pending ${kind} candidate is required.`);
  return rows[0];
}

async function countCandidates(sourceId: string, status: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as "count" from "AiSuggestion"
     where "sourceSuggestionId" = $1 and "kind" in ('DEDUPLICATION', 'RECONCILIATION') and "status" = $2`,
    [sourceId, status],
  );
  return Number(rows[0]?.count ?? 0);
}

async function readSuggestionStatus(id: string): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "AiSuggestion" where "id" = $1`,
    [id],
  );
  return rows[0]?.status;
}

async function readCandidateDetail(token: string, candidateId: string): Promise<PayloadDetail> {
  const response = await apiRequest(token, "GET", `/api/ai-review-queue/${candidateId}/payload`);
  assert.equal(response.statusCode, 200);
  return readBody<PayloadResponse>(response).payload;
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
  return readBody<SessionResponse>(response).session.token;
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
    (await handleCategorizationAwareAiReviewQueueApiRequest(request)) ??
    (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled.`);
  return response;
}

function requireSource(
  sources: Map<string, { sourceId: string; batchId: string }>,
  key: string,
): { sourceId: string; batchId: string } {
  const source = sources.get(key);
  assert.ok(source);
  return source;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<ErrorBody>(response).error?.code;
}

function readPgErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function cleanup(ledger: Ledger): Promise<void> {
  const allSuggestionRows =
    ledger.suggestionIds.length === 0
      ? []
      : await query<{ id: string }>(
          `select "id" from "AiSuggestion"
           where "id" = any($1::uuid[]) or "sourceSuggestionId" = any($1::uuid[])`,
          [ledger.suggestionIds],
        );
  const allSuggestionIds = allSuggestionRows.map((row) => row.id);
  const entityIds = [...allSuggestionIds, ...ledger.transactionIds, ...ledger.importBatchIds];

  if (entityIds.length > 0) {
    await query(`delete from "AuditLogEntry" where "entityId" = any($1::uuid[])`, [entityIds]);
  }
  if (allSuggestionIds.length > 0) {
    await query(`delete from "AiSuggestion" where "id" = any($1::uuid[])`, [allSuggestionIds]);
  }
  if (ledger.transactionIds.length > 0) {
    await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [ledger.transactionIds]);
  }
  if (ledger.importBatchIds.length > 0) {
    await query(`delete from "ImportBatch" where "id" = any($1::uuid[])`, [ledger.importBatchIds]);
  }
}

interface PayloadDetail {
  fingerprint: string;
}

interface PayloadResponse {
  payload: PayloadDetail;
}

interface DecisionBody {
  suggestion: { status: string };
  sourceSuggestion?: { status: string };
  transaction?: { id: string; status: string };
  importBatch?: { id: string; status: string };
}

interface SessionResponse {
  session: { token: string };
}

interface ErrorBody {
  error?: { code?: string };
}
