import assert from "node:assert/strict";

import { renderFinancialIndexSummary, renderOperation } from "./admin-financial-indexes-page.js";

const summary = renderFinancialIndexSummary({
  latestCdiRate: null,
  latestImport: null,
  latestProcessing: null,
  activeConfigurations: 4,
  pendingCompetences: 3,
  configurationsWithoutRates: 2,
  pendingConfigurations: 5,
});
assert.match(summary, /Configurações ativas/);
assert.match(summary, /Competências pendentes/);
assert.match(summary, /Configurações sem taxa/);
assert.doesNotMatch(summary, /Contas sem taxa/);

const importOperation = renderOperation("Última importação", {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "CDI_IMPORT",
  status: "SUCCESS",
  startedAt: "2026-07-16T10:00:00.000Z",
  completedAt: "2026-07-16T10:00:01.000Z",
  importedCount: 0,
  processedCount: 0,
  createdCount: 0,
  pendingCount: 0,
  failureCount: 0,
  message:
    "A série CDI já estava atualizada. O Banco Central não foi consultado e nenhum registro novo foi criado.",
  diagnostics: {
    kind: "CDI_IMPORT",
    outcome: "ALREADY_UP_TO_DATE",
    requestedPeriod: { startsOn: "2026-07-01", endsOn: "2026-07-16" },
    effectivePeriod: null,
    providerConsulted: false,
    receivedCount: 0,
    importedCount: 0,
  },
});
assert.match(importOperation, /Série já atualizada/);
assert.match(importOperation, /Período solicitado/);
assert.match(importOperation, /Período consultado/);
assert.match(importOperation, /Não consultado/);
assert.match(importOperation, /Taxas retornadas/);
assert.match(importOperation, /Novas taxas importadas/);
assert.doesNotMatch(importOperation, /<dt>Processados<\/dt>/);

const processingOperation = renderOperation("Último processamento", {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "ACCOUNT_REMUNERATION",
  status: "SUCCESS",
  startedAt: "2026-07-16T10:00:00.000Z",
  completedAt: "2026-07-16T10:00:01.000Z",
  importedCount: 0,
  processedCount: 3,
  createdCount: 1,
  pendingCount: 0,
  failureCount: 0,
  message:
    "Foram processadas 3 competências: 1 receita prevista criada, 1 saldo não positivo e 1 arredondada para zero.",
  diagnostics: {
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
  },
});
assert.match(processingOperation, /Configurações ativas/);
assert.match(processingOperation, /Ainda não iniciadas/);
assert.match(processingOperation, /Competências elegíveis/);
assert.match(processingOperation, /Já registradas/);
assert.match(processingOperation, /Receitas previstas criadas/);
assert.match(processingOperation, /Saldo não positivo/);
assert.match(processingOperation, /Arredondadas para zero/);

const legacyOperation = renderOperation("Operação antiga", {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "CDI_IMPORT",
  status: "SUCCESS",
  startedAt: "2026-07-16T10:00:00.000Z",
  completedAt: "2026-07-16T10:00:01.000Z",
  importedCount: 1,
  processedCount: 0,
  createdCount: 0,
  pendingCount: 0,
  failureCount: 0,
  message: null,
});
assert.match(legacyOperation, /Contagens da operação legada/);
assert.match(legacyOperation, /Execução concluída sem mensagem adicional/);
