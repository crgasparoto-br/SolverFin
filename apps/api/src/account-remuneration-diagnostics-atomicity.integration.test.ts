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
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests.",
  );
  await resetAccountRemunerationTestData();
  await removeDiagnosticsFailureTrigger();

  const emptyProcessing = await processAccountRemunerations(PROCESSING_DATE);
  assert.equal(emptyProcessing.diagnostics.activeConfigurations, 0);
  assert.equal(emptyProcessing.diagnostics.eligibleCompetences, 0);
  assert.equal(emptyProcessing.diagnostics.processedCompetences, 0);
  assert.match(
    emptyProcessing.operation.message ?? "",
    /^Nenhuma alteração necessária/i,
  );

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

  await assertConcurrentFailedDiagnosticsCorrelation();

  await installDiagnosticsFailureTrigger();
  await assert.rejects(
    () => processAccountRemunerations(PROCESSING_DATE),
    /diagnóstico bloqueado para teste/i,
  );
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
  assert.equal(
    rateRows[0]?.count,
    0,
    "the CDI rate must roll back with diagnostics",
  );

  const importOperationRows = await query<{
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
  assert.equal(importOperationRows[0]?.status, "FAILED");
  assert.match(
    importOperationRows[0]?.message ?? "",
    /persistir o diagnóstico operacional/i,
  );
  assert.equal(importOperationRows[0]?.diagnostics?.kind, "CDI_IMPORT");

  const processingOperationRows = await query<{
    status: string;
    message: string | null;
    diagnostics: { kind?: string } | null;
  }>(
    `select "status", "message", "diagnostics"
       from "FinancialIndexOperation"
      where "kind" = 'ACCOUNT_REMUNERATION'
      order by "startedAt" desc
      limit 1`,
  );
  assert.equal(processingOperationRows[0]?.status, "FAILED");
  assert.match(
    processingOperationRows[0]?.message ?? "",
    /persistir o diagnóstico operacional/i,
  );
  assert.equal(
    processingOperationRows[0]?.diagnostics?.kind,
    "ACCOUNT_REMUNERATION",
  );
}

async function assertOperationLockRejects(
  lockName: string,
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      lockName,
    ]);
    await assert.rejects(
      operation,
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === expectedCode,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function assertConcurrentFailedDiagnosticsCorrelation(): Promise<void> {
  const firstDate = "2045-02-01";
  const secondDate = "2045-03-01";
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      "solverfin:cdi-import",
    ]);

    const results = await Promise.allSettled([
      importCdiRates(
        { startsOn: firstDate, endsOn: firstDate },
        buildCdiFetcher([]),
      ),
      importCdiRates(
        { startsOn: secondDate, endsOn: secondDate },
        buildCdiFetcher([]),
      ),
    ]);

    assert.equal(
      results.every((result) => result.status === "rejected"),
      true,
    );
    for (const result of results) {
      if (result.status === "rejected") {
        assert.equal(
          result.reason instanceof Error &&
            "code" in result.reason &&
            result.reason.code === "FINANCIAL_INDEX_IMPORT_ALREADY_RUNNING",
          true,
        );
      }
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }

  const rows = await query<{ requestedStartsOn: string | null }>(
    `select "diagnostics"->'requestedPeriod'->>'startsOn' as "requestedStartsOn"
       from "FinancialIndexOperation"
      where "kind" = 'CDI_IMPORT'
        and "status" = 'FAILED'
        and "diagnostics"->'requestedPeriod'->>'startsOn' = any($1::text[])
      order by "startedAt" asc`,
    [[firstDate, secondDate]],
  );

  assert.deepEqual(
    rows.map((row) => row.requestedStartsOn).sort(),
    [firstDate, secondDate],
    "each concurrent failed operation must retain its own requested period",
  );
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
  await query(
    `drop trigger if exists ${TRIGGER_NAME} on "FinancialIndexOperation"`,
  );
  await query(`drop function if exists ${FUNCTION_NAME}()`);
}

function buildCdiFetcher(entries: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(entries), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}
