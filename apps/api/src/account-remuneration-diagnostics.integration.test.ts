import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { resetAccountRemunerationTestData } from "./account-remuneration-test-support.js";
import { closePool } from "./db.js";
import {
  getFinancialIndexStatus,
  importCdiRates,
  processAccountRemunerations,
} from "./repositories/account-remuneration-diagnostics-service.js";
import { saveAccountRemunerationConfiguration } from "./repositories/account-remuneration-service.js";
import { createAccountForContext } from "./repositories/accounts.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const RATE_ON = "2039-01-01";
const PROCESSING_ON = "2039-01-03";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  await resetAccountRemunerationTestData();

  const imported = await importCdiRates(
    { startsOn: RATE_ON, endsOn: RATE_ON },
    buildCdiFetcher([{ data: "01/01/2039", valor: "0,055131" }]),
  );
  assert.equal(imported.outcome, "IMPORTED");
  assert.equal(imported.diagnostics.providerConsulted, true);
  assert.equal(imported.diagnostics.receivedCount, 1);
  assert.equal(imported.diagnostics.importedCount, 1);
  assert.equal(imported.operation.diagnostics?.kind, "CDI_IMPORT");

  let alreadyUpdatedFetcherCalled = false;
  const alreadyUpdated = await importCdiRates({ endsOn: RATE_ON }, async () => {
    alreadyUpdatedFetcherCalled = true;
    throw new Error("provider must not be called when the series is already current");
  });
  assert.equal(alreadyUpdatedFetcherCalled, false);
  assert.equal(alreadyUpdated.outcome, "ALREADY_UP_TO_DATE");
  assert.equal(alreadyUpdated.diagnostics.effectivePeriod, null);

  const providerWithoutRates = await importCdiRates({ endsOn: "2039-01-02" }, buildCdiFetcher([]));
  assert.equal(providerWithoutRates.outcome, "PROVIDER_NO_RATES");
  assert.equal(providerWithoutRates.diagnostics.providerConsulted, true);
  assert.equal(providerWithoutRates.diagnostics.receivedCount, 0);

  const noNewRecords = await importCdiRates(
    { endsOn: "2039-01-02" },
    buildCdiFetcher([{ data: "01/01/2039", valor: "0,055131" }]),
  );
  assert.equal(noNewRecords.outcome, "NO_NEW_RECORDS");
  assert.equal(noNewRecords.diagnostics.receivedCount, 1);
  assert.equal(noNewRecords.diagnostics.importedCount, 0);

  const suffix = Date.now().toString(36);
  const positive = await createAccountForContext(CONTEXT, {
    name: `Diagnóstico positivo ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });
  const negative = await createAccountForContext(CONTEXT, {
    name: `Diagnóstico negativo ${suffix}`,
    kind: "checking",
    openingBalanceMinor: -10_000,
  });
  const tiny = await createAccountForContext(CONTEXT, {
    name: `Diagnóstico arredondamento ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1,
  });
  const withoutRate = await createAccountForContext(CONTEXT, {
    name: `Diagnóstico sem taxa ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });
  const future = await createAccountForContext(CONTEXT, {
    name: `Diagnóstico futuro ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });

  await Promise.all([
    configure(positive.id, RATE_ON),
    configure(negative.id, RATE_ON),
    configure(tiny.id, RATE_ON),
    configure(withoutRate.id, "2039-01-02"),
    configure(future.id, PROCESSING_ON),
  ]);

  const firstProcessing = await processAccountRemunerations(PROCESSING_ON);
  const firstDiagnostics = firstProcessing.diagnostics;
  assert.equal(firstDiagnostics.activeConfigurations, 5);
  assert.equal(firstDiagnostics.notEligibleConfigurations, 1);
  assert.equal(firstDiagnostics.configurationsWithoutRates, 1);
  assert.equal(firstDiagnostics.eligibleCompetences, 3);
  assert.equal(firstDiagnostics.alreadyRegisteredCompetences, 0);
  assert.equal(firstDiagnostics.processedCompetences, 3);
  assert.equal(firstDiagnostics.plannedTransactionsCreated, 1);
  assert.equal(firstDiagnostics.nonPositiveBalanceCompetences, 1);
  assert.equal(firstDiagnostics.zeroAmountCompetences, 1);
  assert.equal(
    firstDiagnostics.eligibleCompetences,
    firstDiagnostics.alreadyRegisteredCompetences + firstDiagnostics.processedCompetences,
  );
  assert.equal(
    firstDiagnostics.processedCompetences,
    firstDiagnostics.plannedTransactionsCreated +
      firstDiagnostics.nonPositiveBalanceCompetences +
      firstDiagnostics.zeroAmountCompetences,
  );
  assert.match(firstProcessing.operation.message ?? "", /receita\(s\) prevista\(s\)/i);

  const secondProcessing = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(secondProcessing.diagnostics.eligibleCompetences, 3);
  assert.equal(secondProcessing.diagnostics.alreadyRegisteredCompetences, 3);
  assert.equal(secondProcessing.diagnostics.processedCompetences, 0);
  assert.equal(secondProcessing.diagnostics.plannedTransactionsCreated, 0);
  assert.match(secondProcessing.operation.message ?? "", /nenhuma competência nova/i);

  const status = await getFinancialIndexStatus();
  assert.equal(status.latestImport?.diagnostics?.kind, "CDI_IMPORT");
  assert.equal(status.latestProcessing?.diagnostics?.kind, "ACCOUNT_REMUNERATION");
  if (status.latestProcessing?.diagnostics?.kind === "ACCOUNT_REMUNERATION") {
    assert.equal(status.latestProcessing.diagnostics.alreadyRegisteredCompetences, 3);
  }
}

async function configure(accountId: string, startsOn: string): Promise<void> {
  await saveAccountRemunerationConfiguration(CONTEXT, accountId, {
    enabled: true,
    remunerationPercent: 100,
    startsOn,
  });
}

function buildCdiFetcher(entries: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(entries), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}
