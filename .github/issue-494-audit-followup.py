from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def replace_between(path: str, start_marker: str, end_marker: str, replacement: str, *, search_from: str | None = None) -> None:
    file = Path(path)
    text = file.read_text()
    origin = text.index(search_from) if search_from else 0
    start = text.index(start_marker, origin)
    end = text.index(end_marker, start)
    file.write_text(text[:start] + replacement + text[end:])


backend = "apps/api/src/repositories/imports.ts"
replace_once(
    backend,
    "  payload: TransactionExtractionPayloadV1;",
    "  payload?: TransactionExtractionPayloadV1;",
)

backend_detail = '''  const reconciliationTargetIds = [
    ...new Set(
      deterministicSuggestions.flatMap((candidate) => {
        if (candidate.kind !== "reconciliation" || candidate.status !== "approved") return [];
        const payload = parseDeterministicReviewPayload(candidate.payload);
        return payload === undefined ? [] : [payload.targetTransactionId];
      }),
    ),
  ];
  const transactionRows = await query<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and ("importBatchId" = $3 or "id" = any($4::uuid[]))`,
    [
      context.organizationId,
      context.financialProfileId,
      importBatchId,
      reconciliationTargetIds,
    ],
  );
  const mappedTransactions = transactionRows.map(mapTransactionRow);
  const transactionsBySuggestion = new Map(
    mappedTransactions.flatMap((transaction) =>
      transaction.aiSuggestionId === undefined
        ? []
        : [[transaction.aiSuggestionId, transaction] as const],
    ),
  );
  const transactionsById = new Map(
    mappedTransactions.map((transaction) => [transaction.id, transaction] as const),
  );

  return {
    importBatch: batch,
    suggestions: extractionSuggestions.map((suggestion) => {
      const candidates = deterministicSuggestions.filter(
        (candidate) => getSourceSuggestionId(candidate) === suggestion.id,
      );
      const reconciliationTargetId = candidates.flatMap((candidate) => {
        if (candidate.kind !== "reconciliation" || candidate.status !== "approved") return [];
        const payload = parseDeterministicReviewPayload(candidate.payload);
        return payload === undefined ? [] : [payload.targetTransactionId];
      })[0];
      return toImportReviewSuggestion(
        suggestion,
        candidates,
        transactionsBySuggestion.get(suggestion.id) ??
          (reconciliationTargetId === undefined
            ? undefined
            : transactionsById.get(reconciliationTargetId)),
      );
    }),
    problems: batch.problems as ImportProblem[],
  };
'''
replace_between(
    backend,
    "  const transactionRows = await query<TransactionRow>(",
    "}\n\nexport async function updateImportSuggestionForContext",
    backend_detail,
    search_from="export async function getImportBatchDetailForContext",
)

text = Path(backend).read_text()
function_start = text.index("function toImportReviewSuggestion(")
function_end = text.index("\nfunction getSourceSuggestionId", function_start)
function_text = text[function_start:function_end]
function_text = function_text.replace(
    "  const payload = requireExtractionPayload(suggestion);",
    "  const payload = parseTransactionExtractionPayload(suggestion.payload);",
    1,
).replace(
    "    payload,\n    candidates:",
    "    ...(payload === undefined ? {} : { payload }),\n    candidates:",
    1,
)
Path(backend).write_text(text[:function_start] + function_text + text[function_end:])

web = "apps/web/src/dev-server/inbox-page.ts"
render_row = '''        function renderRow(item, batch) {
          const payload = item.payload || {};
          const currentState = rowState(item, batch);
          const hasStructuredPayload = Boolean(item.payload);
          const readOnly =
            batch.status !== "reviewing" ||
            item.status !== "pending_review" ||
            !hasStructuredPayload;
          const selectable = currentState === "eligible";
          const checked = state.selected.has(item.id) ? " checked" : "";
          const lineActions = readOnly ? "" : '<div class="inline-actions"><button type="button" class="secondary-button" data-line-action="edit">Corrigir linha</button><button type="button" data-line-action="approve" ' + (selectable ? "" : "disabled") + '>Confirmar linha</button><button type="button" class="secondary-button danger-action" data-line-action="reject">Rejeitar</button></div>';
          const legacyNotice = hasStructuredPayload ? "" : '<p class="warning" role="status">Esta linha legada não possui dados estruturados para revisão. Corrija o arquivo e faça uma nova importação.</p>';
          const transactionLink = item.transaction ? '<a class="button-link secondary-button" href="/lancamentos?accountId=' + encodeURIComponent(item.transaction.accountId || payload.accountId || "") + '&month=' + encodeURIComponent(String(item.transaction.occurredOn || payload.occurredOn).slice(0, 7)) + '">Ver no Extrato</a>' : "";
          return '<article class="import-row" data-suggestion-id="' + escapeHtml(item.id) + '" data-row-state="' + escapeHtml(currentState) + '">' +
            '<input type="checkbox" data-select-suggestion value="' + escapeHtml(item.id) + '" aria-label="Selecionar linha ' + escapeHtml(payload.sourceRowNumber || "sem dados estruturados") + '" ' + (selectable ? "" : "disabled") + checked + ' />' +
            '<div class="row-editor"><div class="row-heading"><strong>Linha ' + escapeHtml(payload.sourceRowNumber || "—") + '</strong><span class="status-pill">' + escapeHtml(stateLabel(currentState)) + '</span></div>' +
            '<dl class="row-summary"><div><dt>Data</dt><dd>' + formatDate(payload.occurredOn) + '</dd></div><div><dt>Tipo</dt><dd>' + escapeHtml(payload.kind === "income" ? "Receita" : "Despesa") + '</dd></div><div><dt>Valor</dt><dd>' + escapeHtml(formatMoney(payload.amountMinor, payload.currency)) + '</dd></div><div><dt>Descrição</dt><dd>' + escapeHtml(payload.description || "Dados legados indisponíveis") + '</dd></div><div><dt>Conta</dt><dd>' + escapeHtml(accountName(payload.accountId)) + '</dd></div></dl>' +
            legacyNotice + lineActions + transactionLink + '</div>' +
            ((item.candidates || []).length ? '<div class="candidate-list">' + item.candidates.map((candidate) => renderCandidate(candidate, batch.status !== "reviewing")).join("") + '</div>' : "") + '</article>';
        }
'''
replace_between(web, "        function renderRow(item, batch) {", "        function statementUrl(value) {", render_row)

detail_summary = '''        function detailSummary(value) {
          const suggestions = value.suggestions || [];
          const states = suggestions.map((item) => rowState(item, value.importBatch));
          return {
            valid: suggestions.filter((item) => Boolean(item.payload)).length,
            pending: suggestions.filter((item) => item.status === "pending_review").length,
            blocked: states.filter((stateValue) => stateValue === "candidate_pending").length,
            approved: states.filter((stateValue) => stateValue === "approved_created").length,
            reconciled: states.filter((stateValue) => stateValue === "reconciled").length,
            duplicates: states.filter((stateValue) => stateValue === "duplicate_ignored").length,
            rejected: states.filter((stateValue) => stateValue === "rejected").length,
            transactions: suggestions.filter((item) => item.transaction).length,
            problems: (value.problems || []).length
          };
        }
'''
replace_between(web, "        function detailSummary(value) {", "        function renderDetail(value) {", detail_summary)
replace_once(
    web,
    "'<div class=\"import-summary\" aria-label=\"Resumo do lote\"><span>Pendentes <strong>' + summary.pending + '</strong></span><span>Aprovadas <strong>' + summary.approved + '</strong></span><span>Rejeitadas <strong>' + summary.rejected + '</strong></span><span>Lançamentos <strong>' + summary.transactions + '</strong></span><span>Problemas <strong>' + summary.problems + '</strong></span></div>' +",
    "'<div class=\"import-summary\" aria-label=\"Resumo do lote\"><span>Válidas <strong>' + summary.valid + '</strong></span><span>Pendentes <strong>' + summary.pending + '</strong></span><span>Bloqueadas <strong>' + summary.blocked + '</strong></span><span>Aprovadas <strong>' + summary.approved + '</strong></span><span>Conciliadas <strong>' + summary.reconciled + '</strong></span><span>Ignoradas como duplicadas <strong>' + summary.duplicates + '</strong></span><span>Rejeitadas <strong>' + summary.rejected + '</strong></span><span>Lançamentos vinculados <strong>' + summary.transactions + '</strong></span><span>Problemas <strong>' + summary.problems + '</strong></span></div>' +",
)

web_test = "apps/web/src/dev-server/inbox-csv-import.test.ts"
replace_once(
    web_test,
    "    assert.match(source, /Ver no Extrato/);\n    assert.match(source, /statementUrl/);",
    "    assert.match(source, /Ver no Extrato/);\n    assert.match(source, /Bloqueadas/);\n    assert.match(source, /Conciliadas/);\n    assert.match(source, /Ignoradas como duplicadas/);\n    assert.match(source, /Lançamentos vinculados/);\n    assert.match(source, /linha legada não possui dados estruturados/i);\n    assert.match(source, /statementUrl/);",
)

integration = "apps/api/src/csv-import-review.integration.test.ts"
replace_once(
    integration,
    "  await assertDeterministicReviewIsLinkedAndIdempotent(token, fixtures);\n  await assertDiscardLifecycleAndTenantIsolation(token, fixtures.account.id);",
    "  await assertDeterministicReviewIsLinkedAndIdempotent(token, fixtures);\n  await assertReconciliationDetailKeepsLinkedTransaction(token, fixtures);\n  await assertRejectedCandidatesReleaseNormalApproval(token, fixtures);\n  await assertLegacySuggestionWithoutPayloadIsListable(token, fixtures);\n  await assertDiscardLifecycleAndTenantIsolation(token, fixtures.account.id);",
)

marker = "async function assertDiscardLifecycleAndTenantIsolation(\n  token: string,\n  accountId: string,\n): Promise<void> {"
additions = r'''async function assertReconciliationDetailKeepsLinkedTransaction(
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
  assert.equal(
    reconciled.candidates?.find((item) => item.id === candidate.id)?.status,
    "approved",
  );

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
  const candidates = [
    ...scan.deduplicationSuggestions,
    ...scan.reconciliationSuggestions,
  ].filter((item) => item.payload.targetTransactionId === existing.id);
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

''' + marker
replace_once(integration, marker, additions)
replace_once(
    integration,
    '''interface ImportSuggestion {
  id: string;
  status: string;
  payload: ExtractionPayload;
  candidates?: Array<{ id: string; status: string }>;
}''',
    '''interface ImportSuggestion {
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
}''',
)

visual = ".github/workflows/statement-visual-validation.yml"
replace_once(
    visual,
    "          node scripts/statement-visual/sidebar-navigation.mjs",
    "          node scripts/statement-visual/sidebar-navigation.mjs\n          node scripts/statement-visual/inbox-csv-review.mjs",
)
