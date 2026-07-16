import assert from "node:assert/strict";

import {
  formatImportOutcomeMessage,
  formatProcessingOutcomeMessage,
  type ImportOperationDiagnostics,
  type ProcessingOperationDiagnostics,
} from "./repositories/account-remuneration-diagnostics-service.js";

const noChangeImport: ImportOperationDiagnostics = {
  kind: "CDI_IMPORT",
  outcome: "ALREADY_UP_TO_DATE",
  requestedPeriod: { startsOn: "2026-07-01", endsOn: "2026-07-16" },
  effectivePeriod: null,
  providerConsulted: false,
  receivedCount: 0,
  importedCount: 0,
};
assert.match(
  formatImportOutcomeMessage(noChangeImport, "2026-07-16"),
  /^Nenhuma alteração necessária/i,
);
assert.match(formatImportOutcomeMessage(noChangeImport, "2026-07-16"), /não foi consultado/i);

const processed: ProcessingOperationDiagnostics = {
  kind: "ACCOUNT_REMUNERATION",
  processedOn: "2026-07-16",
  activeConfigurations: 2,
  notEligibleConfigurations: 0,
  configurationsWithoutRates: 0,
  eligibleCompetences: 2,
  alreadyRegisteredCompetences: 0,
  processedCompetences: 2,
  plannedTransactionsCreated: 1,
  nonPositiveBalanceCompetences: 1,
  zeroAmountCompetences: 0,
  pendingCompetences: 0,
};
assert.match(formatProcessingOutcomeMessage(processed), /Extratos dos respectivos perfis/i);

const noChangeProcessing: ProcessingOperationDiagnostics = {
  ...processed,
  eligibleCompetences: 0,
  processedCompetences: 0,
  plannedTransactionsCreated: 0,
  nonPositiveBalanceCompetences: 0,
};
assert.match(formatProcessingOutcomeMessage(noChangeProcessing), /^Nenhuma alteração necessária/i);
