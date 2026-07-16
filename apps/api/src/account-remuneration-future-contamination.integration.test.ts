import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { resetAccountRemunerationTestData } from "./account-remuneration-test-support.js";
import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  getFinancialIndexStatus,
  importCdiRates,
  processAccountRemunerations,
} from "./repositories/account-remuneration-diagnostics-service.js";
import { saveAccountRemunerationConfiguration } from "./repositories/account-remuneration-service.js";
import { listTransactionsForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const REAL_START = "2026-07-01";
const REAL_END = "2026-07-02";
const PROCESSING_ON = "2026-07-03";
const CONTAMINATED_ON = "2038-04-14";

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
    "DATABASE_URL is required for integration tests.",
  );
  await resetAccountRemunerationTestData();
  await removeTestRates();

  const suffix = Date.now().toString(36);
  const realAccount = await createAccountForContext(CONTEXT, {
    name: `Conta CDI extrato ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });
  const syntheticAccount = await createAccountForContext(CONTEXT, {
    name: `Conta remunerada positiva ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });

  try {
    await saveAccountRemunerationConfiguration(CONTEXT, syntheticAccount.id, {
      enabled: true,
      remunerationPercent: 100,
      startsOn: CONTAMINATED_ON,
    });
    await insertRate(CONTAMINATED_ON, 0.055131);

    const statusAfterRepair = await getFinancialIndexStatus();
    assert.notEqual(
      statusAfterRepair.latestCdiRate?.referenceOn,
      CONTAMINATED_ON,
    );
    assert.equal(await readRateStatus(CONTAMINATED_ON), "REJECTED");
    assert.equal(await readConfigurationEnabled(syntheticAccount.id), false);

    await saveAccountRemunerationConfiguration(CONTEXT, realAccount.id, {
      enabled: true,
      remunerationPercent: 100,
      startsOn: REAL_START,
    });

    const imported = await importCdiRates(
      { startsOn: REAL_START, endsOn: REAL_END },
      buildCdiFetcher([
        { data: "01/07/2026", valor: "0,055131" },
        { data: "02/07/2026", valor: "0,055131" },
      ]),
    );
    assert.equal(imported.importedCount, 2);
    assert.equal(imported.outcome, "IMPORTED");

    const processed = await processAccountRemunerations(PROCESSING_ON);
    assert.equal(processed.createdCount, 2);

    const transactions = await listTransactionsForContext(CONTEXT, {
      accountId: realAccount.id,
      status: "all",
    });
    const remunerations = transactions.filter(
      (transaction) => transaction.source === "ACCOUNT_REMUNERATION",
    );
    assert.equal(remunerations.length, 2);
    assert.ok(
      remunerations.every((transaction) => transaction.status === "PLANNED"),
    );
    assert.ok(
      remunerations.every(
        (transaction) => transaction.occurredOn === PROCESSING_ON,
      ),
    );

    await assert.rejects(
      () =>
        importCdiRates(
          { startsOn: "2026-07-04", endsOn: "2026-07-04" },
          buildCdiFetcher([{ data: "05/07/2026", valor: "0,055131" }]),
        ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "FINANCIAL_INDEX_PROVIDER_RESPONSE_OUT_OF_PERIOD",
    );
    assert.equal(await readRateStatus("2026-07-05"), null);
  } finally {
    await removeAccountData([realAccount.id, syntheticAccount.id]);
    await removeTestRates();
  }
}

function buildCdiFetcher(entries: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(entries), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

async function insertRate(
  referenceOn: string,
  dailyRatePercent: number,
): Promise<void> {
  await query(
    `insert into "FinancialIndexRate"
      ("id", "kind", "referenceOn", "dailyRatePercent", "dailyFactor", "source", "status",
       "importedAt", "createdAt", "updatedAt")
     values (gen_random_uuid(), 'CDI', $1::date, $2, 1 + ($2 / 100), 'BCB_SGS_12',
             'CONFIRMED', now(), now(), now())
     on conflict ("kind", "referenceOn") do update set
       "dailyRatePercent" = excluded."dailyRatePercent",
       "dailyFactor" = excluded."dailyFactor",
       "source" = excluded."source",
       "status" = excluded."status",
       "updatedAt" = now()`,
    [referenceOn, dailyRatePercent],
  );
}

async function readRateStatus(referenceOn: string): Promise<string | null> {
  const rows = await query<{ status: string }>(
    `select "status" from "FinancialIndexRate"
      where "kind" = 'CDI' and "referenceOn" = $1::date`,
    [referenceOn],
  );
  return rows[0]?.status ?? null;
}

async function readConfigurationEnabled(
  accountId: string,
): Promise<boolean | null> {
  const rows = await query<{ enabled: boolean }>(
    `select "enabled" from "AccountRemunerationConfiguration" where "accountId" = $1`,
    [accountId],
  );
  return rows[0]?.enabled ?? null;
}

async function removeAccountData(accountIds: string[]): Promise<void> {
  const remunerations = await query<{ transactionId: string | null }>(
    `delete from "AccountRemuneration"
      where "accountId" = any($1::uuid[])
      returning "transactionId"`,
    [accountIds],
  );
  const transactionIds = remunerations
    .map((row) => row.transactionId)
    .filter((transactionId): transactionId is string => transactionId !== null);
  if (transactionIds.length > 0) {
    await query(`delete from "Transaction" where "id" = any($1::uuid[])`, [
      transactionIds,
    ]);
  }
  await query(
    `delete from "AccountRemunerationConfiguration" where "accountId" = any($1::uuid[])`,
    [accountIds],
  );
  await query(`delete from "Account" where "id" = any($1::uuid[])`, [
    accountIds,
  ]);
}

async function removeTestRates(): Promise<void> {
  await query(
    `delete from "FinancialIndexRate"
      where "kind" = 'CDI'
        and "referenceOn" in ($1::date, $2::date, $3::date, $4::date, $5::date)`,
    [REAL_START, REAL_END, "2026-07-04", "2026-07-05", CONTAMINATED_ON],
  );
}
