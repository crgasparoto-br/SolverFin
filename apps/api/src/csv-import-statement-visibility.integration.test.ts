import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
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
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for CSV import statement visibility integration tests.",
  );

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}-statement`;
  const account = await createAccount(token, suffix);

  await assertImportedTransactionsReachStatementQuery(token, account.id, suffix);
  await assertApprovedSuggestionWithoutTransactionIsControlled(token, account.id, suffix);
}

async function createAccount(token: string, suffix: string): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta Extrato Importado ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 10_000,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account;
}

async function assertImportedTransactionsReachStatementQuery(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const content = [
    "date,description,amount,kind",
    `2026-06-10,Receita visivel ${suffix},123.45,income`,
    `2026-06-11,Despesa visivel ${suffix},-23.45,expense`,
  ].join("\n");
  const createdResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `statement-${suffix}.csv`,
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(createdResponse.statusCode, 201);
  const created = readBody<ImportDetail>(createdResponse);
  assert.equal(created.suggestions.length, 2);

  const incomeSuggestion = requireSuggestion(created, 0);
  const expenseSuggestion = requireSuggestion(created, 1);
  const individual = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${incomeSuggestion.id}/approve`,
  );
  assert.equal(individual.statusCode, 200);
  const individualBody = readBody<ImportDecision>(individual);
  assert.equal(individualBody.transaction.source, "import");
  assert.equal(individualBody.transaction.status, "posted");
  assert.equal(individualBody.transaction.aiSuggestionId, incomeSuggestion.id);
  assert.equal(individualBody.transaction.importBatchId, created.importBatch.id);

  const selected = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/approve-selected`,
    { suggestionIds: [expenseSuggestion.id] },
  );
  assert.equal(selected.statusCode, 200);
  assert.deepEqual(readBody<BulkDecision>(selected).summary, {
    requested: 1,

    approved: 1,

    failed: 0,

    created: 1,

    reconciled: 0,

    idempotent: 0,

    blocked: 0,

    transferCount: 0,

    transferTotalMinor: 0,
  });

  const detailResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${created.importBatch.id}`,
  );
  assert.equal(detailResponse.statusCode, 200);
  const detail = readBody<ImportDetail>(detailResponse);
  assert.equal(detail.importBatch.status, "completed");
  assert.equal(
    detail.suggestions.every((suggestion) => suggestion.transaction !== undefined),
    true,
  );
  for (const suggestion of detail.suggestions) {
    assert.equal(suggestion.status, "approved");
    assert.equal(suggestion.targetEntityId, suggestion.transaction?.id);
  }

  const statementResponse = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-06-30`,
  );
  assert.equal(statementResponse.statusCode, 200);
  const statementTransactions = readBody<{ transactions: TransactionRecord[] }>(
    statementResponse,
  ).transactions.filter((transaction) => transaction.importBatchId === created.importBatch.id);
  assert.equal(statementTransactions.length, 2, "Each approved CSV row must appear exactly once");
  assert.deepEqual(
    statementTransactions.map((transaction) => transaction.description).sort(),
    [`Despesa visivel ${suffix}`, `Receita visivel ${suffix}`].sort(),
  );

  const bySuggestion = new Map(
    statementTransactions.map((transaction) => [transaction.aiSuggestionId, transaction]),
  );
  assert.deepEqual(
    {
      kind: bySuggestion.get(incomeSuggestion.id)?.kind,
      amountMinor: bySuggestion.get(incomeSuggestion.id)?.amountMinor,
      occurredOn: bySuggestion.get(incomeSuggestion.id)?.occurredOn,
      plannedOn: bySuggestion.get(incomeSuggestion.id)?.plannedOn,
      effectiveOn: bySuggestion.get(incomeSuggestion.id)?.effectiveOn,
      accountId: bySuggestion.get(incomeSuggestion.id)?.accountId,
      source: bySuggestion.get(incomeSuggestion.id)?.source,
      status: bySuggestion.get(incomeSuggestion.id)?.status,
    },
    {
      kind: "income",
      amountMinor: 12_345,
      occurredOn: "2026-06-10",
      plannedOn: "2026-06-10",
      effectiveOn: "2026-06-10",
      accountId,
      source: "import",
      status: "posted",
    },
  );
  assert.deepEqual(
    {
      kind: bySuggestion.get(expenseSuggestion.id)?.kind,
      amountMinor: bySuggestion.get(expenseSuggestion.id)?.amountMinor,
      occurredOn: bySuggestion.get(expenseSuggestion.id)?.occurredOn,
      plannedOn: bySuggestion.get(expenseSuggestion.id)?.plannedOn,
      effectiveOn: bySuggestion.get(expenseSuggestion.id)?.effectiveOn,
      accountId: bySuggestion.get(expenseSuggestion.id)?.accountId,
      source: bySuggestion.get(expenseSuggestion.id)?.source,
      status: bySuggestion.get(expenseSuggestion.id)?.status,
    },
    {
      kind: "expense",
      amountMinor: 2_345,
      occurredOn: "2026-06-11",
      plannedOn: "2026-06-11",
      effectiveOn: "2026-06-11",
      accountId,
      source: "import",
      status: "posted",
    },
  );

  const persisted = await query<{
    id: string;
    importBatchId: string;
    aiSuggestionId: string;
    targetEntityId: string | null;
  }>(
    `select t."id", t."importBatchId", t."aiSuggestionId", s."targetEntityId"
       from "Transaction" t
       join "AiSuggestion" s on s."id" = t."aiSuggestionId"
      where t."importBatchId" = $1
      order by t."occurredOn" asc`,
    [created.importBatch.id],
  );
  assert.equal(persisted.length, 2);
  assert.equal(
    persisted.every((row) => row.targetEntityId === row.id),
    true,
  );

  const repeated = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${incomeSuggestion.id}/approve`,
  );
  assert.equal(repeated.statusCode, 200);
  assert.equal(readBody<ImportDecision>(repeated).idempotent, true);
  assert.equal(readBody<ImportDecision>(repeated).transaction.id, individualBody.transaction.id);

  const reread = await apiRequest(token, "GET", `/api/import-batches/${created.importBatch.id}`);
  assert.equal(reread.statusCode, 200);
  assert.equal(
    readBody<ImportDetail>(reread).suggestions.find(
      (suggestion) => suggestion.id === incomeSuggestion.id,
    )?.transaction?.id,
    individualBody.transaction.id,
    "A fresh read after a possible timeout must recover the committed transaction",
  );

  const isolated = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-06-30&profileId=${MEI_PROFILE_ID}`,
  );
  assert.equal(isolated.statusCode, 200);
  assert.equal(
    readBody<{ transactions: TransactionRecord[] }>(isolated).transactions.some(
      (transaction) => transaction.importBatchId === created.importBatch.id,
    ),
    false,
  );
}

async function assertApprovedSuggestionWithoutTransactionIsControlled(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `inconsistent-${suffix}.csv`,
    content: `date,description,amount,kind\n2026-06-12,Inconsistente ${suffix},-1.00,expense`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  const detail = readBody<ImportDetail>(response);
  const suggestion = requireSuggestion(detail, 0);

  assert.equal(await countMissingApprovedTransactions(detail.importBatch.id), 0);
  await query(
    `update "AiSuggestion"
        set "status" = 'APPROVED', "targetEntityId" = null, "reviewedAt" = now(), "updatedAt" = now()
      where "id" = $1 and "sourceEntityId" = $2`,
    [suggestion.id, detail.importBatch.id],
  );
  assert.equal(await countMissingApprovedTransactions(detail.importBatch.id), 1);

  const reread = await apiRequest(token, "GET", `/api/import-batches/${detail.importBatch.id}`);
  assert.equal(reread.statusCode, 409);
  assert.equal(readErrorCode(reread), "IMPORT_APPROVED_TRANSACTION_MISSING");

  const repeatedApproval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${detail.importBatch.id}/suggestions/${suggestion.id}/approve`,
  );
  assert.equal(repeatedApproval.statusCode, 409);
  assert.equal(readErrorCode(repeatedApproval), "IMPORT_APPROVED_TRANSACTION_MISSING");

  await query(
    `update "AiSuggestion"
        set "status" = 'PENDING_REVIEW', "targetEntityId" = null, "reviewedAt" = null, "updatedAt" = now()
      where "id" = $1 and "sourceEntityId" = $2`,
    [suggestion.id, detail.importBatch.id],
  );
  const discarded = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${detail.importBatch.id}/discard`,
  );
  assert.equal(discarded.statusCode, 200);
}

async function countMissingApprovedTransactions(importBatchId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "AiSuggestion" s
       left join "Transaction" t
         on t."organizationId" = s."organizationId"
        and t."financialProfileId" = s."financialProfileId"
        and (t."id" = s."targetEntityId" or t."aiSuggestionId" = s."id")
      where s."sourceEntityId" = $1
        and s."kind" = 'TRANSACTION_EXTRACTION'
        and s."status" = 'APPROVED'
        and t."id" is null`,
    [importBatchId],
  );
  return rows[0]?.count ?? 0;
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
  const apiResponse =
    (await handleImportBatchesApiRequest(request)) ?? (await handleApiRequest(request));
  assert.ok(apiResponse, `${method} ${path} should be handled`);
  return apiResponse;
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
  status: string;
}

interface ImportSuggestion {
  id: string;
  status: string;
  targetEntityId?: string;
  transaction?: TransactionRecord;
}

interface ImportDetail {
  importBatch: ImportBatch;
  suggestions: ImportSuggestion[];
}

interface ImportDecision {
  idempotent: boolean;
  transaction: TransactionRecord;
}

interface BulkDecision {
  summary: {
    requested: number;
    approved: number;
    failed: number;
    idempotent: number;
  };
}

interface TransactionRecord {
  id: string;
  accountId?: string;
  importBatchId?: string;
  aiSuggestionId?: string;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  plannedOn: string;
  effectiveOn?: string;
  description: string;
}
