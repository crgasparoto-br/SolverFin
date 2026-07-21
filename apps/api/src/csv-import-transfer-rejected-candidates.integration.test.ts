import assert from "node:assert/strict";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for rejected transfer candidate integration tests.",
  );
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const sourceAccountId = await createAccount(token, `Origem rejeitada ${suffix}`);
  const destinationAccountId = await createAccount(token, `Destino rejeitado ${suffix}`);

  await assertIndividualApprovalRespectsRejection(token, {
    suffix,
    sourceAccountId,
    destinationAccountId,
  });
  await assertBulkApprovalRespectsRejection(token, {
    suffix,
    sourceAccountId,
    destinationAccountId,
  });
  await assertQueueApprovalRespectsRejection(token, {
    suffix,
    sourceAccountId,
    destinationAccountId,
  });
}

async function assertIndividualApprovalRespectsRejection(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const existing = await createExistingTransfer(token, fixtures, {
    amountMinor: 4_321,
    occurredOn: "2026-07-21",
    description: `Transferência existente individual ${fixtures.suffix}`,
  });
  const imported = await createMatchingTransferImport(token, fixtures, {
    amount: "43.21",
    occurredOn: "2026-07-21",
    label: `individual-${fixtures.suffix}`,
  });
  await rejectAllCurrentCandidates(token, imported);

  const approval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatchId}/suggestions/${imported.suggestionId}/approve`,
  );
  assert.equal(approval.statusCode, 200);
  const body = readBody<ImportApprovalResult>(approval);
  assert.equal(body.outcome, "created");
  assert.equal(body.idempotent, false);
  assert.notEqual(body.transaction.id, existing.id);
  assert.equal(body.transaction.accountId, fixtures.sourceAccountId);
  assert.equal(body.transaction.destinationAccountId, fixtures.destinationAccountId);
  assert.equal(body.transaction.status, "posted");

  await assertIndependentTransferPersisted(existing.id, body.transaction.id, imported, 4_321);
}

async function assertBulkApprovalRespectsRejection(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const existing = await createExistingTransfer(token, fixtures, {
    amountMinor: 5_432,
    occurredOn: "2026-07-22",
    description: `Transferência existente lote ${fixtures.suffix}`,
  });
  const imported = await createMatchingTransferImport(token, fixtures, {
    amount: "54.32",
    occurredOn: "2026-07-22",
    label: `bulk-${fixtures.suffix}`,
  });
  await rejectAllCurrentCandidates(token, imported);

  const approval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatchId}/approve-selected`,
    { suggestionIds: [imported.suggestionId] },
  );
  assert.equal(approval.statusCode, 200);
  const body = readBody<BulkApprovalResult>(approval);
  assert.deepEqual(body.summary, {
    requested: 1,
    approved: 1,
    failed: 0,
    created: 1,
    reconciled: 0,
    idempotent: 0,
    blocked: 0,
    transferCount: 1,
    transferTotalMinor: 5_432,
  });
  const transaction = body.results[0]?.decision?.transaction;
  if (transaction === undefined) throw new Error("Bulk approval did not return a transaction.");
  assert.notEqual(transaction.id, existing.id);

  await assertIndependentTransferPersisted(existing.id, transaction.id, imported, 5_432);
}

async function assertQueueApprovalRespectsRejection(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const existing = await createExistingTransfer(token, fixtures, {
    amountMinor: 6_543,
    occurredOn: "2026-07-23",
    description: `Transferência existente fila ${fixtures.suffix}`,
  });
  const imported = await createMatchingTransferImport(token, fixtures, {
    amount: "65.43",
    occurredOn: "2026-07-23",
    label: `queue-${fixtures.suffix}`,
  });
  await rejectAllCurrentCandidates(token, imported);

  const approval = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${imported.suggestionId}/approve`,
  );
  assert.equal(approval.statusCode, 200);
  const body = readBody<{ transaction: TransactionRecord }>(approval);
  assert.ok(body.transaction);
  assert.notEqual(body.transaction.id, existing.id);
  assert.equal(body.transaction.status, "posted");

  await assertIndependentTransferPersisted(
    existing.id,
    body.transaction.id,
    imported,
    6_543,
  );
}

async function createExistingTransfer(
  token: string,
  fixtures: Fixtures,
  input: { amountMinor: number; occurredOn: string; description: string },
): Promise<TransactionRecord> {
  const response = await apiRequest(token, "POST", "/api/transactions", {
    kind: "transfer",
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
    accountId: fixtures.sourceAccountId,
    destinationAccountId: fixtures.destinationAccountId,
    description: input.description,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ transaction: TransactionRecord }>(response).transaction;
}

async function createMatchingTransferImport(
  token: string,
  fixtures: Fixtures,
  input: { amount: string; occurredOn: string; label: string },
): Promise<ImportedTransferFixture> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `transfer-rejected-${input.label}.csv`,
    content: `date,description,amount\n${input.occurredOn},Importação ${input.label},${input.amount}`,
    accountId: fixtures.destinationAccountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  const detail = readBody<ImportDetail>(response);
  const suggestion = detail.suggestions[0];
  assert.ok(suggestion);
  assert.equal(suggestion.payload.direction, "inflow");

  const patch = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${detail.importBatch.id}/suggestions/${suggestion.id}`,
    { kind: "transfer", otherAccountId: fixtures.sourceAccountId },
  );
  assert.equal(patch.statusCode, 200);

  return {
    importBatchId: detail.importBatch.id,
    suggestionId: suggestion.id,
  };
}

async function rejectAllCurrentCandidates(
  token: string,
  imported: ImportedTransferFixture,
): Promise<void> {
  const detect = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatchId}/detect-duplicates`,
  );
  assert.equal(detect.statusCode, 200);
  const detected = readBody<{
    deduplicationSuggestions: Candidate[];
    reconciliationSuggestions: Candidate[];
  }>(detect);
  const candidates = [
    ...detected.deduplicationSuggestions,
    ...detected.reconciliationSuggestions,
  ];
  assert.ok(candidates.length >= 2, "Expected duplicate and reconciliation candidates");

  for (const candidate of candidates) {
    const rejection = await apiRequest(
      token,
      "POST",
      `/api/review-suggestions/${candidate.id}/reject`,
      { reason: "Correspondência rejeitada explicitamente no teste." },
    );
    assert.equal(rejection.statusCode, 200);
  }

  const detail = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${imported.importBatchId}`,
  );
  assert.equal(detail.statusCode, 200);
  const suggestion = readBody<ImportDetail>(detail).suggestions[0];
  assert.ok(suggestion);
  assert.equal(suggestion.status, "pending_review");
  assert.equal(
    suggestion.candidates.every((candidate) => candidate.status === "rejected"),
    true,
  );
}

async function assertIndependentTransferPersisted(
  existingTransactionId: string,
  createdTransactionId: string,
  imported: ImportedTransferFixture,
  amountMinor: number,
): Promise<void> {
  const rows = await query<{
    id: string;
    status: string;
    source: string;
    importBatchId: string | null;
    aiSuggestionId: string | null;
  }>(
    `select "id", "status"::text as "status", "source"::text as "source",
            "importBatchId", "aiSuggestionId"
       from "Transaction"
      where "id" = any($1::uuid[])
      order by "id"`,
    [[existingTransactionId, createdTransactionId]],
  );
  assert.equal(rows.length, 2);
  const existing = rows.find((row) => row.id === existingTransactionId);
  const created = rows.find((row) => row.id === createdTransactionId);
  if (existing === undefined || created === undefined) {
    throw new Error("Expected both the rejected target and the newly created transfer.");
  }
  assert.equal(existing.status, "POSTED");
  assert.equal(existing.importBatchId, null);
  assert.equal(existing.aiSuggestionId, null);
  assert.equal(created.status, "POSTED");
  assert.equal(created.source, "IMPORT");
  assert.equal(created.importBatchId, imported.importBatchId);
  assert.equal(created.aiSuggestionId, imported.suggestionId);

  const count = await query<{ count: number }>(
    `select count(*)::int as "count" from "Transaction"
      where "id" = any($1::uuid[]) and "kind" = 'TRANSFER' and "amountMinor" = $2`,
    [[existingTransactionId, createdTransactionId], amountMinor],
  );
  assert.equal(count[0]?.count, 2);

  const source = await query<{ status: string; targetEntityId: string | null }>(
    `select "status"::text as "status", "targetEntityId"
       from "AiSuggestion" where "id" = $1`,
    [imported.suggestionId],
  );
  assert.deepEqual(source[0], {
    status: "APPROVED",
    targetEntityId: createdTransactionId,
  });
}

async function createAccount(token: string, name: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name,
    kind: "checking",
    openingBalanceMinor: 0,
    currency: "BRL",
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
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

interface Fixtures {
  suffix: string;
  sourceAccountId: string;
  destinationAccountId: string;
}

interface ImportedTransferFixture {
  importBatchId: string;
  suggestionId: string;
}

interface Candidate {
  id: string;
  status: string;
}

interface TransactionRecord {
  id: string;
  accountId: string;
  destinationAccountId: string;
  status: string;
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: Array<{
    id: string;
    status: string;
    payload: { direction: string };
    candidates: Candidate[];
  }>;
}

interface ImportApprovalResult {
  outcome: string;
  idempotent: boolean;
  transaction: TransactionRecord;
}

interface BulkApprovalResult {
  summary: {
    requested: number;
    approved: number;
    failed: number;
    created: number;
    reconciled: number;
    idempotent: number;
    blocked: number;
    transferCount: number;
    transferTotalMinor: number;
  };
  results: Array<{
    decision?: { transaction?: TransactionRecord };
  }>;
}
