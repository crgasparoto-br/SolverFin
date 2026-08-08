import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import {
  handleDeduplicationReconciliationApiRequest as handleDeterministicRequest,
} from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

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
  const token = await loginAndReadToken();
  const suffix = randomUUID();
  const fixtures = await createFixtures(token, suffix);

  await assertUnifiedDecision({
    token,
    organizationId,
    fixtures,
    suffix,
    kind: "deduplication",
    amountMinor: 4567,
    occurredOn: "2026-08-07",
    expectedSourceStatus: "rejected",
  });
  await assertUnifiedDecision({
    token,
    organizationId,
    fixtures,
    suffix,
    kind: "reconciliation",
    amountMinor: 7654,
    occurredOn: "2026-08-08",
    expectedSourceStatus: "approved",
  });
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

async function createFixtures(token: string, suffix: string): Promise<Fixtures> {
  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta review deterministic ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(accountResponse.statusCode, 201);
  const accountId = readBody<{ account: { id: string } }>(accountResponse).account.id;

  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria review deterministic ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const categoryId = readBody<{ category: { id: string } }>(categoryResponse).category.id;

  return { accountId, categoryId };
}

async function assertUnifiedDecision(input: ScenarioInput): Promise<void> {
  const correlationId = `issue-565-${input.kind}-${input.suffix}`;
  const description = `${input.kind} fila unificada ${input.suffix}`;
  const existing = await createTransaction(input.token, input.fixtures, {
    description,
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
  });
  const imported = await createImportSuggestion(input.token, input.fixtures.accountId, {
    description,
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
    fileName: `issue-565-${input.kind}-${input.suffix}.csv`,
  });
  const source = requireSuggestion(imported, 0);
  const scan = await apiRequest(
    input.token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/detect-duplicates`,
    undefined,
    correlationId,
  );
  assert.equal(scan.statusCode, 200);
  const scanBody = readBody<ScanBody>(scan);
  const candidates =
    input.kind === "deduplication"
      ? scanBody.deduplicationSuggestions
      : scanBody.reconciliationSuggestions;
  const candidate = candidates.find(
    (item) => item.payload.targetTransactionId === existing.id,
  );
  assert.ok(candidate, `Expected ${input.kind} candidate for the matching transaction.`);

  await assertCandidateIsListed(input.token, candidate.id, input.kind, correlationId);
  const detail = await readCandidateDetail(input.token, candidate.id, correlationId);
  assert.equal(detail.suggestionKind, input.kind);

  const unsupportedEdit = await apiRequest(
    input.token,
    "POST",
    `/api/ai-review-queue/${candidate.id}/edit`,
    { expectedFingerprint: detail.fingerprint, payload: { conflicts: [] } },
    correlationId,
  );
  assert.equal(unsupportedEdit.statusCode, 422);
  assert.equal(readErrorCode(unsupportedEdit), "AI_REVIEW_EDIT_NOT_SUPPORTED");

  const approved = await apiRequest(
    input.token,
    "POST",
    `/api/ai-review-queue/${candidate.id}/approve`,
    { expectedFingerprint: detail.fingerprint },
    correlationId,
  );
  assert.equal(approved.statusCode, 200);
  const approvedBody = readBody<DecisionBody>(approved);
  assert.equal(approvedBody.suggestion.status, "approved");
  assert.equal(approvedBody.sourceSuggestion?.status, input.expectedSourceStatus);
  assert.equal(approvedBody.idempotent, false);
  assert.equal(await countTransactionsForSuggestion(input.organizationId, source.id), 0);

  if (input.kind === "reconciliation") {
    assert.equal(approvedBody.transaction?.id, existing.id);
    assert.equal(approvedBody.transaction?.status, "reconciled");
    const status = await readTransactionStatus(input.organizationId, existing.id);
    assert.equal(status, "RECONCILED");
  } else {
    assert.equal(approvedBody.transaction, undefined);
  }

  const repeated = await apiRequest(
    input.token,
    "POST",
    `/api/ai-review-queue/${candidate.id}/approve`,
    { expectedFingerprint: detail.fingerprint },
    correlationId,
  );
  assert.equal(repeated.statusCode, 200);
  assert.equal(readBody<{ idempotent?: boolean }>(repeated).idempotent, true);

  await assertDecisionAudit(input.organizationId, candidate.id, correlationId);
}

async function createTransaction(
  token: string,
  fixtures: Fixtures,
  input: TransactionFixture,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
    accountId: fixtures.accountId,
    categoryId: fixtures.categoryId,
    description: input.description,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ transaction: { id: string } }>(response).transaction;
}

async function createImportSuggestion(
  token: string,
  accountId: string,
  input: ImportFixture,
): Promise<ImportDetail> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: input.fileName,
    content: [
      "date,description,amount,kind",
      `${input.occurredOn},${input.description},-${(input.amountMinor / 100).toFixed(2)},expense`,
    ].join("\n"),
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  return readBody<ImportDetail>(response);
}

async function assertCandidateIsListed(
  token: string,
  candidateId: string,
  kind: ReviewKind,
  correlationId: string,
): Promise<void> {
  const response = await apiRequest(
    token,
    "GET",
    "/api/ai-review-queue?status=all&includeLowConfidence=true",
    undefined,
    correlationId,
  );
  assert.equal(response.statusCode, 200);
  const body = readBody<{ suggestions: Array<{ id: string; kind: string }> }>(response);
  const item = body.suggestions.find((suggestion) => suggestion.id === candidateId);
  assert.equal(item?.kind, kind);
}

async function readCandidateDetail(
  token: string,
  candidateId: string,
  correlationId: string,
): Promise<PayloadDetail> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/ai-review-queue/${candidateId}/payload`,
    undefined,
    correlationId,
  );
  assert.equal(response.statusCode, 200);
  return readBody<{ payload: PayloadDetail }>(response).payload;
}

async function countTransactionsForSuggestion(
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

async function readTransactionStatus(
  organizationId: string,
  transactionId: string,
): Promise<string | undefined> {
  const rows = await query<{ status: string }>(
    `select "status" from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [transactionId, organizationId, PERSONAL_PROFILE_ID],
  );
  return rows[0]?.status;
}

async function assertDecisionAudit(
  organizationId: string,
  suggestionId: string,
  correlationId: string,
): Promise<void> {
  const rows = await query<AuditRow>(
    `select "actorId", "occurredAt", "correlationId", "redactedChanges"
     from "AuditLogEntry"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3 and "action" = 'APPROVE'
     order by "occurredAt" desc, "id" desc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID, suggestionId],
  );
  const audit = rows[0];
  assert.ok(audit, "Expected approval audit for the unified deterministic decision.");
  assert.equal(audit.actorId, USER_ID);
  assert.ok(audit.occurredAt instanceof Date);
  assert.equal(audit.correlationId, correlationId);
  assert.equal(audit.redactedChanges?.previousState, "changed");
  assert.equal(audit.redactedChanges?.nextState, "changed");
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ session: { token: string } }>(response).session.token;
}

async function apiRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  correlationId?: string,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers: {
      authorization: `Bearer ${token}`,
      ...(correlationId === undefined ? {} : { "x-correlation-id": correlationId }),
    },
    body,
  };
  const response =
    (await handleImportBatchesApiRequest(request)) ??
    (await handleDeterministicRequest(request)) ??
    (await handleAiReviewQueueApiRequest(request)) ??
    (await handleApiRequest(request));
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
  assert.ok(suggestion, `Expected import suggestion at index ${index}`);
  return suggestion;
}

type ReviewKind = "deduplication" | "reconciliation";

interface Fixtures {
  accountId: string;
  categoryId: string;
}

interface ScenarioInput {
  token: string;
  organizationId: string;
  fixtures: Fixtures;
  suffix: string;
  kind: ReviewKind;
  amountMinor: number;
  occurredOn: string;
  expectedSourceStatus: "approved" | "rejected";
}

interface TransactionFixture {
  description: string;
  amountMinor: number;
  occurredOn: string;
}

interface ImportFixture extends TransactionFixture {
  fileName: string;
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: ImportSuggestion[];
}

interface ImportSuggestion {
  id: string;
  status: string;
}

interface DeterministicSuggestion {
  id: string;
  kind: string;
  status: string;
  payload: { targetTransactionId?: string };
}

interface ScanBody {
  deduplicationSuggestions: DeterministicSuggestion[];
  reconciliationSuggestions: DeterministicSuggestion[];
}

interface PayloadDetail {
  suggestionKind: string;
  fingerprint: string;
}

interface DecisionBody {
  suggestion: { status: string };
  sourceSuggestion?: { status: string };
  transaction?: { id: string; status: string };
  idempotent?: boolean;
}

interface AuditRow {
  actorId: string | null;
  occurredAt: Date;
  correlationId: string | null;
  redactedChanges: Record<string, string> | null;
}
