import assert from "node:assert/strict";

import { renderOperation } from "./admin-financial-indexes-page.js";

const failed = renderOperation("Última importação", {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "CDI_IMPORT",
  status: "FAILED",
  startedAt: "2026-07-16T10:00:00.000Z",
  completedAt: "2026-07-16T10:00:01.000Z",
  importedCount: 0,
  processedCount: 0,
  createdCount: 0,
  pendingCount: 0,
  failureCount: 1,
  message: "O Banco Central respondeu com status 503.",
  diagnostics: {
    kind: "CDI_IMPORT",
    outcome: "FAILED",
    requestedPeriod: { startsOn: "2026-07-01", endsOn: "2026-07-16" },
    effectivePeriod: { startsOn: "2026-07-10", endsOn: "2026-07-16" },
    providerConsulted: true,
    receivedCount: 0,
    importedCount: 0,
  },
});

assert.match(failed, />Falhou</);
assert.match(failed, /O Banco Central respondeu com status 503/);
assert.match(failed, /Período solicitado/);
assert.match(failed, /Período consultado/);
assert.match(failed, /Consultado/);
assert.match(failed, /Taxas retornadas/);
