import assert from "node:assert/strict";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const MEI_PROFILE_ID = "33333333-3333-4333-8333-333333333332";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for CSV import integration tests.");
  const token = await loginAndReadToken();
  const fixtures = await createFixtures(token);

  await assertPreviewDoesNotPersist(token, fixtures.account.id);
  await assertPreviewContractValidation(token, fixtures.account.id);
  await assertStrategyDetectionOnlyWhenNeeded(token, fixtures.account.id);
  await assertLegacyMappingCannotControlNewImport(token, fixtures.account.id, fixtures.suffix);
  await assertC6PreviewAndCreation(token, fixtures.account.id, fixtures.suffix);
  await assertConsentAndMappingAreRequired(token, fixtures.account.id);
  await assertConcurrentBatchCreationConverges(token, fixtures.account.id, fixtures.suffix);
  await assertCurrencyAndConfigurationSafety(token, fixtures);
  await assertFullReviewLifecycle(token, fixtures);
  await assertDeterministicReviewIsLinkedAndIdempotent(token, fixtures);
  await assertReconciliationDetailKeepsLinkedTransaction(token, fixtures);
  await assertRejectedCandidatesReleaseNormalApproval(token, fixtures);
  await assertLegacySuggestionWithoutPayloadIsListable(token, fixtures);
  await assertDiscardLifecycleAndTenantIsolation(token, fixtures.account.id);
}

async function createFixtures(token: string): Promise<Fixtures> {
  const suffix = Date.now().toString(36);
  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta CSV ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(accountResponse.statusCode, 201);
  const account = readBody<{ account: { id: string } }>(accountResponse).account;

  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria CSV ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const category = readBody<{ category: { id: string } }>(categoryResponse).category;
  return { account, category, suffix };
}

async function assertPreviewDoesNotPersist(token: string, accountId: string): Promise<void> {
  const before = await listCsvBatches(token);
  const rawSecret = "nao-deve-voltar-no-preview";
  const content = [
    "date,description,amount,kind,internal_note",
    `2026-07-17,Mercado preview,-12.34,expense,${rawSecret}`,
  ].join("\n");
  const previewResponse = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "preview.csv",
    content,
    accountId,
    consentAccepted: true,
  });
  assert.equal(previewResponse.statusCode, 200);
  const preview = readBody<{
    state: string;
    persisted: boolean;
    csv: {
      headers: string[];
      sampleRows: Array<{
        sourceRowNumber: number;
        occurredOn: string;
        description: string;
        kind: string;
        amountMinor: number;
        currency: string;
      }>;
    };
  }>(previewResponse);
  assert.equal(preview.state, "ready");
  assert.equal(preview.persisted, false);
  assert.deepEqual(preview.csv.headers, ["date", "description", "amount", "kind", "internal_note"]);
  assert.deepEqual(preview.csv.sampleRows, [
    {
      sourceRowNumber: 2,
      occurredOn: "2026-07-17",
      description: "Mercado preview",
      kind: "expense",
      amountMinor: 1234,
      currency: "BRL",
    },
  ]);
  assert.equal(JSON.stringify(preview).includes(rawSecret), false);
  const after = await listCsvBatches(token);
  assert.equal(after.length, before.length, "Preview must not create ImportBatch rows");
}

async function assertPreviewContractValidation(token: string, accountId: string): Promise<void> {
  const manyRows = Array.from(
    { length: 12 },
    (_, index) => `2026-07-${String(index + 1).padStart(2, "0")},Linha ${index + 1},-1`,
  );
  const limited = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "preview-limitado.csv",
    content: ["Data,Descrição,Valor", ...manyRows].join("\n"),
    accountId,
    consentAccepted: true,
  });
  assert.equal(limited.statusCode, 200);
  const limitedBody = readBody<{
    suggestions: unknown[];
    csv: { headers: string[]; sampleRows: unknown[] };
  }>(limited);
  assert.equal(limitedBody.suggestions.length, 10);
  assert.equal(limitedBody.csv.sampleRows.length, 10);
  assert.deepEqual(limitedBody.csv.headers, ["Data", "Descrição", "Valor"]);

  const ambiguous = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "cabecalho-ambiguo.csv",
    content: "Data,DATE,Descrição,Valor\n18/07/2026,2026-07-18,Teste,-1",
    accountId,
    consentAccepted: true,
  });
  assert.equal(ambiguous.statusCode, 200);
  const ambiguousBody = readBody<{
    state: string;
    csv: { ambiguousFields: string[]; headers: string[] };
  }>(ambiguous);
  assert.equal(ambiguousBody.state, "mapping_required");
  assert.ok(ambiguousBody.csv.ambiguousFields.includes("date"));
  assert.deepEqual(ambiguousBody.csv.headers, ["Data", "DATE", "Descrição", "Valor"]);

  const duplicateMapping = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "mapeamento-repetido.csv",
    content: "Data,Descrição,Valor\n18/07/2026,Teste,-1",
    accountId,
    consentAccepted: true,
    csvMapping: { date: "Data", description: "Data", amount: "Valor" },
  });
  assert.equal(duplicateMapping.statusCode, 400);
  assert.equal(readErrorCode(duplicateMapping), "IMPORT_CSV_MAPPING_INVALID");

  const ambiguousDelimiter = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "separador-ambiguo.csv",
    content: "date;description,amount\n2026-07-18;Teste,-1",
    accountId,
    consentAccepted: true,
    csvMapping: {
      version: 2,
      valueStrategy: "signed",
      date: "date",
      description: "description",
      amount: "amount",
    },
  });
  assert.equal(ambiguousDelimiter.statusCode, 200);
  const ambiguousDelimiterBody = readBody<{
    state: string;
    csv: {
      delimiterCandidates: string[];
      missingRequiredFields: string[];
      valueStrategy?: string;
    };
  }>(ambiguousDelimiter);
  assert.equal(ambiguousDelimiterBody.state, "mapping_required");
  assert.equal(ambiguousDelimiterBody.csv.delimiterCandidates.length, 2);
  assert.deepEqual(ambiguousDelimiterBody.csv.missingRequiredFields, []);
  assert.equal(ambiguousDelimiterBody.csv.valueStrategy, "signed");

  const mismatched = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "colunas-divergentes.csv",
    content: ["date,description,amount", "2026-07-18,Valida,-1", "2026-07-18,Invalida"].join("\n"),
    accountId,
    consentAccepted: true,
  });
  assert.equal(mismatched.statusCode, 200);
  assert.ok(
    readBody<{ problems: Array<{ code: string }> }>(mismatched).problems.some(
      (problem) => problem.code === "IMPORT_CSV_COLUMN_COUNT_MISMATCH",
    ),
  );
}

async function assertStrategyDetectionOnlyWhenNeeded(
  token: string,
  accountId: string,
): Promise<void> {
  const cases = [
    {
      name: "signed-with-income",
      content: "Data,Descrição,Valor,Entrada\n20/07/2026,Demo,-10,10",
      expectedStrategy: "signed",
      expectedKind: "expense",
    },
    {
      name: "signed-with-expense",
      content: "Data,Descrição,Valor,Saída\n20/07/2026,Demo,10,20",
      expectedStrategy: "signed",
      expectedKind: "income",
    },
    {
      name: "ambiguous-signed-complete-split",
      content: "Data,Descrição,Valor,Amount,Entrada,Saída\n20/07/2026,Demo,10,11,10,0",
      expectedStrategy: "split",
      expectedKind: "income",
    },
    {
      name: "ambiguous-split-complete-signed",
      content: "Data,Descrição,Valor,Entrada,Receita,Saída\n20/07/2026,Demo,-10,10,11,0",
      expectedStrategy: "signed",
      expectedKind: "expense",
    },
  ] as const;

  for (const item of cases) {
    const response = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
      originalFileName: item.name + ".csv",
      content: item.content,
      accountId,
      consentAccepted: true,
    });
    assert.equal(response.statusCode, 200);
    const preview = readBody<{
      state: string;
      csv: { valueStrategy?: string; missingRequiredFields: string[]; ambiguousFields: string[] };
      suggestions: Array<{ kind: string }>;
    }>(response);
    assert.equal(preview.state, "ready", item.name + " should be ready");
    assert.equal(preview.csv.valueStrategy, item.expectedStrategy);
    assert.equal(preview.csv.missingRequiredFields.includes("valueStrategy"), false);
    assert.equal(preview.csv.ambiguousFields.includes("valueStrategy"), false);
    assert.equal(preview.suggestions[0]?.kind, item.expectedKind);
  }

  const genuinelyAmbiguous = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "both-complete.csv",
    content: "Data,Descrição,Valor,Entrada,Saída\n20/07/2026,Demo,10,10,0",
    accountId,
    consentAccepted: true,
  });
  assert.equal(genuinelyAmbiguous.statusCode, 200);
  const ambiguousPreview = readBody<{
    state: string;
    csv: { valueStrategy?: string; missingRequiredFields: string[]; ambiguousFields: string[] };
  }>(genuinelyAmbiguous);
  assert.equal(ambiguousPreview.state, "mapping_required");
  assert.equal(ambiguousPreview.csv.valueStrategy, undefined);
  assert.equal(ambiguousPreview.csv.missingRequiredFields.includes("valueStrategy"), true);
  assert.equal(ambiguousPreview.csv.ambiguousFields.includes("valueStrategy"), true);
}

async function assertLegacyMappingCannotControlNewImport(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const request = {
    originalFileName: `legacy-new-${suffix}.csv`,
    content: `date,description,amount,kind,externalId\n2026-07-20,Legado novo ${suffix},-10,income,legacy-new-${suffix}`,
    accountId,
    consentAccepted: true,
    csvMapping: {
      version: 1,
      date: "date",
      description: "description",
      amount: "amount",
      kind: "kind",
      externalId: "externalId",
    },
  };
  const previewResponse = await apiRequest(
    token,
    "POST",
    "/api/import-batches/csv/preview",
    request,
  );
  assert.equal(previewResponse.statusCode, 200);
  const preview = readBody<{
    batch: { csvMapping: Record<string, unknown> };
    suggestions: Array<{ kind: string; externalId?: string }>;
  }>(previewResponse);
  assert.equal(preview.batch.csvMapping.version, 2);
  assert.equal(preview.batch.csvMapping.valueStrategy, "signed");
  assert.equal(preview.suggestions[0]?.kind, "expense");
  assert.equal(preview.suggestions[0]?.externalId, undefined);

  const createResponse = await apiRequest(token, "POST", "/api/import-batches/csv", request);
  assert.equal(createResponse.statusCode, 201);
  const created = readBody<ImportDetail>(createResponse);
  assert.equal((created.importBatch.csvMapping as Record<string, unknown>).version, 2);
  assert.equal(requireSuggestion(created, 0).payload.kind, "expense");
  assert.equal(requireSuggestion(created, 0).payload.externalId, undefined);
}

async function assertC6PreviewAndCreation(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const content = [
    "Data Lançamento;Data Contábil;Título;Descrição;Entrada(R$);Saída(R$);Saldo do Dia(R$)",
    "20/07/2026;20/07/2026;PIX;Receita C6 " + suffix + ";100,00;0;100,00",
    "20/07/2026;20/07/2026;Compra;Despesa C6 " + suffix + ";0;-25,50;74,50",
  ].join("\n");
  const request = {
    originalFileName: "c6-" + suffix + ".csv",
    content,
    accountId,
    consentAccepted: true,
  };
  const previewResponse = await apiRequest(
    token,
    "POST",
    "/api/import-batches/csv/preview",
    request,
  );
  assert.equal(previewResponse.statusCode, 200);
  const preview = readBody<{
    state: string;
    batch: { validRows: number; csvMapping: Record<string, unknown> };
    csv: {
      valueStrategy: string;
      mapping: Record<string, unknown>;
      interpretation: Array<{ source: string; target: string }>;
      sampleRows: Array<{ kind: string; amountMinor: number }>;
    };
  }>(previewResponse);
  assert.equal(preview.state, "ready");
  assert.equal(preview.batch.validRows, 2);
  assert.equal(preview.csv.valueStrategy, "split");
  assert.equal(preview.csv.mapping.version, 2);
  assert.equal(preview.csv.mapping.date, "Data Lançamento");
  assert.equal(preview.csv.mapping.description, "Descrição");
  assert.ok(
    preview.csv.interpretation.some(
      (item) => item.source === "Saldo do Dia(R$)" && item.target === "ignored",
    ),
  );
  assert.deepEqual(
    preview.csv.sampleRows.map((row) => [row.kind, row.amountMinor]),
    [
      ["income", 10000],
      ["expense", 2550],
    ],
  );

  const createResponse = await apiRequest(token, "POST", "/api/import-batches/csv", request);
  assert.equal(createResponse.statusCode, 201);
  const created = readBody<ImportDetail>(createResponse);
  assert.equal((created.importBatch.csvMapping as Record<string, unknown>).version, 2);
  assert.deepEqual(
    created.suggestions.map((item) => [item.payload?.kind, item.payload?.amountMinor]),
    [
      ["income", 10000],
      ["expense", 2550],
    ],
  );
}

async function assertConcurrentBatchCreationConverges(
  token: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const content = `date,description,amount\n2026-07-18,Lote concorrente ${suffix},-7`;
  const responses = await Promise.all([
    apiRequest(token, "POST", "/api/import-batches/csv", {
      originalFileName: `concorrente-a-${suffix}.csv`,
      content,
      accountId,
      consentAccepted: true,
    }),
    apiRequest(token, "POST", "/api/import-batches/csv", {
      originalFileName: `concorrente-b-${suffix}.csv`,
      content,
      accountId,
      consentAccepted: true,
    }),
  ]);
  assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 201]);
  const ids = responses.map(
    (response) => readBody<ImportDetail & { duplicateBatch: boolean }>(response).importBatch.id,
  );
  assert.equal(new Set(ids).size, 1);
}

async function assertCurrencyAndConfigurationSafety(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const usdResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta USD CSV ${fixtures.suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  assert.equal(usdResponse.statusCode, 201);
  const usdAccount = readBody<{ account: { id: string } }>(usdResponse).account;
  const content = `date,description,amount
2026-07-18,Configuração ${fixtures.suffix},-8`;

  const brlBatchResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `config-brl-${fixtures.suffix}.csv`,
    content,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(brlBatchResponse.statusCode, 201);
  const brlBatch = readBody<ImportDetail>(brlBatchResponse);
  const source = requireSuggestion(brlBatch, 0);

  const currencyMismatch = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${brlBatch.importBatch.id}/suggestions/${source.id}`,
    { accountId: usdAccount.id },
  );
  assert.equal(currencyMismatch.statusCode, 400);
  assert.equal(readErrorCode(currencyMismatch), "IMPORT_ACCOUNT_CURRENCY_MISMATCH");

  const usdBatchResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `config-usd-${fixtures.suffix}.csv`,
    content,
    accountId: usdAccount.id,
    consentAccepted: true,
  });
  assert.equal(usdBatchResponse.statusCode, 201);
  const usdBatch = readBody<ImportDetail>(usdBatchResponse);
  assert.notEqual(usdBatch.importBatch.id, brlBatch.importBatch.id);
  assert.ok(
    (usdBatch.problems as Array<{ code?: string }>).some(
      (problem) => problem.code === "IMPORT_BATCH_CONFIGURATION_CHANGED",
    ),
  );
  assert.equal(requireSuggestion(usdBatch, 0).payload.currency, "USD");
}

async function assertConsentAndMappingAreRequired(token: string, accountId: string): Promise<void> {
  const previewWithoutConsent = await apiRequest(token, "POST", "/api/import-batches/csv/preview", {
    originalFileName: "preview-sem-consentimento.csv",
    content: "date,description,amount\n2026-07-17,Teste,-10",
    accountId,
  });
  assert.equal(previewWithoutConsent.statusCode, 400);
  assert.equal(readErrorCode(previewWithoutConsent), "IMPORT_CONSENT_REQUIRED");

  const noConsent = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: "sem-consentimento.csv",
    content: "date,description,amount\n2026-07-17,Teste,-10",
    accountId,
  });
  assert.equal(noConsent.statusCode, 400);
  assert.equal(readErrorCode(noConsent), "IMPORT_CONSENT_REQUIRED");

  const noMapping = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: "sem-mapeamento.csv",
    content: "quando,o-que,quanto\n2026-07-17,Teste,-10",
    accountId,
    consentAccepted: true,
  });
  assert.equal(noMapping.statusCode, 422);
  assert.equal(readErrorCode(noMapping), "IMPORT_CSV_MAPPING_REQUIRED");
}

async function assertFullReviewLifecycle(token: string, fixtures: Fixtures): Promise<void> {
  const content = [
    "date,description,amount,kind",
    `2026-07-14,Aprovar concorrente ${fixtures.suffix},-10.00,expense`,
    `2026-07-15,Rejeitar idempotente ${fixtures.suffix},-20.00,expense`,
    `2026-07-16,Aprovar em lote ${fixtures.suffix},-30.00,expense`,
  ].join("\n");
  const createResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `lifecycle-${fixtures.suffix}.csv`,
    content,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(createResponse.statusCode, 201);
  const created = readBody<ImportDetail & { duplicateBatch: boolean }>(createResponse);
  assert.equal(created.duplicateBatch, false);
  assert.equal(created.importBatch.status, "reviewing");
  assert.equal(created.importBatch.totalRows, 3);
  assert.equal(created.suggestions.length, 3);
  assert.equal(
    JSON.stringify(created).includes(content),
    false,
    "Raw CSV must not be returned or persisted",
  );
  assert.equal(
    created.suggestions.every((item) => item.payload.payloadVersion === 1),
    true,
  );
  assert.equal(
    created.suggestions.every((item) => item.payload.accountId === fixtures.account.id),
    true,
  );

  const first = requireSuggestion(created, 0);
  const updateResponse = await apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${created.importBatch.id}/suggestions/${first.id}`,
    {
      description: `Descrição corrigida ${fixtures.suffix}`,
      categoryId: fixtures.category.id,
      amountMinor: 1099,
      currency: "USD",
      externalId: "must-remain-immutable",
    },
  );
  assert.equal(updateResponse.statusCode, 200);
  const updated = readBody<{ suggestion: ImportSuggestion }>(updateResponse).suggestion;
  assert.equal(updated.status, "pending_review");
  assert.equal(updated.payload.description, `Descrição corrigida ${fixtures.suffix}`);
  assert.equal(updated.payload.amountMinor, 1099);
  assert.equal(updated.payload.currency, "BRL");
  assert.equal(updated.payload.externalId, undefined);

  const concurrent = await Promise.all([
    apiRequest(
      token,
      "POST",
      `/api/import-batches/${created.importBatch.id}/suggestions/${first.id}/approve`,
    ),
    apiRequest(
      token,
      "POST",
      `/api/import-batches/${created.importBatch.id}/suggestions/${first.id}/approve`,
    ),
  ]);
  assert.deepEqual(
    concurrent.map((response) => response.statusCode),
    [200, 200],
  );
  const transactionIds = concurrent.map(
    (response) => readBody<{ transaction: { id: string } }>(response).transaction.id,
  );
  assert.equal(
    new Set(transactionIds).size,
    1,
    "Concurrent approvals must resolve to one transaction",
  );
  const transactionRows = await query<{
    id: string;
    importBatchId: string;
    aiSuggestionId: string;
  }>(
    `select "id", "importBatchId", "aiSuggestionId" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "aiSuggestionId" = $3`,
    [created.importBatch.organizationId, PERSONAL_PROFILE_ID, first.id],
  );
  assert.equal(transactionRows.length, 1);
  assert.equal(transactionRows[0]?.importBatchId, created.importBatch.id);

  const second = requireSuggestion(created, 1);
  const rejected = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${second.id}/reject`,
    { reason: "Linha não pertence ao extrato." },
  );
  assert.equal(rejected.statusCode, 200);
  const rejectedAgain = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${second.id}/reject`,
  );
  assert.equal(rejectedAgain.statusCode, 200);
  assert.equal(readBody<{ idempotent: boolean }>(rejectedAgain).idempotent, true);

  const third = requireSuggestion(created, 2);
  const bulk = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/approve-selected`,
    { suggestionIds: [third.id, "00000000-0000-4000-8000-000000000099"] },
  );
  assert.equal(bulk.statusCode, 200);
  const bulkBody = readBody<{
    summary: { requested: number; approved: number; failed: number; idempotent: number };
    results: Array<{ suggestionId: string; status: string; code?: string }>;
    failures: { code: string }[];
    importBatch: ImportBatch;
  }>(bulk);
  assert.deepEqual(bulkBody.summary, { requested: 2, approved: 1, failed: 1, idempotent: 0 });
  assert.equal(bulkBody.results.length, 2);
  assert.equal(bulkBody.results.find((item) => item.suggestionId === third.id)?.status, "approved");
  assert.equal(bulkBody.failures.length, 1);
  assert.equal(bulkBody.failures[0]?.code, "TENANT_RESOURCE_NOT_FOUND");
  assert.equal(bulkBody.importBatch.status, "completed");

  const repeatedIds = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/approve-selected`,
    { suggestionIds: [third.id, third.id] },
  );
  assert.equal(repeatedIds.statusCode, 400);
  assert.equal(readErrorCode(repeatedIds), "IMPORT_REVIEW_DUPLICATE_SELECTION");

  const duplicateCreate = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `renamed-${fixtures.suffix}.csv`,
    content,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(duplicateCreate.statusCode, 200);
  const duplicate = readBody<ImportDetail & { duplicateBatch: boolean }>(duplicateCreate);
  assert.equal(duplicate.duplicateBatch, true);
  assert.equal(duplicate.importBatch.id, created.importBatch.id);

  const consentRows = await query<{ reason: string; redactedChanges: Record<string, string> }>(
    `select "reason", "redactedChanges" from "AuditLogEntry"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "entityKind" = 'PRIVACY_CONSENT' and "entityId" = $3`,
    [created.importBatch.organizationId, PERSONAL_PROFILE_ID, created.importBatch.id],
  );
  assert.equal(consentRows.length, 1);
  assert.match(consentRows[0]?.reason ?? "", /autorizacao/i);
  assert.equal(consentRows[0]?.redactedChanges.consentAccepted, "added");
}

async function assertDeterministicReviewIsLinkedAndIdempotent(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const description = `Duplicidade exata ${fixtures.suffix}`;
  const existingResponse = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: 4567,
    occurredOn: "2026-07-17",
    accountId: fixtures.account.id,
    categoryId: fixtures.category.id,
    description,
  });
  assert.equal(existingResponse.statusCode, 201);
  const existing = readBody<{ transaction: { id: string } }>(existingResponse).transaction;

  const importResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `dedup-${fixtures.suffix}.csv`,
    content: `date,description,amount,kind\n2026-07-17,${description},-45.67,expense`,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(importResponse.statusCode, 201);
  const imported = readBody<ImportDetail>(importResponse);
  const source = requireSuggestion(imported, 0);

  const blockedApproval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/suggestions/${source.id}/approve`,
  );
  assert.equal(blockedApproval.statusCode, 409);
  assert.equal(readErrorCode(blockedApproval), "IMPORT_REVIEW_CANDIDATE_PENDING");
  const blockedBody = readBody<{ details: { candidates: Array<{ kind: string }> } }>(
    blockedApproval,
  );
  assert.ok(blockedBody.details.candidates.some((candidate) => candidate.kind === "deduplication"));

  const persistedDetail = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${imported.importBatch.id}`,
  );
  assert.equal(persistedDetail.statusCode, 200);
  assert.equal(readBody<ImportDetail>(persistedDetail).importBatch.status, "reviewing");

  const firstScan = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/detect-duplicates`,
  );
  assert.equal(firstScan.statusCode, 200);
  const firstCandidates = readBody<{ deduplicationSuggestions: ImportSuggestion[] }>(
    firstScan,
  ).deduplicationSuggestions;
  assert.ok(firstCandidates.length > 0, "Expected deterministic duplicate candidate");
  const candidate = firstCandidates.find(
    (item) => item.payload.targetTransactionId === existing.id,
  );
  assert.ok(candidate, "Expected candidate linked to the existing transaction");
  assert.equal(candidate?.payload.sourceSuggestionId, source.id);

  const secondScan = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/detect-duplicates`,
  );
  assert.equal(secondScan.statusCode, 200);
  const secondCandidates = readBody<{ deduplicationSuggestions: ImportSuggestion[] }>(
    secondScan,
  ).deduplicationSuggestions;
  assert.equal(
    secondCandidates.find((item) => item.payload.targetTransactionId === existing.id)?.id,
    candidate?.id,
    "Repeated scan must reuse the deterministic candidate",
  );

  const decision = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${candidate?.id}/approve`,
  );
  assert.equal(decision.statusCode, 200);
  const resolved = readBody<{ suggestion: ImportSuggestion; sourceSuggestion: ImportSuggestion }>(
    decision,
  );
  assert.equal(resolved.suggestion.status, "approved");
  assert.equal(resolved.sourceSuggestion.status, "rejected");

  const repeatedDecision = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${candidate?.id}/approve`,
  );
  assert.equal(repeatedDecision.statusCode, 200);
  assert.equal(readBody<{ idempotent: boolean }>(repeatedDecision).idempotent, true);

  const discardAfterDuplicateResolution = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/discard`,
  );
  assert.equal(discardAfterDuplicateResolution.statusCode, 200);
  assert.equal(
    readBody<ImportDetail>(discardAfterDuplicateResolution).importBatch.status,
    "discarded",
  );
}

async function assertReconciliationDetailKeepsLinkedTransaction(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const description = `Conciliação exata ${fixtures.suffix}`;
  const existingResponse = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: 7654,
    occurredOn: "2026-07-20",
    accountId: fixtures.account.id,
    categoryId: fixtures.category.id,
    description,
  });
  assert.equal(existingResponse.statusCode, 201);
  const existing = readBody<{ transaction: { id: string } }>(existingResponse).transaction;

  const importResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `reconciliation-${fixtures.suffix}.csv`,
    content: `date,description,amount,kind\n2026-07-20,${description},-76.54,expense`,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(importResponse.statusCode, 201);
  const imported = readBody<ImportDetail>(importResponse);
  const source = requireSuggestion(imported, 0);

  const scanResponse = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/detect-duplicates`,
  );
  assert.equal(scanResponse.statusCode, 200);
  const candidate = readBody<{ reconciliationSuggestions: ImportSuggestion[] }>(
    scanResponse,
  ).reconciliationSuggestions.find((item) => item.payload.targetTransactionId === existing.id);
  assert.ok(candidate, "Expected reconciliation candidate linked to the existing transaction");

  const decision = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${candidate.id}/approve`,
  );
  assert.equal(decision.statusCode, 200);

  const detailResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${imported.importBatch.id}`,
  );
  assert.equal(detailResponse.statusCode, 200);
  const detail = readBody<ImportDetail>(detailResponse);
  const reconciled = requireSuggestion(detail, 0);
  assert.equal(reconciled.status, "approved");
  assert.equal(reconciled.transaction?.id, existing.id);
  assert.equal(reconciled.transaction?.status, "reconciled");
  assert.equal(reconciled.candidates?.find((item) => item.id === candidate.id)?.status, "approved");

  const createdRows = await query<{ id: string }>(
    `select "id" from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2 and "aiSuggestionId" = $3`,
    [imported.importBatch.organizationId, PERSONAL_PROFILE_ID, source.id],
  );
  assert.equal(createdRows.length, 0, "Reconciliation must not create a second transaction");

  const discard = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/discard`,
  );
  assert.equal(discard.statusCode, 409);
  assert.equal(readErrorCode(discard), "IMPORT_BATCH_HAS_FINANCIAL_EFFECTS");
}

async function assertRejectedCandidatesReleaseNormalApproval(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const description = `Rejeitar candidatos ${fixtures.suffix}`;
  const existingResponse = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: 8765,
    occurredOn: "2026-07-21",
    accountId: fixtures.account.id,
    categoryId: fixtures.category.id,
    description,
  });
  assert.equal(existingResponse.statusCode, 201);
  const existing = readBody<{ transaction: { id: string } }>(existingResponse).transaction;

  const importResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `reject-candidates-${fixtures.suffix}.csv`,
    content: `date,description,amount,kind\n2026-07-21,${description},-87.65,expense`,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(importResponse.statusCode, 201);
  const imported = readBody<ImportDetail>(importResponse);
  const source = requireSuggestion(imported, 0);
  const scanResponse = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/detect-duplicates`,
  );
  assert.equal(scanResponse.statusCode, 200);
  const scan = readBody<{
    deduplicationSuggestions: ImportSuggestion[];
    reconciliationSuggestions: ImportSuggestion[];
  }>(scanResponse);
  const candidates = [...scan.deduplicationSuggestions, ...scan.reconciliationSuggestions].filter(
    (item) => item.payload.targetTransactionId === existing.id,
  );
  assert.ok(candidates.length >= 2, "Expected duplicate and reconciliation candidates");
  for (const candidate of candidates) {
    const rejected = await apiRequest(
      token,
      "POST",
      `/api/review-suggestions/${candidate.id}/reject`,
      { reason: "Candidato rejeitado no teste." },
    );
    assert.equal(rejected.statusCode, 200);
  }

  const approved = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/suggestions/${source.id}/approve`,
  );
  assert.equal(approved.statusCode, 200);
  const transaction = readBody<{ transaction: { id: string } }>(approved).transaction;
  assert.notEqual(transaction.id, existing.id);
}

async function assertLegacySuggestionWithoutPayloadIsListable(
  token: string,
  fixtures: Fixtures,
): Promise<void> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `legacy-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-22,Legado ${fixtures.suffix},-9`,
    accountId: fixtures.account.id,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  const created = readBody<ImportDetail>(response);
  const source = requireSuggestion(created, 0);
  await query(`update "AiSuggestion" set "payload" = null where "id" = $1`, [source.id]);

  const detailResponse = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${created.importBatch.id}`,
  );
  assert.equal(detailResponse.statusCode, 200);
  const detail = readBody<{
    suggestions: Array<{ id: string; status: string; payload?: unknown }>;
  }>(detailResponse);
  assert.equal(detail.suggestions[0]?.id, source.id);
  assert.equal(detail.suggestions[0]?.payload, undefined);

  const approval = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${source.id}/approve`,
  );
  assert.equal(approval.statusCode, 400);
  assert.equal(readErrorCode(approval), "IMPORT_SUGGESTION_PAYLOAD_INVALID");
}

async function assertDiscardLifecycleAndTenantIsolation(
  token: string,
  accountId: string,
): Promise<void> {
  const suffix = `${Date.now().toString(36)}-discard`;
  const createdResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `${suffix}.csv`,
    content: `date,description,amount\n2026-07-17,Descartar ${suffix},-1`,
    accountId,
    consentAccepted: true,
  });
  const created = readBody<ImportDetail>(createdResponse);
  const source = requireSuggestion(created, 0);
  const discarded = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/discard`,
  );
  assert.equal(discarded.statusCode, 200);
  const discardedBody = readBody<ImportDetail>(discarded);
  assert.equal(discardedBody.importBatch.status, "discarded");
  assert.equal(discardedBody.suggestions[0]?.status, "rejected");
  const blocked = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${created.importBatch.id}/suggestions/${source.id}/approve`,
  );
  assert.equal(blocked.statusCode, 409);
  assert.equal(readErrorCode(blocked), "IMPORT_BATCH_DISCARDED");

  const otherProfile = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${created.importBatch.id}?profileId=${MEI_PROFILE_ID}`,
  );
  assert.equal(otherProfile.statusCode, 404);
  assert.equal(readErrorCode(otherProfile), "TENANT_RESOURCE_NOT_FOUND");

  const candidateDescription = `Descartar candidato ${suffix}`;
  const existing = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: 400,
    occurredOn: "2026-07-19",
    accountId,
    description: candidateDescription,
  });
  assert.equal(existing.statusCode, 201);
  const candidateBatchResponse = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `${suffix}-candidato.csv`,
    content: `date,description,amount
2026-07-19,${candidateDescription},-4`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(candidateBatchResponse.statusCode, 201);
  const candidateBatch = readBody<ImportDetail>(candidateBatchResponse);
  const candidateSource = requireSuggestion(candidateBatch, 0);
  const candidateBlocked = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${candidateBatch.importBatch.id}/suggestions/${candidateSource.id}/approve`,
  );
  assert.equal(candidateBlocked.statusCode, 409);
  const candidateDiscard = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${candidateBatch.importBatch.id}/discard`,
  );
  assert.equal(candidateDiscard.statusCode, 200);
  const candidateDiscardBody = readBody<ImportDetail>(candidateDiscard);
  assert.equal(candidateDiscardBody.suggestions[0]?.status, "rejected");
  assert.ok(
    candidateDiscardBody.suggestions[0]?.candidates?.every(
      (candidate) => candidate.status === "expired",
    ),
  );

  const financialEffect = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `${suffix}-efeito.csv`,
    content: [
      "date,description,amount",
      `2026-07-17,Com efeito ${suffix},-2`,
      `2026-07-18,Pendente ${suffix},-3`,
    ].join("\n"),
    accountId,
    consentAccepted: true,
  });
  assert.equal(financialEffect.statusCode, 201);
  const financialBatch = readBody<ImportDetail>(financialEffect);
  const approved = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${financialBatch.importBatch.id}/suggestions/${requireSuggestion(financialBatch, 0).id}/approve`,
  );
  assert.equal(approved.statusCode, 200);
  const blockedDiscard = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${financialBatch.importBatch.id}/discard`,
  );
  assert.equal(blockedDiscard.statusCode, 409);
  assert.equal(readErrorCode(blockedDiscard), "IMPORT_BATCH_HAS_FINANCIAL_EFFECTS");
}

async function listCsvBatches(token: string): Promise<ImportBatch[]> {
  const response = await apiRequest(token, "GET", "/api/import-batches?sourceKind=csv&status=all");
  assert.equal(response.statusCode, 200);
  return readBody<{ importBatches: ImportBatch[] }>(response).importBatches;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: { email: "demo@solverfin.example.invalid", password: "SolverFinDemo!2026" },
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
    (await handleImportBatchesApiRequest(request)) ??
    (await handleDeduplicationReconciliationApiRequest(request)) ??
    (await handleAiReviewQueueApiRequest(request)) ??
    (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled`);
  return response;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

function readErrorCode(response: ApiResponse): string | undefined {
  return readBody<{ error?: { code?: string } }>(response).error?.code;
}

function requireSuggestion(detail: ImportDetail, index: number): ImportSuggestion {
  const suggestion = detail.suggestions[index];
  assert.ok(suggestion, `Expected suggestion at index ${index}`);
  return suggestion;
}

interface Fixtures {
  account: { id: string };
  category: { id: string };
  suffix: string;
}

interface ImportBatch {
  id: string;
  organizationId: string;
  financialProfileId: string;
  status: string;
  totalRows?: number;
  csvMapping?: {
    version?: number;
    valueStrategy?: string;
    date?: string;
    description?: string;
    amount?: string;
    incomeAmount?: string;
    expenseAmount?: string;
  };
}

interface ExtractionPayload {
  payloadVersion: 1 | 2;
  sourceRowNumber: number;
  description: string;
  kind?: string;
  direction?: "inflow" | "outflow";
  amountMinor: number;
  currency: string;
  externalId?: string;
  accountId?: string;
  otherAccountId?: string;
  categoryId?: string;
  targetTransactionId?: string;
  sourceSuggestionId?: string;
}

interface ImportSuggestion {
  id: string;
  status: string;
  payload: ExtractionPayload;
  candidates?: Array<{
    id: string;
    status: string;
    kind?: string;
    targetTransactionId?: string;
  }>;
  transaction?: {
    id: string;
    status: string;
    accountId?: string;
    occurredOn: string;
  };
}

interface ImportDetail {
  importBatch: ImportBatch;
  suggestions: ImportSuggestion[];
  problems: unknown[];
}
