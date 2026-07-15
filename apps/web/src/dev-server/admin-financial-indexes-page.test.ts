import assert from "node:assert/strict";

import { renderFinancialIndexSummary } from "./admin-financial-indexes-page.js";

const summary = renderFinancialIndexSummary({
  latestCdiRate: {
    referenceOn: "2026-07-14",
    dailyRatePercent: 0.055131,
    source: "BCB_SGS_12",
    importedAt: "2026-07-15T10:00:00.000Z",
  },
  latestImport: null,
  latestProcessing: null,
  activeConfigurations: 3,
  pendingCompetences: 7,
  configurationsWithoutRates: 2,
  pendingConfigurations: 9,
});

assert.match(summary, /Competências pendentes[\s\S]*>7</);
assert.match(summary, /Contas sem taxa[\s\S]*>2</);
assert.doesNotMatch(summary, />9</);
