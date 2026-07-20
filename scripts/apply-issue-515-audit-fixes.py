from pathlib import Path
import re


def replace_once(text: str, pattern: str, replacement: str, label: str, *, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one replacement, got {count}")
    return updated


inbox_path = Path("apps/web/src/dev-server/inbox-page.ts")
inbox = inbox_path.read_text()
inbox = replace_once(
    inbox,
    r'import \{ icon \} from "\./icons\.js";\n',
    'import { icon } from "./icons.js";\nimport { buildImportStatementUrl } from "./import-statement-navigation.js";\n',
    "import navigation helper",
)
inbox = replace_once(
    inbox,
    r'(const profileJson = JSON\.stringify\(activeProfileLabel\)\.replace\(/</g, "\\\\u003c"\);\n)',
    r'\1  const statementUrlBuilder = buildImportStatementUrl.toString();\n',
    "serialize navigation helper",
)
inbox = replace_once(
    inbox,
    r'(        const activeProfileLabel = \$\{profileJson\};\n)',
    r'\1        const buildImportStatementUrl = ${statementUrlBuilder};\n',
    "inject navigation helper",
)
inbox = replace_once(
    inbox,
    r'''          const transactionLink = item\.transaction \? '<a class="button-link secondary-button" href="/lancamentos\?accountId=' \+ encodeURIComponent\(item\.transaction\.accountId \|\| payload\.accountId \|\| ""\) \+ '&month=' \+ encodeURIComponent\(String\(item\.transaction\.occurredOn \|\| payload\.occurredOn\)\.slice\(0, 7\)\) \+ '">Ver no Extrato</a>' : "";''',
    '''          const transactionLink = item.transaction ? '<a class="button-link secondary-button" href="' + escapeHtml(buildImportStatementUrl(item)) + '">Ver no Extrato</a>' : "";''',
    "individual statement link",
)
inbox = replace_once(
    inbox,
    r'''        function statementUrl\(value\) \{\n          const batch = value\.importBatch;\n          const suggestion = value\.suggestions\.find\(\(item\) => item\.transaction \|\| item\.payload\?\.occurredOn\);\n          const accountId = suggestion\?\.transaction\?\.accountId \|\| suggestion\?\.payload\?\.accountId \|\| batch\.defaultAccountId \|\| "";\n          const occurredOn = suggestion\?\.transaction\?\.occurredOn \|\| suggestion\?\.payload\?\.occurredOn \|\| "";\n          const params = new URLSearchParams\(\);\n          if \(accountId\) params\.set\("accountId", accountId\);\n          if \(occurredOn\) params\.set\("month", String\(occurredOn\)\.slice\(0, 7\)\);\n          return "/lancamentos" \+ \(params\.toString\(\) \? "\?" \+ params\.toString\(\) : ""\);\n        \}''',
    '''        function statementUrl(value) {
          const suggestion = value.suggestions.find((item) => item.transaction || item.payload?.occurredOn);
          return buildImportStatementUrl(suggestion, value.importBatch.defaultAccountId || "");
        }''',
    "batch statement link",
)
inbox_path.write_text(inbox)

Path("apps/web/src/dev-server/import-statement-navigation.ts").write_text(
    '''export interface ImportStatementNavigationTransaction {
  accountId?: string;
  occurredOn?: string;
  plannedOn?: string;
  effectiveOn?: string;
}

export interface ImportStatementNavigationSuggestion {
  transaction?: ImportStatementNavigationTransaction;
  payload?: {
    accountId?: string;
    occurredOn?: string;
  };
}

export function buildImportStatementUrl(
  suggestion: ImportStatementNavigationSuggestion | undefined,
  fallbackAccountId = "",
): string {
  const transaction = suggestion?.transaction;
  const payload = suggestion?.payload;
  const accountId = transaction?.accountId ?? payload?.accountId ?? fallbackAccountId;
  const statementOn =
    transaction?.effectiveOn ??
    transaction?.plannedOn ??
    transaction?.occurredOn ??
    payload?.occurredOn ??
    "";
  const params = new URLSearchParams();

  if (accountId !== "") params.set("accountId", accountId);
  if (statementOn !== "") params.set("month", statementOn.slice(0, 7));

  const query = params.toString();
  return `/lancamentos${query === "" ? "" : `?${query}`}`;
}
'''
)

Path("apps/web/src/dev-server/import-statement-navigation.test.ts").write_text(
    '''import assert from "node:assert/strict";

import { buildImportStatementUrl } from "./import-statement-navigation.js";

persistedTransactionWinsOverReviewedPayload();
visualDateUsesStatementPrecedence();
bulkResultsKeepIndependentNavigation();
fallbacksRemainDeterministic();

function persistedTransactionWinsOverReviewedPayload(): void {
  const url = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "persisted-account",
        occurredOn: "2026-05-31",
        plannedOn: "2026-06-01",
        effectiveOn: "2026-07-02",
      },
      payload: { accountId: "stale-payload-account", occurredOn: "2026-04-15" },
    }),
    "http://solverfin.test",
  );

  assert.equal(url.pathname, "/lancamentos");
  assert.equal(url.searchParams.get("accountId"), "persisted-account");
  assert.equal(url.searchParams.get("month"), "2026-07");
}

function visualDateUsesStatementPrecedence(): void {
  const planned = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "planned-account",
        occurredOn: "2026-05-31",
        plannedOn: "2026-06-01",
      },
    }),
    "http://solverfin.test",
  );
  assert.equal(planned.searchParams.get("month"), "2026-06");

  const occurred = new URL(
    buildImportStatementUrl({
      transaction: { accountId: "occurred-account", occurredOn: "2026-08-31" },
    }),
    "http://solverfin.test",
  );
  assert.equal(occurred.searchParams.get("month"), "2026-08");
}

function bulkResultsKeepIndependentNavigation(): void {
  const first = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "account-a",
        occurredOn: "2026-06-30",
        effectiveOn: "2026-07-01",
      },
    }),
    "http://solverfin.test",
  );
  const second = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "account-b",
        occurredOn: "2026-08-01",
        effectiveOn: "2026-08-01",
      },
    }),
    "http://solverfin.test",
  );

  assert.deepEqual(
    [
      [first.searchParams.get("accountId"), first.searchParams.get("month")],
      [second.searchParams.get("accountId"), second.searchParams.get("month")],
    ],
    [
      ["account-a", "2026-07"],
      ["account-b", "2026-08"],
    ],
  );
}

function fallbacksRemainDeterministic(): void {
  const payload = new URL(
    buildImportStatementUrl({
      payload: { accountId: "payload-account", occurredOn: "2026-09-10" },
    }),
    "http://solverfin.test",
  );
  assert.equal(payload.searchParams.get("accountId"), "payload-account");
  assert.equal(payload.searchParams.get("month"), "2026-09");

  assert.equal(
    buildImportStatementUrl(undefined, "fallback-account"),
    "/lancamentos?accountId=fallback-account",
  );
}
'''
)

Path("apps/api/src/csv-import-timeout-recovery.integration.test.ts").write_text(
    '''import assert from "node:assert/strict";

import { closePool, query } from "./db.js";
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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for timeout recovery tests.");

  const token = await loginAndReadToken();
  const suffix = `${Date.now().toString(36)}-timeout`;
  const accountId = await createAccount(token, suffix);
  const batch = await createBatch(token, accountId, suffix);
  const suggestion = batch.suggestions[0];
  assert.ok(suggestion);

  await assert.rejects(
    approveAndLoseCommittedResponse(token, batch.importBatch.id, suggestion.id),
    /SIMULATED_TIMEOUT_AFTER_COMMIT/,
  );

  const reread = await apiRequest(token, "GET", `/api/import-batches/${batch.importBatch.id}`);
  assert.equal(reread.statusCode, 200);
  const recovered = readBody<ImportDetail>(reread).suggestions[0];
  assert.equal(recovered?.status, "approved");
  assert.ok(recovered?.transaction?.id);
  assert.equal(recovered?.targetEntityId, recovered?.transaction?.id);

  const retry = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${batch.importBatch.id}/suggestions/${suggestion.id}/approve`,
  );
  assert.equal(retry.statusCode, 200);
  const retryBody = readBody<ImportDecision>(retry);
  assert.equal(retryBody.idempotent, true);
  assert.equal(retryBody.transaction.id, recovered?.transaction?.id);

  const rows = await query<{ count: number }>(
    `select count(*)::int as "count" from "Transaction" where "aiSuggestionId" = $1`,
    [suggestion.id],
  );
  assert.equal(rows[0]?.count, 1);

  const statement = await apiRequest(
    token,
    "GET",
    `/api/transactions?status=all&accountId=${accountId}&occurredTo=2026-10-31`,
  );
  assert.equal(statement.statusCode, 200);
  assert.equal(
    readBody<{ transactions: Array<{ aiSuggestionId?: string }> }>(statement).transactions.filter(
      (transaction) => transaction.aiSuggestionId === suggestion.id,
    ).length,
    1,
  );
}

async function approveAndLoseCommittedResponse(
  token: string,
  importBatchId: string,
  suggestionId: string,
): Promise<never> {
  const response = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}/approve`,
  );
  assert.equal(response.statusCode, 200);
  assert.ok(readBody<ImportDecision>(response).transaction.id);
  throw new Error("SIMULATED_TIMEOUT_AFTER_COMMIT");
}

async function createAccount(token: string, suffix: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta timeout ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function createBatch(token: string, accountId: string, suffix: string): Promise<ImportDetail> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `timeout-${suffix}.csv`,
    content: `date,description,amount,kind\n2026-10-14,Timeout ${suffix},-14.25,expense`,
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
  suggestions: Array<{
    id: string;
    status: string;
    targetEntityId?: string;
    transaction?: { id: string };
  }>;
}

interface ImportDecision {
  idempotent: boolean;
  transaction: { id: string };
}
'''
)

Path("apps/api/src/zz-csv-import-pending-migration-recovery.integration.test.ts").write_text(
    '''import assert from "node:assert/strict";
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

  const recovery = spawnSync(npmCommand(), ["run", "db:prepare"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(
    recovery.status,
    0,
    `db:prepare must recover the pending migration before startup\n${recovery.stdout}\n${recovery.stderr}`,
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

async function createBatch(token: string, accountId: string, suffix: string): Promise<ImportDetail> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `migration-${suffix}.csv`,
    content: `date,description,amount,kind\n2026-11-14,Migration ${suffix},-19.75,expense`,
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
'''
)

Path("scripts/diagnose-import-statement-consistency.mjs").write_text(
    '''#!/usr/bin/env node

import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const expectZero = process.argv.includes("--expect-zero");
const json = process.argv.includes("--json");

if (!connectionString) {
  console.error("DATABASE_URL is required for the read-only import consistency diagnostic.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  const result = await pool.query(`
    select count(*)::int as "count"
      from "AiSuggestion" s
      left join "Transaction" t
        on t."organizationId" = s."organizationId"
       and t."financialProfileId" = s."financialProfileId"
       and (t."id" = s."targetEntityId" or t."aiSuggestionId" = s."id")
     where s."kind" = 'TRANSACTION_EXTRACTION'
       and s."status" = 'APPROVED'
       and t."id" is null
  `);
  const count = result.rows[0]?.count ?? 0;
  const output = { approvedImportSuggestionsWithoutTransaction: count };

  if (json) console.log(JSON.stringify(output));
  else console.log(`[import-statement-diagnostic] inconsistent approved suggestions: ${count}`);

  if (expectZero and count != 0):
    pass
} finally {
  await pool.end();
}
'''.replace(
        '  if (expectZero and count != 0):\n    pass',
        '  if (expectZero && count !== 0) process.exitCode = 1;',
    )
)

package_path = Path("package.json")
package = package_path.read_text()
if '"diagnose:import-statement-consistency"' not in package:
    package = package.replace(
        '    "integration-db-guard:check": "node scripts/validate-integration-database-guard.mjs",\n',
        '    "integration-db-guard:check": "node scripts/validate-integration-database-guard.mjs",\n'
        '    "diagnose:import-statement-consistency": "node scripts/diagnose-import-statement-consistency.mjs",\n',
    )
package_path.write_text(package)

ci_path = Path(".github/workflows/ci.yml")
ci = ci_path.read_text()
if "Verify import statement consistency" not in ci:
    ci = ci.replace(
        "      - name: Run API integration tests\n        run: npm run test:integration --workspace @solverfin/api\n",
        "      - name: Run API integration tests\n"
        "        run: npm run test:integration --workspace @solverfin/api\n\n"
        "      - name: Verify import statement consistency\n"
        "        run: npm run diagnose:import-statement-consistency -- --expect-zero\n",
    )
ci_path.write_text(ci)

doc_path = Path("docs/IMPORT_STATEMENT_VISIBILITY.md")
doc = doc_path.read_text()
marker = "## Regressão discriminante de schema pendente"
if marker not in doc:
    doc += '''

## Regressão discriminante de schema pendente

A suíte de integração contém um cenário destrutivo restrito ao banco protegido de testes. O cenário aprova uma linha CSV, remove de forma controlada a migration de agrupamento, comprova que `/api/transactions` falha ao selecionar `transactionGroupId`, executa `npm run db:prepare` e confirma que a mesma transação volta a aparecer exatamente uma vez no Extrato. Esse teste falha na versão anterior, que não possuía o contrato `db:prepare` no startup.

## Navegação e timeout após commit

A Inbox usa uma única função para montar os links individuais e do lote. Conta e datas da `Transaction` persistida têm precedência sobre o payload revisado. O mês segue exatamente `effectiveOn ?? plannedOn ?? occurredOn`, igual ao `statementDate` do Extrato.

A recuperação após timeout é testada descartando deliberadamente uma resposta de aprovação já confirmada pelo servidor. A releitura do lote recupera a transação persistida; o retry retorna a mesma transação como idempotente e a consulta do Extrato mantém uma única ocorrência.

## Diagnóstico operacional somente leitura

Execute no ambiente autorizado:

```bash
npm run diagnose:import-statement-consistency -- --json
```

O comando retorna somente a quantidade de sugestões de importação aprovadas sem transação correspondente. Ele não lista dados financeiros e não executa correção ou backfill. No CI, `--expect-zero` bloqueia a entrega quando a base efêmera termina com inconsistências.
'''
doc_path.write_text(doc)
