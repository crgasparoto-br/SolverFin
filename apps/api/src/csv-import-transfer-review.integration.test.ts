import assert from "node:assert/strict";

import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { closePool, query } from "./db.js";
import { handleDeduplicationReconciliationApiRequest } from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for transfer import tests.");
  const token = await loginAndReadToken();
  const suffix = Date.now().toString(36);
  const reference = await createAccount(token, `Referência ${suffix}`, "BRL");
  const other = await createAccount(token, `Outra ${suffix}`, "BRL");
  const third = await createAccount(token, `Terceira ${suffix}`, "BRL");
  const usd = await createAccount(token, `Dólar ${suffix}`, "USD");
  const archived = await createAccount(token, `Arquivada ${suffix}`, "BRL");
  await archiveAccount(token, archived);
  const otherProfile = await createAccount(token, `Outro perfil ${suffix}`, "BRL", MEI_PROFILE_ID);
  const transferCategory = await createCategory(token, `Transferência ${suffix}`, "transfer");
  const expenseCategory = await createCategory(token, `Despesa ${suffix}`, "expense");

  await assertOutgoingTransferCreation(token, {
    suffix,
    reference,
    other,
    transferCategory,
  });
  await assertIncomingTransferCreation(token, { suffix, reference, other });
  await assertLegacyPayloadCompatibility(token, { suffix, reference, other });
  await assertLegacyDirectionPreservedAcrossMultipleKindEdits(token, {
    suffix,
    reference,
    other,
  });
  await assertGeneralQueueTransferEditing(token, { suffix, reference, other });
  await assertTransferReferenceValidation(token, {
    suffix,
    reference,
    other,
    usd,
    archived,
    otherProfile,
    expenseCategory,
  });
  await assertSecondEndpointReconciliation(token, { suffix, reference, other });
  await assertConcurrentEndpointsConverge(token, { suffix, reference, third });
  await assertMixedBulkSummary(token, { suffix, reference, other });
}

async function assertOutgoingTransferCreation(
  token: string,
  fixtures: { suffix: string; reference: string; other: string; transferCategory: string },
): Promise<void> {
  const detail = await createBatch(token, {
    fileName: `transfer-out-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-21,Transferência saída ${fixtures.suffix},-125.50`,
    accountId: fixtures.reference,
  });
  const suggestion = requireSuggestion(detail);
  assert.equal(suggestion.payload.payloadVersion, 2);
  assert.equal(suggestion.payload.direction, "outflow");
  assert.equal(suggestion.payload.kind, "expense");

  const missingOther = await patchSuggestion(token, detail.importBatch.id, suggestion.id, {
    kind: "transfer",
  });
  assert.equal(missingOther.statusCode, 400);
  assert.equal(readErrorCode(missingOther), "IMPORT_TRANSFER_OTHER_ACCOUNT_REQUIRED");

  const updated = await patchSuggestion(token, detail.importBatch.id, suggestion.id, {
    kind: "transfer",
    otherAccountId: fixtures.other,
    categoryId: fixtures.transferCategory,
  });
  assert.equal(updated.statusCode, 200);
  const updatedSuggestion = readBody<{ suggestion: ImportSuggestion }>(updated).suggestion;
  assert.equal(updatedSuggestion.payload.kind, "transfer");
  assert.equal(updatedSuggestion.payload.direction, "outflow");
  assert.equal(updatedSuggestion.payload.otherAccountId, fixtures.other);

  const approval = await approveSuggestion(token, detail.importBatch.id, suggestion.id);
  assert.equal(approval.statusCode, 200);
  const result = readBody<ApprovalResult>(approval);
  assert.equal(result.outcome, "created");
  assert.equal(result.idempotent, false);
  assert.equal(result.transaction.kind, "transfer");
  assert.equal(result.transaction.accountId, fixtures.reference);
  assert.equal(result.transaction.destinationAccountId, fixtures.other);
  assert.equal(result.transaction.transferGroupId, result.transaction.id);
  assert.equal(result.transaction.amountMinor, 12550);
  assert.equal(result.transaction.source, "import");
  assert.equal(result.transaction.importBatchId, detail.importBatch.id);
  assert.equal(result.transaction.aiSuggestionId, suggestion.id);
  assert.equal(result.transaction.categoryId, fixtures.transferCategory);

  const transactionRows = await query<{
    count: number;
    aiSuggestionId: string;
    importBatchId: string;
  }>(
    `select count(*)::int as "count", min("aiSuggestionId"::text) as "aiSuggestionId",
       min("importBatchId"::text) as "importBatchId"
     from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "transferGroupId" = $3`,
    [
      result.transaction.organizationId,
      result.transaction.financialProfileId,
      result.transaction.id,
    ],
  );
  assert.equal(transactionRows[0]?.count, 1, "A transfer must be persisted as one transaction");
  assert.equal(transactionRows[0]?.aiSuggestionId, suggestion.id);
  assert.equal(transactionRows[0]?.importBatchId, detail.importBatch.id);
}

async function assertIncomingTransferCreation(
  token: string,
  fixtures: { suffix: string; reference: string; other: string },
): Promise<void> {
  const detail = await createBatch(token, {
    fileName: `transfer-incoming-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-22,Transferência recebida ${fixtures.suffix},33.00`,
    accountId: fixtures.reference,
  });
  const suggestion = requireSuggestion(detail);
  assert.equal(suggestion.payload.direction, "inflow");

  const patched = await patchSuggestion(token, detail.importBatch.id, suggestion.id, {
    kind: "transfer",
    otherAccountId: fixtures.other,
  });
  assert.equal(patched.statusCode, 200);

  const approved = await approveSuggestion(token, detail.importBatch.id, suggestion.id);
  assert.equal(approved.statusCode, 200);
  const result = readBody<ApprovalResult>(approved);
  assert.equal(result.outcome, "created");
  assert.equal(result.transaction.accountId, fixtures.other);
  assert.equal(result.transaction.destinationAccountId, fixtures.reference);
  assert.equal(result.transaction.transferGroupId, result.transaction.id);
}

async function assertLegacyPayloadCompatibility(
  token: string,
  fixtures: { suffix: string; reference: string; other: string },
): Promise<void> {
  const pending = await createBatch(token, {
    fileName: `transfer-legacy-pending-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-23,Transferência legada ${fixtures.suffix},-12.34`,
    accountId: fixtures.reference,
  });
  const pendingSuggestion = requireSuggestion(pending);
  await downgradeSuggestionPayloadToV1(pendingSuggestion.id);

  const converted = await patchSuggestion(token, pending.importBatch.id, pendingSuggestion.id, {
    kind: "transfer",
    otherAccountId: fixtures.other,
  });
  assert.equal(converted.statusCode, 200);
  const convertedSuggestion = readBody<{ suggestion: ImportSuggestion }>(converted).suggestion;
  assert.equal(convertedSuggestion.payload.payloadVersion, 2);
  assert.equal(convertedSuggestion.payload.direction, "outflow");

  const resolved = await createBatch(token, {
    fileName: `transfer-legacy-resolved-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-24,Despesa legada ${fixtures.suffix},-17.00`,
    accountId: fixtures.reference,
  });
  const resolvedSuggestion = requireSuggestion(resolved);
  await downgradeSuggestionPayloadToV1(resolvedSuggestion.id);
  const approved = await approveSuggestion(token, resolved.importBatch.id, resolvedSuggestion.id);
  assert.equal(approved.statusCode, 200);
  assert.equal(readBody<ApprovalResult>(approved).transaction.kind, "expense");

  const reloaded = await apiRequest(token, "GET", `/api/import-batches/${resolved.importBatch.id}`);
  assert.equal(reloaded.statusCode, 200);
  const historical = requireSuggestion(readBody<ImportDetail>(reloaded));
  assert.equal(historical.payload.payloadVersion, 1);
  assert.equal(historical.payload.kind, "expense");
}

async function assertLegacyDirectionPreservedAcrossMultipleKindEdits(
  token: string,
  fixtures: { suffix: string; reference: string; other: string },
): Promise<void> {
  const scenarios = [
    {
      label: "inflow",
      date: "2026-08-01",
      amount: "47.00",
      intermediateKind: "expense",
      direction: "inflow",
      sourceAccountId: fixtures.other,
      destinationAccountId: fixtures.reference,
    },
    {
      label: "outflow",
      date: "2026-08-02",
      amount: "-53.00",
      intermediateKind: "income",
      direction: "outflow",
      sourceAccountId: fixtures.reference,
      destinationAccountId: fixtures.other,
    },
  ] as const;

  for (const scenario of scenarios) {
    const detail = await createBatch(token, {
      fileName: `legacy-direction-${scenario.label}-${fixtures.suffix}.csv`,
      content: `date,description,amount\n${scenario.date},Legacy ${scenario.label} ${fixtures.suffix},${scenario.amount}`,
      accountId: fixtures.reference,
    });
    const suggestion = requireSuggestion(detail);
    await downgradeSuggestionPayloadToV1(suggestion.id);

    const intermediate = await patchSuggestion(token, detail.importBatch.id, suggestion.id, {
      kind: scenario.intermediateKind,
    });
    assert.equal(intermediate.statusCode, 200);
    const intermediateSuggestion = readBody<{ suggestion: ImportSuggestion }>(
      intermediate,
    ).suggestion;
    assert.equal(intermediateSuggestion.payload.payloadVersion, 2);
    assert.equal(intermediateSuggestion.payload.direction, scenario.direction);

    const transfer = await patchSuggestion(token, detail.importBatch.id, suggestion.id, {
      kind: "transfer",
      otherAccountId: fixtures.other,
    });
    assert.equal(transfer.statusCode, 200);
    assert.equal(
      readBody<{ suggestion: ImportSuggestion }>(transfer).suggestion.payload.direction,
      scenario.direction,
    );

    const approved = await approveSuggestion(token, detail.importBatch.id, suggestion.id);
    assert.equal(approved.statusCode, 200);
    const transaction = readBody<ApprovalResult>(approved).transaction;
    assert.equal(transaction.accountId, scenario.sourceAccountId);
    assert.equal(transaction.destinationAccountId, scenario.destinationAccountId);
  }
}

async function assertGeneralQueueTransferEditing(
  token: string,
  fixtures: { suffix: string; reference: string; other: string },
): Promise<void> {
  const detail = await createBatch(token, {
    fileName: `queue-transfer-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-08-03,Queue transfer ${fixtures.suffix},-39.77`,
    accountId: fixtures.reference,
  });
  const suggestion = requireSuggestion(detail);

  const edited = await apiRequest(token, "POST", `/api/ai-review-queue/${suggestion.id}/edit`, {
    payload: { kind: "transfer", otherAccountId: fixtures.other },
  });
  assert.equal(edited.statusCode, 200);
  const editedSuggestion = readBody<{ suggestion: ImportSuggestion }>(edited).suggestion;
  assert.equal(editedSuggestion.payload.kind, "transfer");
  assert.equal(editedSuggestion.payload.direction, "outflow");
  assert.equal(editedSuggestion.payload.otherAccountId, fixtures.other);

  const queue = await apiRequest(
    token,
    "GET",
    "/api/ai-review-queue?status=pending_review&includeLowConfidence=true",
  );
  assert.equal(queue.statusCode, 200);
  const queueItem = readBody<{
    suggestions: Array<{
      id: string;
      proposedTransaction?: {
        kind: string;
        direction?: string;
        otherAccountId?: string;
      };
    }>;
  }>(queue).suggestions.find((item) => item.id === suggestion.id);
  assert.ok(queueItem);
  assert.equal(queueItem.proposedTransaction?.kind, "transfer");
  assert.equal(queueItem.proposedTransaction?.direction, "outflow");
  assert.equal(queueItem.proposedTransaction?.otherAccountId, fixtures.other);

  const approved = await apiRequest(token, "POST", `/api/ai-review-queue/${suggestion.id}/approve`);
  assert.equal(approved.statusCode, 200);
  const transaction = readBody<{ transaction: TransactionRecord }>(approved).transaction;
  assert.equal(transaction.kind, "transfer");
  assert.equal(transaction.accountId, fixtures.reference);
  assert.equal(transaction.destinationAccountId, fixtures.other);

  const unsupported = await createBatch(token, {
    fileName: `queue-unsupported-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-08-04,Queue unsupported ${fixtures.suffix},-19.13`,
    accountId: fixtures.reference,
  });
  const unsupportedSuggestion = requireSuggestion(unsupported);
  const rejectedEdit = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${unsupportedSuggestion.id}/edit`,
    { payload: { currency: "USD" } },
  );
  assert.equal(rejectedEdit.statusCode, 400);
  assert.equal(readErrorCode(rejectedEdit), "AI_REVIEW_IMPORT_EDIT_PAYLOAD_REQUIRED");
}

async function downgradeSuggestionPayloadToV1(suggestionId: string): Promise<void> {
  const rows = await query<{ payload: Record<string, unknown> }>(
    `select "payload" from "AiSuggestion" where "id" = $1`,
    [suggestionId],
  );
  const payload = rows[0]?.payload;
  assert.ok(payload);
  const legacyPayload = {
    payloadVersion: 1,
    sourceRowNumber: payload.sourceRowNumber,
    sourceHash: payload.sourceHash,
    occurredOn: payload.occurredOn,
    kind: payload.kind,
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    description: payload.description,
    accountId: payload.accountId,
    ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
    ...(payload.externalId === undefined ? {} : { externalId: payload.externalId }),
  };
  await query(`update "AiSuggestion" set "payload" = $2::jsonb where "id" = $1`, [
    suggestionId,
    JSON.stringify(legacyPayload),
  ]);
}

async function assertTransferReferenceValidation(
  token: string,
  fixtures: {
    suffix: string;
    reference: string;
    other: string;
    usd: string;
    archived: string;
    otherProfile: string;
    expenseCategory: string;
  },
): Promise<void> {
  const cases: Array<{ label: string; body: Record<string, unknown>; code: string }> = [
    {
      label: "same",
      body: { kind: "transfer", otherAccountId: fixtures.reference },
      code: "IMPORT_TRANSFER_SAME_ACCOUNT",
    },
    {
      label: "archived",
      body: { kind: "transfer", otherAccountId: fixtures.archived },
      code: "IMPORT_TRANSFER_OTHER_ACCOUNT_INVALID",
    },
    {
      label: "currency",
      body: { kind: "transfer", otherAccountId: fixtures.usd },
      code: "IMPORT_TRANSFER_CURRENCY_MISMATCH",
    },
    {
      label: "profile",
      body: { kind: "transfer", otherAccountId: fixtures.otherProfile },
      code: "TENANT_RESOURCE_NOT_FOUND",
    },
    {
      label: "category",
      body: {
        kind: "transfer",
        otherAccountId: fixtures.other,
        categoryId: fixtures.expenseCategory,
      },
      code: "IMPORT_CATEGORY_KIND_MISMATCH",
    },
  ];
  for (const testCase of cases) {
    const detail = await createBatch(token, {
      fileName: `transfer-validation-${testCase.label}-${fixtures.suffix}.csv`,
      content: `date,description,amount\n2026-07-21,Validation ${testCase.label} ${fixtures.suffix},-42.00`,
      accountId: fixtures.reference,
    });
    const suggestion = requireSuggestion(detail);
    const response = await patchSuggestion(
      token,
      detail.importBatch.id,
      suggestion.id,
      testCase.body,
    );
    assert.equal(response.statusCode, testCase.code === "TENANT_RESOURCE_NOT_FOUND" ? 404 : 400);
    assert.equal(readErrorCode(response), testCase.code);
  }
}

async function assertSecondEndpointReconciliation(
  token: string,
  fixtures: { suffix: string; reference: string; other: string },
): Promise<void> {
  const outgoing = await createBatch(token, {
    fileName: `transfer-pair-out-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-21,Pair out ${fixtures.suffix},-88.00`,
    accountId: fixtures.reference,
  });
  const outSuggestion = requireSuggestion(outgoing);
  const updatedOut = await patchSuggestion(token, outgoing.importBatch.id, outSuggestion.id, {
    kind: "transfer",
    otherAccountId: fixtures.other,
  });
  assert.equal(updatedOut.statusCode, 200);
  const created = await approveSuggestion(token, outgoing.importBatch.id, outSuggestion.id);
  assert.equal(created.statusCode, 200);
  const createdResult = readBody<ApprovalResult>(created);

  const incoming = await createBatch(token, {
    fileName: `transfer-pair-in-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-22,Pair in ${fixtures.suffix},88.00`,
    accountId: fixtures.other,
  });
  const inSuggestion = requireSuggestion(incoming);
  const updatedIn = await patchSuggestion(token, incoming.importBatch.id, inSuggestion.id, {
    kind: "transfer",
    otherAccountId: fixtures.reference,
  });
  assert.equal(updatedIn.statusCode, 200);

  const blocked = await approveSuggestion(token, incoming.importBatch.id, inSuggestion.id);
  assert.equal(blocked.statusCode, 409);
  assert.equal(readErrorCode(blocked), "IMPORT_REVIEW_CANDIDATE_PENDING");

  const detected = await apiRequest(token, "GET", `/api/import-batches/${incoming.importBatch.id}`);
  assert.equal(detected.statusCode, 200);
  const detectedSuggestion = requireSuggestion(readBody<ImportDetail>(detected));
  const reconciliation = detectedSuggestion.candidates.find(
    (candidate) => candidate.kind === "reconciliation",
  );
  assert.ok(reconciliation);

  const reconciled = await apiRequest(
    token,
    "POST",
    `/api/review-suggestions/${reconciliation.id}/approve`,
  );
  assert.equal(reconciled.statusCode, 200);
  const reconciledBody = readBody<{ transaction: ApprovalResult["transaction"] }>(reconciled);
  assert.equal(reconciledBody.transaction.id, createdResult.transaction.id);
  assert.equal(reconciledBody.transaction.status, "reconciled");

  const reconciledDetail = await apiRequest(
    token,
    "GET",
    `/api/import-batches/${incoming.importBatch.id}`,
  );
  const reloadedSuggestion = requireSuggestion(readBody<ImportDetail>(reconciledDetail));
  assert.equal(reloadedSuggestion.targetEntityId, createdResult.transaction.id);
  assert.equal(reloadedSuggestion.transaction?.id, createdResult.transaction.id);
  const provenance = await query<{
    aiSuggestionId: string;
    importBatchId: string;
    accountId: string;
    destinationAccountId: string;
    amountMinor: number;
  }>(
    `select "aiSuggestionId", "importBatchId", "accountId", "destinationAccountId", "amountMinor"
     from "Transaction" where "id" = $1`,
    [createdResult.transaction.id],
  );
  assert.equal(provenance[0]?.aiSuggestionId, outSuggestion.id);
  assert.equal(provenance[0]?.importBatchId, outgoing.importBatch.id);
  assert.equal(provenance[0]?.accountId, fixtures.reference);
  assert.equal(provenance[0]?.destinationAccountId, fixtures.other);
  assert.equal(provenance[0]?.amountMinor, 8800);
}

async function assertConcurrentEndpointsConverge(
  token: string,
  fixtures: { suffix: string; reference: string; third: string },
): Promise<void> {
  const outgoing = await createBatch(token, {
    fileName: `transfer-concurrent-out-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-25,Concurrent out ${fixtures.suffix},-71.23`,
    accountId: fixtures.reference,
  });
  const incoming = await createBatch(token, {
    fileName: `transfer-concurrent-in-${fixtures.suffix}.csv`,
    content: `date,description,amount\n2026-07-26,Concurrent in ${fixtures.suffix},71.23`,
    accountId: fixtures.third,
  });
  const outgoingSuggestion = requireSuggestion(outgoing);
  const incomingSuggestion = requireSuggestion(incoming);
  assert.equal(
    (
      await patchSuggestion(token, outgoing.importBatch.id, outgoingSuggestion.id, {
        kind: "transfer",
        otherAccountId: fixtures.third,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await patchSuggestion(token, incoming.importBatch.id, incomingSuggestion.id, {
        kind: "transfer",
        otherAccountId: fixtures.reference,
      })
    ).statusCode,
    200,
  );

  const responses = await Promise.all([
    approveSuggestion(token, outgoing.importBatch.id, outgoingSuggestion.id),
    approveSuggestion(token, incoming.importBatch.id, incomingSuggestion.id),
  ]);
  assert.deepEqual(
    responses.map((response) => response.statusCode),
    [200, 200],
  );
  const results = responses.map((response) => readBody<ApprovalResult>(response));
  assert.equal(new Set(results.map((result) => result.transaction.id)).size, 1);
  assert.equal(results.filter((result) => result.outcome === "created").length, 1);
  assert.equal(
    results.filter((result) => result.outcome === "reconciled" || result.outcome === "idempotent")
      .length,
    1,
  );

  const rows = await query<{ count: number }>(
    `select count(*)::int as "count" from "Transaction"
     where "kind" = 'TRANSFER' and "accountId" = $1 and "destinationAccountId" = $2
       and "amountMinor" = 7123 and "occurredOn" between '2026-07-25' and '2026-07-26'`,
    [fixtures.reference, fixtures.third],
  );
  assert.equal(rows[0]?.count, 1, "Concurrent endpoints must persist one transfer");
}

async function assertMixedBulkSummary(
  token: string,
  fixtures: { suffix: string; reference: string; other: string },
): Promise<void> {
  const detail = await createBatch(token, {
    fileName: `transfer-mixed-bulk-${fixtures.suffix}.csv`,
    content: [
      "date,description,amount",
      `2026-07-27,Mixed income ${fixtures.suffix},101.00`,
      `2026-07-28,Mixed expense ${fixtures.suffix},-51.00`,
      `2026-07-29,Mixed transfer ${fixtures.suffix},-26.00`,
    ].join("\n"),
    accountId: fixtures.reference,
  });
  assert.equal(detail.suggestions.length, 3);
  const transferSuggestion = requireSuggestion(detail, 2);
  const patched = await patchSuggestion(token, detail.importBatch.id, transferSuggestion.id, {
    kind: "transfer",
    otherAccountId: fixtures.other,
  });
  assert.equal(patched.statusCode, 200);

  const response = await apiRequest(
    token,
    "POST",
    `/api/import-batches/${detail.importBatch.id}/approve-selected`,
    { suggestionIds: detail.suggestions.map((suggestion) => suggestion.id) },
  );
  assert.equal(response.statusCode, 200);
  const result = readBody<BulkApprovalResult>(response);
  assert.deepEqual(result.summary, {
    requested: 3,
    approved: 3,
    failed: 0,
    created: 3,
    reconciled: 0,
    idempotent: 0,
    blocked: 0,
    transferCount: 1,
    transferTotalMinor: 2600,
  });
  assert.equal(
    result.results.every((item) => item.status === "approved"),
    true,
  );
  assert.equal(
    result.results.every((item) => item.outcome === "created"),
    true,
  );

  const rows = await query<{ kind: string; count: number }>(
    `select "kind"::text as "kind", count(*)::int as "count"
       from "Transaction" where "importBatchId" = $1 group by "kind" order by "kind"`,
    [detail.importBatch.id],
  );
  assert.deepEqual(rows.map((row) => [row.kind.toLowerCase(), row.count]).sort(), [
    ["expense", 1],
    ["income", 1],
    ["transfer", 1],
  ]);
}

async function createAccount(
  token: string,
  name: string,
  currency: string,
  profileId?: string,
): Promise<string> {
  const path = profileId ? `/api/accounts?profileId=${profileId}` : "/api/accounts";
  const response = await apiRequest(token, "POST", path, {
    name,
    kind: "checking",
    openingBalanceMinor: 0,
    currency,
  });
  assert.equal(response.statusCode, 201);
  return readBody<{ account: { id: string } }>(response).account.id;
}

async function archiveAccount(token: string, accountId: string): Promise<void> {
  const response = await apiRequest(token, "POST", `/api/accounts/${accountId}/archive`);
  assert.equal(response.statusCode, 200);
}

async function createCategory(token: string, name: string, kind: string): Promise<string> {
  const response = await apiRequest(token, "POST", "/api/categories", { name, kind });
  assert.equal(response.statusCode, 201);
  return readBody<{ category: { id: string } }>(response).category.id;
}

async function createBatch(
  token: string,
  input: { fileName: string; content: string; accountId: string },
): Promise<ImportDetail> {
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: input.fileName,
    content: input.content,
    accountId: input.accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  return readBody<ImportDetail>(response);
}

function patchSuggestion(
  token: string,
  importBatchId: string,
  suggestionId: string,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  return apiRequest(
    token,
    "PATCH",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}`,
    body,
  );
}

function approveSuggestion(
  token: string,
  importBatchId: string,
  suggestionId: string,
): Promise<ApiResponse> {
  return apiRequest(
    token,
    "POST",
    `/api/import-batches/${importBatchId}/suggestions/${suggestionId}/approve`,
  );
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

function requireSuggestion(detail: ImportDetail, index = 0): ImportSuggestion {
  const suggestion = detail.suggestions[index];
  assert.ok(suggestion, `Expected suggestion at index ${index}`);
  return suggestion;
}

interface ExtractionPayload {
  payloadVersion: 1 | 2;
  sourceRowNumber: number;
  sourceHash?: string;
  occurredOn?: string;
  description: string;
  kind: string;
  direction?: "inflow" | "outflow";
  amountMinor: number;
  currency: string;
  accountId?: string;
  otherAccountId?: string;
  categoryId?: string;
  externalId?: string;
}

interface ImportSuggestion {
  id: string;
  status: string;
  targetEntityId?: string;
  payload: ExtractionPayload;
  candidates: Array<{
    id: string;
    status: string;
    kind: string;
    targetTransactionId?: string;
  }>;
  transaction?: TransactionRecord;
}

interface ImportDetail {
  importBatch: {
    id: string;
    organizationId: string;
    financialProfileId: string;
    status: string;
  };
  suggestions: ImportSuggestion[];
  problems: unknown[];
}

interface TransactionRecord {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  plannedOn: string;
  effectiveOn?: string;
  description: string;
  accountId?: string;
  destinationAccountId?: string;
  transferGroupId?: string;
  importBatchId?: string;
  aiSuggestionId?: string;
  categoryId?: string;
}

interface ApprovalResult {
  outcome: string;
  idempotent: boolean;
  transaction: TransactionRecord;
}

interface BulkApprovalResult {
  summary: {
    requested: number;
    approved: number;
    failed: number;
    created: number;
    reconciled: number;
    idempotent: number;
    blocked: number;
    transferCount: number;
    transferTotalMinor: number;
  };
  results: Array<{ suggestionId: string; status: string; outcome: string }>;
}
