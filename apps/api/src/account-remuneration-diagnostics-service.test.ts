import assert from "node:assert/strict";

import {
  assertProcessingDiagnosticRelations,
  classifyImportOutcome,
  formatImportOutcomeMessage,
  formatProcessingOutcomeMessage,
  importCdiRates,
  type ImportOperationDiagnostics,
  type ProcessingOperationDiagnostics,
} from "./repositories/account-remuneration-diagnostics-service.js";

assert.equal(
  classifyImportOutcome({
    providerConsulted: false,
    receivedCount: 0,
    importedCount: 0,
  }),
  "ALREADY_UP_TO_DATE",
);
assert.equal(
  classifyImportOutcome({
    providerConsulted: true,
    receivedCount: 0,
    importedCount: 0,
  }),
  "PROVIDER_NO_RATES",
);
assert.equal(
  classifyImportOutcome({
    providerConsulted: true,
    receivedCount: 2,
    importedCount: 0,
  }),
  "NO_NEW_RECORDS",
);
assert.equal(
  classifyImportOutcome({
    providerConsulted: true,
    receivedCount: 2,
    importedCount: 2,
  }),
  "IMPORTED",
);

const alreadyUpdated: ImportOperationDiagnostics = {
  kind: "CDI_IMPORT",
  outcome: "ALREADY_UP_TO_DATE",
  requestedPeriod: { startsOn: "2026-07-01", endsOn: "2026-07-15" },
  effectivePeriod: null,
  providerConsulted: false,
  receivedCount: 0,
  importedCount: 0,
};
assert.match(
  formatImportOutcomeMessage(alreadyUpdated, "2026-07-15"),
  /não foi consultado/i,
);
assert.match(
  formatImportOutcomeMessage(alreadyUpdated, "2026-07-15"),
  /^Nenhuma alteração necessária/i,
);

const noRates: ImportOperationDiagnostics = {
  ...alreadyUpdated,
  outcome: "PROVIDER_NO_RATES",
  effectivePeriod: { startsOn: "2026-07-16", endsOn: "2026-07-16" },
  providerConsulted: true,
};
assert.match(
  formatImportOutcomeMessage(noRates, "2026-07-15"),
  /não retornou taxas/i,
);
assert.match(
  formatImportOutcomeMessage(noRates, "2026-07-15"),
  /fins de semana ou feriados/i,
);

const processing: ProcessingOperationDiagnostics = {
  kind: "ACCOUNT_REMUNERATION",
  processedOn: "2026-07-16",
  activeConfigurations: 5,
  notEligibleConfigurations: 1,
  configurationsWithoutRates: 1,
  eligibleCompetences: 6,
  alreadyRegisteredCompetences: 3,
  processedCompetences: 3,
  plannedTransactionsCreated: 1,
  nonPositiveBalanceCompetences: 1,
  zeroAmountCompetences: 1,
  pendingCompetences: 0,
};
assert.doesNotThrow(() => assertProcessingDiagnosticRelations(processing));
assert.match(formatProcessingOutcomeMessage(processing), /3 competência\(s\)/i);
assert.match(
  formatProcessingOutcomeMessage(processing),
  /1 receita\(s\) prevista\(s\)/i,
);
assert.match(formatProcessingOutcomeMessage(processing), /saldo não positivo/i);
assert.match(
  formatProcessingOutcomeMessage(processing),
  /arredondamento para zero/i,
);

assert.throws(
  () =>
    assertProcessingDiagnosticRelations({
      ...processing,
      eligibleCompetences: 7,
    }),
  /competências elegíveis/i,
);
assert.throws(
  () =>
    assertProcessingDiagnosticRelations({
      ...processing,
      plannedTransactionsCreated: 2,
    }),
  /competências processadas/i,
);

const noProcessing: ProcessingOperationDiagnostics = {
  ...processing,
  eligibleCompetences: 3,
  alreadyRegisteredCompetences: 3,
  processedCompetences: 0,
  plannedTransactionsCreated: 0,
  nonPositiveBalanceCompetences: 0,
  zeroAmountCompetences: 0,
};
assert.match(
  formatProcessingOutcomeMessage(noProcessing),
  /^Nenhuma alteração necessária/i,
);
assert.match(
  formatProcessingOutcomeMessage(noProcessing),
  /nenhuma receita prevista/i,
);

await assert.rejects(
  () => importCdiRates({ startsOn: "2026-07-17", endsOn: "2026-07-16" }),
  (error: unknown) =>
    error instanceof Error &&
    "code" in error &&
    error.code === "FINANCIAL_INDEX_PERIOD_INVALID" &&
    /data inicial/i.test(error.message),
);
