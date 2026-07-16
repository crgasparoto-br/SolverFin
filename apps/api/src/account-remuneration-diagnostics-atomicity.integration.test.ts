import assert from "node:assert/strict";

import { closePool, getPool, query } from "./db.js";
import { resetAccountRemunerationTestData } from "./account-remuneration-test-support.js";
import {
  importCdiRates,
  processAccountRemunerations,
} from "./repositories/account-remuneration-diagnostics-service.js";

const TEST_DATE = "2045-01-01";
const PROCESSING_DATE = "2045-01-02";
const TRIGGER_NAME = "solverfin_test_fail_financial_index_diagnostics";
const FUNCTION_NAME = "solverfin_test_fail_financial_index_diagnostics";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await removeDiagnosticsFailureTrigger();
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  await resetAccountRemunerationTestData();
  await removeDiagnosticsFailureTrigger();

  const emptyProcessing = await processAccountRemunerations(PROCESSING_DATE);
  assert.equal(emptyProcessing.diagnostics.activeConfigurations, 0);
  assert.equal(emptyProcessing.diagnostics.eligibleCompetences, 0);
  assert.equal(emptyProcessing.diagnostics.processedCompetences, 0);
  assert.match(emptyProcessing.operation.message ?? "", /^Nenhuma alteração necessária/i);

  await assertOperationLockRejects(
    "solverfin:cdi-import",
    () =>
      importCdiRates(
        { startsOn: TEST_DATE, endsOn: TEST_DATE },
        buildCdiFetcher([{ data: "01/01/2045", valor: "0,055131" }]),
      ),
    "FINANCIAL_INDEX_IMPORT_ALREADY_RUNNING",
  );

  await assertOperationLockRejects(
    "solverfin:account-remuneration",
    () => processAccountRemunerations(PROCESSING_DATE),
    "ACCOUNT_REMUNERATION_ALREADY_RUNNING",
  );

  await installDiagnosticsFailureTrigger();
  await assert.rejects(
    () =>
      importCdiRates(
        { startsOn: TEST_DATE, endsOn: TEST_DATE },
        buildCdiFetcher([{ data: "01/01/2045", valor: "0,055131" }]),
      ),
    /diagnóstico bloqueado para teste/i,
  );
  await removeDiagnosticsFailureTrigger();

  const rateRows = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "FinancialIndexRate"
      where "kind" = 'CDI' and "referenceOn" = $1::date`,
    [TEST_DATE],
  );
  assert.equal(rateRows[0]?.count, 0, "the CDI rate must roll back with diagnostics");

  const operationRows = await query<{
    status: string;
    message: string | null;
    diagnostics: { kind?: string } | null;
  }>(
    `select "status", "message", "diagnostics"
       from "FinancialIndexOperation"
      where "kind" = 'CDI_IMPORT'
      order by "startedAt" desc
      limit 1`,
  );
  assert.equal(operationRows[0]?.status, "FAILED");
  assert.match(operationRows[0]?.message ?? "", /persistir o diagnóstico operacional/i);
  assert.equal(operationRows[0]?.diagnostics?.kind, "CDI_IMPORT");
}

async function assertOperationLockRejects(
  lockName: string,
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [lockName]);
    await assert.rejects(
      operation,
      (error: unknown) => error instanceof Error && "code" in error && error.code === expectedCode,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function installDiagnosticsFailureTrigger(): Promise<void> {
  await query(`
    create function ${FUNCTION_NAME}() returns trigger language plpgsql as $$
    begin
      raise exception 'diagnóstico bloqueado para teste';
    end;
    $$
  `);
  await query(`
    create trigger ${TRIGGER_NAME}
    before update of "diagnostics" on "FinancialIndexOperation"
    for each row execute function ${FUNCTION_NAME}()
  `);
}

async function removeDiagnosticsFailureTrigger(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await query(`drop trigger if exists ${TRIGGER_NAME} on "FinancialIndexOperation"`);
  await query(`drop function if exists ${FUNCTION_NAME}()`);
}

function buildCdiFetcher(entries: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(entries), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}
