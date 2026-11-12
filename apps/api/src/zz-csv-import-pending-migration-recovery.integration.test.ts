import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { closePool, query } from "./db.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const MIGRATION_NAME = "20260720170000_add_transaction_groups";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for migration recovery tests.");

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}-migration`;
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
  const transactionId = readBody<{ transaction: { id: string } }>(approval).transaction.id;

  await removeTransactionGroupMigration();

  const missingColumn = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-11-30`,
  );
  assert.equal(missingColumn.statusCode, 500);

  const recovery = spawnSync(npmCommand(), ["--prefix", "../..", "run", "db:prepare"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(
    recovery.status,
    0,
    `db:prepare must recover the pending migration before startup
${recovery.stdout}
${recovery.stderr}`,
  );

  const recovered = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-11-30`,
  );
  assert.equal(recovered.statusCode, 200);
  const matches = readBody<{ transactions: Array<{ id: string; aiSuggestionId?: string }> }>(
    recovered,
  ).transactions.filter((transaction) => transaction.aiSuggestionId === suggestion.id);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.id, transactionId);

  const schema = await query<{ migrationCount: number; columnCount: number; tableCount: number }>(
    `select
       (select count(*)::int from "_prisma_migrations" where migration_name = $1 and finished_at is not null) as "migrationCount",
       (select count(*)::int from information_schema.columns where table_schema = current_schema() and table_name = 'Transaction' and column_name = 'transactionGroupId') as "columnCount",
       (select count(*)::int from information_schema.tables where table_schema = current_schema() and table_name = 'TransactionGroup') as "tableCount"`,
    [MIGRATION_NAME],
  );
  assert.deepEqual(schema[0], { migrationCount: 1, columnCount: 1, tableCount: 1 });
}

async function removeTransactionGroupMigration(): Promise<void> {
  await query(`
    drop trigger if exists "Transaction_group_member_update_guard" on "Transaction";
    drop function if exists prevent_grouped_transaction_invalidation();
    alter table "Transaction" drop constraint if exists "Transaction_transactionGroupId_fkey";
    drop index if exists "Transaction_organizationId_financialProfileId_transactionGroupId_idx";
    alter table "Transaction" drop column if exists "transactionGroupId";
    drop table if exists "TransactionGroup" cascade;
    delete from "_prisma_migrations" where migration_name = '${MIGRATION_NAME}';
  `);
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta migration ${suffix}`,
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
    originalFileName: `migration-${suffix}.csv`,
    content: `date,description,amount,kind
2026-11-14,Migration ${suffix},-19.75,expense`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  return readBody<ImportDetail>(response);
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
    (await handleImportBatchesApiRequest(request)) ?? (await handleApiRequest(request));
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
