import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
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
  const fixtures = await createFixtures(token);

  const capturedLogs: string[] = [];
  await captureConsole(capturedLogs, async () => {
    await assertPreviewDoesNotPersist(token, fixtures.accountId, fixtures.suffix);
    const created = await assertConcurrentCreationConverges(
      token,
      fixtures.accountId,
      fixtures.suffix,
    );
    await assertReviewLifecycle(token, created);
    await assertConfigurationChangeUsesDistinctBatch(token, fixtures);
    await assertEditBulkConcurrencyAndDiscard(token, fixtures);
    await assertDeterministicDeduplicationAndReconciliation(token, fixtures);
    await assertTenantIsolationAndMixedListing(token, created.importBatch.id);
    await assertRawContentWasNotPersisted(fixtures.suffix);
  });
  assert.equal(
    capturedLogs.some((line) => line.includes(`preview-secret-${fixtures.suffix}`)),
    false,
  );
  assert.equal(
    capturedLogs.some((line) => line.includes(`raw-persistence-secret-${fixtures.suffix}`)),
    false,
  );
}

async function createFixtures(token: string): Promise<Fixtures> {
  const suffix = Date.now().toString(36);
  const accountId = await createAccount(token, `Conta OFX ${suffix}`);
  const otherAccountId = await createAccount(token, `Conta OFX alternativa ${suffix}`);
  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria OFX ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const categoryId = readBody<{ category: { id: string } }>(categoryResponse).category.id;
  return { suffix, accountId, otherAccountId, categoryId };
}

async function createAccount(token: string, name: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name,
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

async function assertConfigurationChangeUsesDistinctBatch(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const content = ofx(
    `<STMTTRN><DTPOSTED>20260720<TRNAMT>-14.25<FITID>${fixtures.suffix}-config<NAME>Configuração OFX ${fixtures.suffix}`,
  );
  const firstResponse = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `config-a-${fixtures.suffix}.ofx`,
    content,
    accountId: fixtures.accountId,
    consentAccepted: true,
  });
  const secondResponse = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `config-b-${fixtures.suffix}.ofx`,
    content,
    accountId: fixtures.otherAccountId,
    consentAccepted: true,
  });
  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 201);
  const first = readBody<ImportDetail>(firstResponse);
  const second = readBody<ImportDetail>(secondResponse);
  assert.notEqual(first.importBatch.id, second.importBatch.id);
  assert.notEqual(first.importBatch.sourceHash, second.importBatch.sourceHash);
  assert.ok(
    second.problems.some((problem) => problem.code === "IMPORT_BATCH_CONFIGURATION_CHANGED"),
  );
}

async function assertEditBulkConcurrencyAndDiscard(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const createResponse = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `review-operations-${fixtures.suffix}.ofx`,
    content: ofx(
      [
        `<STMTTRN><DTPOSTED>20260721<TRNAMT>-10.00<FITID>${fixtures.suffix}-edit<NAME>Editar OFX ${fixtures.suffix}`,
        `<STMTTRN><DTPOSTED>20260722<TRNAMT>-20.00<FITID>${fixtures.suffix}-bulk<NAME>Lote OFX ${fixtures.suffix}`,
      ].join(""),
    ),
    accountId: fixtures.accountId,
    consentAccepted: true,
  });
  assert.equal(createResponse.statusCode, 201);
  const created = readBody<ImportDetail>(createResponse);
  const first = requireSuggestion(created, 0);
  const second = requireSuggestion(created, 1);

  const updateResponse = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${created.importBatch.id}/suggestions/${first.id}`,
    {
      description: `Descrição OFX corrigida ${fixtures.suffix}`,
      amountMinor: 1099,
      categoryId: fixtures.categoryId,
    },
  );
  assert.equal(updateResponse.statusCode, 200);
  const updated = readBody<{ suggestion: ImportSuggestion }>(updateResponse).suggestion;
  assert.equal(updated.status, "pending_review");
  assert.equal(updated.payload.description, `Descrição OFX corrigida ${fixtures.suffix}`);
  assert.equal(updated.payload.amountMinor, 1099);
  assert.equal(updated.payload.categoryId, fixtures.categoryId);

  const concurrent = await Promise.all([
    apiRequest(
      token,
      "POST",
      `/api/import-batches/${created.importBatch.id}/suggestions/${first.id}/approve`,
    ),
    apiRequest(
      token,
      "POST",
      `/api/import-batches/${created.importBatch.id}/suggestions/${first.id}/approve`,
    ),
  ]);
  assert.deepEqual(
    concurrent.map((response) => response.statusCode),
    [200, 200],
  );
  const transactionIds = concurrent.map(
    (response) => readBody<{ transaction: { id: string } }>(response).transaction.id,
  );
  assert.equal(new Set(transactionIds).size, 1);

  const bulkResponse = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/approve-selected`,
    { suggestionIds: [second.id] },
  );
  assert.equal(bulkResponse.statusCode, 200);
  const bulk = readBody<{
    summary: {
      requested: number;
      approved: number;
      failed: number;
      created: number;
      reconciled: number;
      idempotent: number;
      blocked: number;
    };
    importBatch: ImportBatch;
  }>(bulkResponse);
  assert.equal(bulk.summary.requested, 1);
  assert.equal(bulk.summary.approved, 1);
  assert.equal(bulk.summary.failed, 0);
  assert.equal(bulk.summary.created, 1);
  assert.equal(bulk.summary.reconciled, 0);
  assert.equal(bulk.summary.idempotent, 0);
  assert.equal(bulk.summary.blocked, 0);
  assert.equal(bulk.importBatch.status, "completed");

  const discardCreate = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `discard-${fixtures.suffix}.ofx`,
    content: ofx(
      `<STMTTRN><DTPOSTED>20260723<TRNAMT>-3.00<FITID>${fixtures.suffix}-discard<NAME>Descartar OFX ${fixtures.suffix}`,
    ),
    accountId: fixtures.accountId,
    consentAccepted: true,
  });
  assert.equal(discardCreate.statusCode, 201);
  const discardBatch = readBody<ImportDetail>(discardCreate);
  const discardSuggestion = requireSuggestion(discardBatch, 0);
  const discarded = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${discardBatch.importBatch.id}/discard`,
  );
  assert.equal(discarded.statusCode, 200);
  assert.equal(readBody<ImportDetail>(discarded).importBatch.status, "discarded");

  const approvalAfterDiscard = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${discardBatch.importBatch.id}/suggestions/${discardSuggestion.id}/approve`,
  );
  assert.equal(approvalAfterDiscard.statusCode, 409);
  assert.equal(readErrorCode(approvalAfterDiscard), "IMPORT_BATCH_DISCARDED");
}

async function assertDeterministicDeduplicationAndReconciliation(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const duplicateDescription = `Duplicidade OFX ${fixtures.suffix}`;
  const duplicateExisting = await createTransaction(token, {
    accountId: fixtures.accountId,
    categoryId: fixtures.categoryId,
    amountMinor: 4567,
    occurredOn: "2026-07-24",
    description: duplicateDescription,
  });
  const duplicateImport = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `dedup-${fixtures.suffix}.ofx`,
    content: ofx(
      `<STMTTRN><DTPOSTED>20260724<TRNAMT>-45.67<FITID>${fixtures.suffix}-dedup<NAME>${duplicateDescription}`,
    ),
    accountId: fixtures.accountId,
    consentAccepted: true,
  });
  assert.equal(duplicateImport.statusCode, 201);
  const duplicateBatch = readBody<ImportDetail>(duplicateImport);
  const duplicateSource = requireSuggestion(duplicateBatch, 0);

  const blockedApproval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${duplicateBatch.importBatch.id}/suggestions/${duplicateSource.id}/approve`,
  );
  assert.equal(blockedApproval.statusCode, 409);
  assert.equal(readErrorCode(blockedApproval), "IMPORT_REVIEW_CANDIDATE_PENDING");

  const duplicateScan = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${duplicateBatch.importBatch.id}/detect-duplicates`,
  );
  assert.equal(duplicateScan.statusCode, 200);
  const duplicateCandidate = readBody<{ deduplicationSuggestions: ImportSuggestion[] }>(
    duplicateScan,
  ).deduplicationSuggestions.find(
    (item) => item.payload.targetTransactionId === duplicateExisting.id,
  );
  assert.ok(duplicateCandidate, "Expected OFX deduplication candidate");

  const duplicateDecision = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${duplicateCandidate.id}/approve`,
  );
  assert.equal(duplicateDecision.statusCode, 200);
  const duplicateResolved = readBody<{
    suggestion: ImportSuggestion;
    sourceSuggestion: ImportSuggestion;
  }>(duplicateDecision);
  assert.equal(duplicateResolved.suggestion.status, "approved");
  assert.equal(duplicateResolved.sourceSuggestion.status, "rejected");

  const duplicateDiscard = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${duplicateBatch.importBatch.id}/discard`,
  );
  assert.equal(duplicateDiscard.statusCode, 200);
  assert.equal(readBody<ImportDetail>(duplicateDiscard).importBatch.status, "discarded");

  const reconciliationDescription = `Conciliação OFX ${fixtures.suffix}`;
  const reconciliationExisting = await createTransaction(token, {
    accountId: fixtures.accountId,
    categoryId: fixtures.categoryId,
    amountMinor: 7654,
    occurredOn: "2026-07-25",
    description: reconciliationDescription,
  });
  const reconciliationImport = await apiRequest(token, "POST", "/api/import-batches/ofx", {
    originalFileName: `reconciliation-${fixtures.suffix}.ofx`,
    content: ofx(
      `<STMTTRN><DTPOSTED>20260725<TRNAMT>-76.54<FITID>${fixtures.suffix}-reconciliation<NAME>${reconciliationDescription}`,
    ),
    accountId: fixtures.accountId,
    consentAccepted: true,
  });
  assert.equal(reconciliationImport.statusCode, 201);
  const reconciliationBatch = readBody<ImportDetail>(reconciliationImport);
  const reconciliationSource = requireSuggestion(reconciliationBatch, 0);

  const reconciliationScan = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${reconciliationBatch.importBatch.id}/detect-duplicates`,
  );
  assert.equal(reconciliationScan.statusCode, 200);
  const reconciliationCandidate = readBody<{ reconciliationSuggestions: ImportSuggestion[] }>(
    reconciliationScan,
  ).reconciliationSuggestions.find(
    (item) => item.payload.targetTransactionId === reconciliationExisting.id,
  );
  assert.ok(reconciliationCandidate, "Expected OFX reconciliation candidate");

  const reconciliationDecision = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${reconciliationCandidate.id}/approve`,
  );
  assert.equal(reconciliationDecision.statusCode, 200);

  const reconciliationDetailResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${reconciliationBatch.importBatch.id}`,
  );
  assert.equal(reconciliationDetailResponse.statusCode, 200);
  const reconciliationDetail = readBody<ImportDetail>(reconciliationDetailResponse);
  const reconciled = requireSuggestion(reconciliationDetail, 0);
  assert.equal(reconciled.status, "approved");
  assert.equal(reconciled.transaction?.id, reconciliationExisting.id);
  assert.equal(reconciled.transaction?.status, "reconciled");
  assert.equal(
    reconciled.candidates?.find((item) => item.id === reconciliationCandidate.id)?.status,
    "approved",
  );

  const createdRows = await query<{ id: string }>(
    `select "id" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "aiSuggestionId" = $3`,
    [reconciliationBatch.importBatch.organizationId, PERSONAL_PROFILE_ID, reconciliationSource.id],
  );
  assert.equal(createdRows.length, 0, "OFX reconciliation must not create a second transaction");

  const reconciliationDiscard = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${reconciliationBatch.importBatch.id}/discard`,
  );
  assert.equal(reconciliationDiscard.statusCode, 409);
  assert.equal(readErrorCode(reconciliationDiscard), "IMPORT_BATCH_HAS_FINANCIAL_EFFECTS");
}

async function createTransaction(
  token: string,
  input: {
    accountId: string;
    categoryId: string;
    amountMinor: number;
    occurredOn: string;
    description: string;
  },
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    ...input,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ transaction: { id: string } }>(response).transaction;
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

async function captureConsole(lines: string[], action: () => Promise<void>): Promise<void> {
  const methods = ["log", "info", "warn", "error"] as const;
  const originals = Object.fromEntries(
    methods.map((method) => [method, console[method]]),
  ) as Record<(typeof methods)[number], typeof console.log>;
  for (const method of methods) {
    console[method] = (...values: unknown[]) => {
      lines.push(values.map(formatConsoleValue).join(" "));
    };
  }
  try {
    await action();
  } finally {
    for (const method of methods) console[method] = originals[method];
  }
}

function formatConsoleValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

interface Fixtures {
  suffix: string;
  accountId: string;
  otherAccountId: string;
  categoryId: string;
}

interface ImportBatch {
  id: string;
  organizationId: string;
  sourceKind: string;
  sourceHash: string;
  status: string;
}

interface ImportProblem {
  code: string;
}

interface ImportSuggestion {
  id: string;
  status: string;
  payload: {
    description?: string;
    amountMinor?: number;
    categoryId?: string;
    targetTransactionId?: string;
    sourceSuggestionId?: string;
  };
  candidates?: Array<{ id: string; status: string }>;
  transaction?: { id: string; status: string };
}

interface ImportDetail {
  importBatch: ImportBatch;
  suggestions: ImportSuggestion[];
  problems: ImportProblem[];
}
