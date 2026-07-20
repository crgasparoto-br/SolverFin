import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import {
  handleApiRequest,
  type ApiRequest,
  type ApiResponse,
} from "./router.js";

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
    "DATABASE_URL is required for consistency diagnostic tests.",
  );

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}-diagnostic`;
  const accountId = await createAccount(token, suffix);
  const batch = await createBatch(token, accountId, suffix);
  const suggestion = batch.suggestions[0];
  assert.ok(suggestion);

  const approval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${batch.importBatch.id}/suggestions/${suggestion.id}/approve`,
  );
  assert.equal(approval.statusCode, 200);
  const canonicalTransactionId = readBody<{ transaction: { id: string } }>(
    approval,
  ).transaction.id;
  const unrelatedTransactionId = await createManualTransaction(
    token,
    accountId,
    suffix,
  );
  const baseline = runDiagnostic();

  await assertNullTargetIsDetected(
    suggestion.id,
    canonicalTransactionId,
    baseline,
  );
  await assertConflictingTargetIsDetected(
    suggestion.id,
    canonicalTransactionId,
    unrelatedTransactionId,
    baseline,
  );
  await assertReconciliationTargetConflictIsDetected(
    token,
    accountId,
    canonicalTransactionId,
    baseline,
    suffix,
  );

  assert.equal(
    runDiagnostic(),
    baseline,
    "Diagnostic fixtures must be fully restored",
  );
}

async function assertNullTargetIsDetected(
  suggestionId: string,
  canonicalTransactionId: string,
  baseline: number,
): Promise<void> {
  try {
    await query(
      `update "AiSuggestion" set "targetEntityId" = null, "updatedAt" = now() where "id" = $1`,
      [suggestionId],
    );
    assert.equal(
      runDiagnostic(),
      baseline + 1,
      "An approved suggestion with a linked transaction but no targetEntityId must be inconsistent",
    );
  } finally {
    await restoreTarget(suggestionId, canonicalTransactionId);
  }
}

async function assertConflictingTargetIsDetected(
  suggestionId: string,
  canonicalTransactionId: string,
  unrelatedTransactionId: string,
  baseline: number,
): Promise<void> {
  try {
    await query(
      `update "AiSuggestion" set "targetEntityId" = $2, "updatedAt" = now() where "id" = $1`,
      [suggestionId, unrelatedTransactionId],
    );
    assert.equal(
      runDiagnostic(),
      baseline + 1,
      "A targetEntityId that conflicts with the aiSuggestion-linked transaction must be inconsistent",
    );
  } finally {
    await restoreTarget(suggestionId, canonicalTransactionId);
  }
}

async function assertReconciliationTargetConflictIsDetected(
  token: string,
  accountId: string,
  conflictingTransactionId: string,
  baseline: number,
  suffix: string,
): Promise<void> {
  const description = `Conciliacao diagnostico ${suffix}`;
  const targetTransactionId = await createTransaction(token, accountId, {
    amountMinor: 3_145,
    occurredOn: "2026-12-16",
    description,
  });
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `reconciliation-diagnostic-${suffix}.csv`,
    content: `date,description,amount,kind\n2026-12-16,${description},-31.45,expense`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  const batch = readBody<ImportDetail>(response);
  const source = batch.suggestions[0];
  assert.ok(source);

  const scan = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${batch.importBatch.id}/detect-duplicates`,
  );
  assert.equal(scan.statusCode, 200);
  const candidate = readBody<{
    reconciliationSuggestions: Array<{
      id: string;
      payload: { targetTransactionId: string };
    }>;
  }>(scan).reconciliationSuggestions.find(
    (item) => item.payload.targetTransactionId === targetTransactionId,
  );
  assert.ok(candidate, "Expected an approved reconciliation target fixture");

  const decision = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${candidate.id}/approve`,
  );
  assert.equal(decision.statusCode, 200);
  assert.equal(
    runDiagnostic(),
    baseline,
    "A valid reconciliation must not be reported",
  );

  try {
    await query(
      `update "AiSuggestion" set "targetEntityId" = $2, "updatedAt" = now() where "id" = $1`,
      [source.id, conflictingTransactionId],
    );
    assert.equal(
      runDiagnostic(),
      baseline + 1,
      "A reconciliation target that conflicts with the approved candidate must be inconsistent",
    );
  } finally {
    await restoreTarget(source.id, targetTransactionId);
  }
}

async function restoreTarget(
  suggestionId: string,
  transactionId: string,
): Promise<void> {
  await query(
    `update "AiSuggestion" set "targetEntityId" = $2, "updatedAt" = now() where "id" = $1`,
    [suggestionId, transactionId],
  );
}

function runDiagnostic(): number {
  const script = diagnosticScriptPath();
  const result = spawnSync(process.execPath, [script, "--json"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `Diagnostic command must succeed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const jsonLine = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .findLast((line) => line.startsWith("{"));
  assert.ok(jsonLine, `Diagnostic command must return JSON\n${result.stdout}`);
  const body = JSON.parse(jsonLine) as {
    approvedImportSuggestionsWithoutTransaction?: number;
  };
  assert.equal(
    typeof body.approvedImportSuggestionsWithoutTransaction,
    "number",
  );
  return body.approvedImportSuggestionsWithoutTransaction;
}

function diagnosticScriptPath(): string {
  const fromWorkspace = resolve(
    process.cwd(),
    "../../scripts/diagnose-import-statement-consistency.mjs",
  );
  if (existsSync(fromWorkspace)) return fromWorkspace;

  const fromRoot = resolve(
    process.cwd(),
    "scripts/diagnose-import-statement-consistency.mjs",
  );
  assert.equal(
    existsSync(fromRoot),
    true,
    "Import consistency diagnostic script must exist",
  );
  return fromRoot;
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta diagnostico ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function createBatch(
  token: string,
  accountId: string,
  suffix: string,
): Promise<ImportDetail> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `diagnostic-${suffix}.csv`,
    content: `date,description,amount,kind\n2026-12-14,Diagnostico ${suffix},-22.75,expense`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  return readBody<ImportDetail>(response);
}

async function createManualTransaction(
  token: string,
  accountId: string,
  suffix: string,
): Promise<string> {
  return createTransaction(token, accountId, {
    amountMinor: 975,
    occurredOn: "2026-12-15",
    description: `Transacao alheia ${suffix}`,
  });
}

async function createTransaction(
  token: string,
  accountId: string,
  input: { amountMinor: number; occurredOn: string; description: string },
): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
    accountId,
    description: input.description,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ transaction: { id: string } }>(response).transaction.id;
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

interface ImportDetail {
  importBatch: { id: string };
  suggestions: Array<{ id: string }>;
}
