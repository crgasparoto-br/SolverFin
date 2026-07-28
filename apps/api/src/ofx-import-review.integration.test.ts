import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for OFX integration tests.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, suffix);

  await assertPreviewDoesNotPersist(token, accountId, suffix);
  const created = await assertConcurrentCreationConverges(token, accountId, suffix);
  await assertReviewLifecycle(token, created);
  await assertTenantIsolationAndMixedListing(token, created.importBatch.id);
  await assertRawContentWasNotPersisted(suffix);
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta OFX ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function assertPreviewDoesNotPersist(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const before = await countOfxBatches();
  const rawSecret = `preview-secret-${suffix}`;
  const response = await apiRequest(token, "POST", "/api/import-batches/ofx/preview", {
    originalFileName: `preview-${suffix}.ofx`,
    content: ofx(
      `<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260717<TRNAMT>-12.34<FITID>${suffix}-preview<NAME>Mercado ${suffix}<REFNUM>${rawSecret}`,
    ),
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 200);
  const body = readBody<{
    state: string;
    persisted: boolean;
    batch: { sourceKind: string; validRows: number };
    suggestions: Array<{ kind: string; direction: string; amountMinor: number; accountId: string }>;
    problems: Array<{ code: string }>;
  }>(response);
  assert.equal(body.state, "ready");
  assert.equal(body.persisted, false);
  assert.equal(body.batch.sourceKind, "ofx");
  assert.equal(body.batch.validRows, 1);
  const suggestion = body.suggestions[0];
  assert.ok(suggestion);
  assert.equal(suggestion.kind, "expense");
  assert.equal(suggestion.direction, "outflow");
  assert.equal(suggestion.amountMinor, 1234);
  assert.equal(suggestion.accountId, accountId);
  assert.ok(body.problems.some((problem) => problem.code === "IMPORT_OFX_TRNTYPE_CONFLICT"));
  assert.equal(JSON.stringify(body).includes(rawSecret), false);
  assert.equal(await countOfxBatches(), before);
}

async function assertConcurrentCreationConverges(
  token: string,
  accountId: string,
  suffix: string,
): Promise<ImportDetail> {
  const payload = {
    originalFileName: `concurrent-${suffix}.ofx`,
    content: ofx(
      [
        `<STMTTRN><DTPOSTED>20260718<TRNAMT>-20.00<FITID>${suffix}-one<NAME>Despesa OFX ${suffix}<REFNUM>raw-persistence-secret-${suffix}`,
        `<STMTTRN><DTPOSTED>20260719<TRNAMT>30.00<FITID>${suffix}-two<MEMO>Receita OFX ${suffix}`,
      ].join(""),
    ),
    accountId,
    consentAccepted: true,
  };
  const [first, second] = await Promise.all([
    apiRequest(token, "POST", "/api/import-batches/ofx", payload),
    apiRequest(token, "POST", "/api/import-batches/ofx", payload),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
  const firstBody = readBody<ImportDetail & { duplicateBatch: boolean }>(first);
  const secondBody = readBody<ImportDetail & { duplicateBatch: boolean }>(second);
  assert.equal(firstBody.importBatch.id, secondBody.importBatch.id);
  assert.equal([firstBody.duplicateBatch, secondBody.duplicateBatch].filter(Boolean).length, 1);
  assert.equal(firstBody.importBatch.sourceKind, "ofx");
  assert.equal(firstBody.suggestions.length, 2);
  const rows = await query<{ total: number }>(
    `select count(*)::int as total from "ImportBatch" where "id" = $1`,
    [firstBody.importBatch.id],
  );
  assert.equal(rows[0]?.total, 1);
  return firstBody;
}

async function assertReviewLifecycle(token: string, detail: ImportDetail): Promise<void> {
  const first = requireSuggestion(detail, 0);
  const approval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${detail.importBatch.id}/suggestions/${first.id}/approve`,
  );
  assert.equal(approval.statusCode, 200);
  const approved = readBody<{
    outcome: string;
    suggestion: { status: string; targetEntityId: string };
    transaction: { id: string; importBatchId: string; aiSuggestionId: string; source: string };
  }>(approval);
  assert.equal(approved.outcome, "created");
  assert.equal(approved.suggestion.status, "approved");
  assert.equal(approved.suggestion.targetEntityId, approved.transaction.id);
  assert.equal(approved.transaction.importBatchId, detail.importBatch.id);
  assert.equal(approved.transaction.aiSuggestionId, first.id);
  assert.equal(approved.transaction.source, "import");

  const retry = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${detail.importBatch.id}/suggestions/${first.id}/approve`,
  );
  assert.equal(retry.statusCode, 200);
  assert.equal(readBody<{ idempotent: boolean }>(retry).idempotent, true);

  const second = requireSuggestion(detail, 1);
  const rejection = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${detail.importBatch.id}/suggestions/${second.id}/reject`,
    { reason: "Linha rejeitada no teste OFX" },
  );
  assert.equal(rejection.statusCode, 200);
  const completed = await apiRequest(token, "GET", `/api/import-batches/${detail.importBatch.id}`);
  assert.equal(completed.statusCode, 200);
  assert.equal(readBody<ImportDetail>(completed).importBatch.status, "completed");
}

async function assertTenantIsolationAndMixedListing(
  token: string,
  importBatchId: string,
): Promise<void> {
  const isolated = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${importBatchId}?profileId=${MEI_PROFILE_ID}`,
  );
  assert.equal(isolated.statusCode, 404);
  assert.equal(readErrorCode(isolated), "TENANT_RESOURCE_NOT_FOUND");

  const all = await apiRequest(token, "GET", "/api/import-batches?status=all");
  assert.equal(all.statusCode, 200);
  assert.ok(
    readBody<{ importBatches: Array<{ id: string; sourceKind: string }> }>(all).importBatches.some(
      (batch) => batch.id === importBatchId && batch.sourceKind === "ofx",
    ),
  );

  const filtered = await apiRequest(token, "GET", "/api/import-batches?sourceKind=ofx&status=all");
  assert.equal(filtered.statusCode, 200);
  assert.ok(
    readBody<{ importBatches: Array<{ sourceKind: string }> }>(filtered).importBatches.every(
      (batch) => batch.sourceKind === "ofx",
    ),
  );

  const invalid = await apiRequest(token, "GET", "/api/import-batches?sourceKind=pdf");
  assert.equal(invalid.statusCode, 400);
  assert.equal(readErrorCode(invalid), "IMPORT_SOURCE_KIND_INVALID");
}

async function assertRawContentWasNotPersisted(suffix: string): Promise<void> {
  const secret = `raw-persistence-secret-${suffix}`;
  const rows = await query<{ total: number }>(
    `select (
       (select count(*) from "ImportBatch" where cast("problems" as text) like $1) +
       (select count(*) from "AiSuggestion" where cast("payload" as text) like $1 or "explanation" like $1) +
       (select count(*) from "AuditLogEntry" where cast("redactedChanges" as text) like $1 or "reason" like $1)
     )::int as total`,
    [`%${secret}%`],
  );
  assert.equal(rows[0]?.total, 0);
}

function ofx(transactions: string): string {
  return `OFXHEADER:100\nDATA:OFXSGML\n<OFX><STMTRS><CURDEF>BRL<BANKTRANLIST>${transactions}</BANKTRANLIST></STMTRS></OFX>`;
}

async function countOfxBatches(): Promise<number> {
  const rows = await query<{ total: number }>(
    `select count(*)::int as total from "ImportBatch" where "sourceKind" = 'OFX'`,
  );
  return rows[0]?.total ?? 0;
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
    (await handleImportBatchesApiRequest(request)) ??
    (await handleDeduplicationReconciliationApiRequest(request)) ??
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
  assert.ok(suggestion, `Expected suggestion at index ${index}`);
  return suggestion;
}

interface ImportBatch {
  id: string;
  sourceKind: string;
  status: string;
}

interface ImportSuggestion {
  id: string;
  status: string;
}

interface ImportDetail {
  importBatch: ImportBatch;
  suggestions: ImportSuggestion[];
  problems: unknown[];
}
