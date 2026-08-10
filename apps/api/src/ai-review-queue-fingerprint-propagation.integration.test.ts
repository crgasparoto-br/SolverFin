import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { handleCategorizationAwareAiReviewQueueApiRequest } from "./categorization-aware-ai-review-router.js";
import { closePool, query } from "./db.js";
import {
  handleDeduplicationReconciliationApiRequest as handleDeterministicRequest,
} from "./deduplication-reconciliation-router.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { handleMvpApiRequest } from "./mvp.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

// F29-AI-FP-001: a payload mutation must propagate the current source fingerprint
// through persistence into freshly generated deterministic decisions.
// F22-AI-FP-001: the migration repair must converge stale pending rows to the
// same fingerprint that the runtime trigger would persist.
const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const organizationId = await readOrganizationId();
  const token = await loginAndReadToken();
  const suffix = randomUUID();
  const fixtures = await createFixtures(token, suffix);

  await assertFingerprintPropagation({
    token,
    organizationId,
    fixtures,
    suffix,
    kind: "deduplication",
    amountMinor: 3344,
    occurredOn: "2026-08-09",
    description: `Mercado 🧾 São Paulo ${suffix}`,
    expectedSourceStatus: "rejected",
  });
  await assertFingerprintPropagation({
    token,
    organizationId,
    fixtures,
    suffix,
    kind: "reconciliation",
    amountMinor: 4455,
    occurredOn: "2026-08-10",
    description: `Café ☕ revisão ${suffix}`,
    expectedSourceStatus: "approved",
  });
  await assertPendingBackfillRepair(token, organizationId, fixtures.accountId, suffix);
  await assertGeneralExtractionMutationSync(
    token,
    organizationId,
    fixtures.accountId,
    suffix,
  );
}

async function readOrganizationId(): Promise<string> {
  const rows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = rows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");
  return organizationId;
}

async function createFixtures(token: string, suffix: string): Promise<Fixtures> {
  const accountResponse = await apiRequest(token, "POST", "/api/accounts", {
    name: `Conta fingerprint propagation ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  assert.equal(accountResponse.statusCode, 201);
  const account = readBody<AccountResponse>(accountResponse).account;

  const categoryResponse = await apiRequest(token, "POST", "/api/categories", {
    name: `Categoria fingerprint propagation ${suffix}`,
    kind: "expense",
  });
  assert.equal(categoryResponse.statusCode, 201);
  const category = readBody<CategoryResponse>(categoryResponse).category;

  return { accountId: account.id, categoryId: category.id };
}

async function assertFingerprintPropagation(input: ScenarioInput): Promise<void> {
  const correlationId = `issue-565-fingerprint-${input.kind}-${input.suffix}`;
  const existing = await createTransaction(input.token, input.fixtures, input);
  const imported = await createImportSuggestion(input.token, input.fixtures.accountId, input);
  const source = requireSuggestion(imported, 0);
  const sourceDetail = await readPayloadDetail(input.token, source.id, correlationId);
  assert.equal(sourceDetail.suggestionKind, "transaction_extraction");

  const before = await readSourceVersion(input.organizationId, source.id);
  assert.ok(
    before?.payloadFingerprint,
    "Import source must persist its deterministic fingerprint.",
  );
  assert.equal(before?.categoryId, null);

  const categorization = await insertCategorizationSuggestion({
    organizationId: input.organizationId,
    sourceSuggestionId: source.id,
    sourceFingerprint: sourceDetail.fingerprint,
    categoryId: input.fixtures.categoryId,
    marker: `${input.kind}-${input.suffix}`,
  });
  const categorized = await apiRequest(
    input.token,
    "POST",
    `/api/ai-review-queue/${categorization.id}/approve`,
    { expectedFingerprint: categorization.fingerprint },
    correlationId,
  );
  assert.equal(categorized.statusCode, 200);

  const after = await readSourceVersion(input.organizationId, source.id);
  assert.equal(after?.categoryId, input.fixtures.categoryId);
  assert.ok(after?.payloadFingerprint);
  assert.notEqual(
    after?.payloadFingerprint,
    before?.payloadFingerprint,
    "Changing a source field covered by the import fingerprint must update payloadFingerprint.",
  );

  const scan = await apiRequest(
    input.token,
    "POST",
    `/api/import-batches/${imported.importBatch.id}/detect-duplicates`,
    undefined,
    correlationId,
  );
  assert.equal(scan.statusCode, 200);
  const scanBody = readBody<ScanBody>(scan);
  const candidates =
    input.kind === "deduplication"
      ? scanBody.deduplicationSuggestions
      : scanBody.reconciliationSuggestions;
  const candidate = candidates.find((item) => item.payload.targetTransactionId === existing.id);
  assert.ok(candidate, `Expected ${input.kind} candidate after source categorization.`);

  const storedCandidate = await readDeterministicSourceFingerprint(
    input.organizationId,
    candidate.id,
  );
  assert.equal(
    storedCandidate,
    after?.payloadFingerprint,
    "The candidate and its source must persist the same source version fingerprint.",
  );

  const candidateDetail = await readPayloadDetail(input.token, candidate.id, correlationId);
  assert.equal(candidateDetail.suggestionKind, input.kind);
  const approved = await apiRequest(
    input.token,
    "POST",
    `/api/ai-review-queue/${candidate.id}/approve`,
    { expectedFingerprint: candidateDetail.fingerprint },
    correlationId,
  );
  assert.equal(
    approved.statusCode,
    200,
    `A freshly regenerated ${input.kind} candidate must not be rejected as obsolete.`,
  );
  const approvedBody = readBody<DecisionBody>(approved);
  assert.equal(approvedBody.suggestion.status, "approved");
  assert.equal(approvedBody.sourceSuggestion?.status, input.expectedSourceStatus);

  if (input.kind === "reconciliation") {
    assert.equal(approvedBody.transaction?.id, existing.id);
    assert.equal(approvedBody.transaction?.status, "reconciled");
  } else {
    assert.equal(approvedBody.transaction, undefined);
  }
}

async function assertPendingBackfillRepair(
  token: string,
  organizationId: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const imported = await createImportSuggestion(token, accountId, {
    kind: "deduplication",
    suffix: `repair-${suffix}`,
    amountMinor: 5566,
    occurredOn: "2026-08-08",
    description: `Padaria 🥐 reparo ${suffix}`,
  });
  const source = requireSuggestion(imported, 0);
  const before = await readSourceVersion(organizationId, source.id);
  assert.ok(before?.payloadFingerprint);

  await query(
    `update "AiSuggestion" set "payloadFingerprint" = 'fnv1a-00000000'
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [source.id, organizationId, PERSONAL_PROFILE_ID],
  );
  const stale = await readSourceVersion(organizationId, source.id);
  assert.equal(stale?.payloadFingerprint, "fnv1a-00000000");

  const repairRows = await query<{ repaired: number }>(
    `select "repairPendingAiSuggestionPayloadFingerprints"() as "repaired"`,
  );
  assert.ok(Number(repairRows[0]?.repaired ?? 0) >= 1);

  const repaired = await readSourceVersion(organizationId, source.id);
  assert.equal(repaired?.payloadFingerprint, before?.payloadFingerprint);
}

async function assertGeneralExtractionMutationSync(
  token: string,
  organizationId: string,
  accountId: string,
  suffix: string,
): Promise<void> {
  const suggestionId = randomUUID();
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "system", component: "issue-565-fingerprint-propagation-test" },
      target: { entityKind: "transaction" },
      confidence: 0.93,
      reasons: ["Controle irmão para mutações gerais da fila."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: `issue-565-general-${suffix}`,
      occurredOn: "2026-08-10",
      kind: "expense",
      direction: "outflow",
      amountMinor: 6677,
      currency: "BRL",
      description: `Compra geral ${suffix}`,
      accountId,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence",
       "explanation", "payload", "payloadFingerprint", "provider", "model",
       "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', 0.93,
             'Controle irmao da issue 565.', $4::jsonb, $5,
             'solverfin-test', 'issue-565-fingerprint-propagation', $6, $6)`,
    [
      suggestionId,
      organizationId,
      PERSONAL_PROFILE_ID,
      JSON.stringify(payload),
      payload.fingerprint,
      now,
    ],
  );

  const edited = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${suggestionId}/edit`,
    {
      expectedFingerprint: payload.fingerprint,
      payload: { description: `Compra geral editada ${suffix}` },
    },
    `issue-565-general-edit-${suffix}`,
  );
  assert.equal(edited.statusCode, 200);
  const editedVersion = await readCanonicalVersion(organizationId, suggestionId);
  assert.ok(editedVersion?.fingerprint);
  assert.notEqual(editedVersion?.fingerprint, payload.fingerprint);
  assert.equal(editedVersion?.payloadFingerprint, editedVersion?.fingerprint);

  const approved = await apiRequest(
    token,
    "POST",
    `/api/ai-review-queue/${suggestionId}/approve`,
    {
      expectedFingerprint: editedVersion?.fingerprint,
      payloadOverride: { amountMinor: 7788 },
    },
    `issue-565-general-approve-${suffix}`,
  );
  assert.equal(approved.statusCode, 200);
  const approvedVersion = await readCanonicalVersion(organizationId, suggestionId);
  assert.ok(approvedVersion?.fingerprint);
  assert.notEqual(approvedVersion?.fingerprint, editedVersion?.fingerprint);
  assert.equal(approvedVersion?.payloadFingerprint, approvedVersion?.fingerprint);
}

async function readCanonicalVersion(
  organizationId: string,
  suggestionId: string,
): Promise<CanonicalVersionRow | undefined> {
  const rows = await query<CanonicalVersionRow>(
    `select "payloadFingerprint",
            "payload"->>'fingerprint' as "fingerprint"
       from "AiSuggestion"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestionId, organizationId, PERSONAL_PROFILE_ID],
  );
  return rows[0];
}

async function createTransaction(
  token: string,
  fixtures: Fixtures,
  input: Pick<ScenarioInput, "description" | "amountMinor" | "occurredOn">,
): Promise<{ id: string }> {
  const response = await apiRequest(token, "POST", "/api/transactions", {
    kind: "expense",
    amountMinor: input.amountMinor,
    occurredOn: input.occurredOn,
    accountId: fixtures.accountId,
    categoryId: fixtures.categoryId,
    description: input.description,
  });
  assert.equal(response.statusCode, 201);
  return readBody<TransactionResponse>(response).transaction;
}

async function createImportSuggestion(
  token: string,
  accountId: string,
  input: Pick<ScenarioInput, "description" | "amountMinor" | "occurredOn" | "kind" | "suffix">,
): Promise<ImportDetail> {
  const amount = (input.amountMinor / 100).toFixed(2);
  const row = `${input.occurredOn},${input.description},-${amount},expense`;
  const response = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `issue-565-fingerprint-${input.kind}-${input.suffix}.csv`,
    content: ["date,description,amount,kind", row].join("\n"),
    accountId,
    consentAccepted: true,
  });
  assert.equal(response.statusCode, 201);
  return readBody<ImportDetail>(response);
}

async function insertCategorizationSuggestion(input: {
  organizationId: string;
  sourceSuggestionId: string;
  sourceFingerprint: string;
  categoryId: string;
  marker: string;
}): Promise<{ id: string; fingerprint: string }> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "system", component: "issue-565-fingerprint-propagation-test" },
      target: { entityKind: "import_suggestion", entityId: input.sourceSuggestionId },
      confidence: 0.99,
      reasons: [`Correcao controlada da issue 565 ${input.marker}.`],
      audit: { createdAt: now, sourceFingerprint: input.sourceFingerprint },
      targetEntityId: input.sourceSuggestionId,
      sourceSuggestionId: input.sourceSuggestionId,
      proposedCategoryId: input.categoryId,
    },
  });
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId",
       "targetEntityId", "confidence", "explanation", "payload", "sourceSuggestionId",
       "payloadFingerprint", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'CATEGORIZATION', 'PENDING_REVIEW', $4, $4,
             0.99, 'Correcao controlada da issue 565.', $5::jsonb, $4, $6,
             'solverfin-test', 'issue-565-fingerprint-propagation', null, null, $7, $7)`,
    [
      id,
      input.organizationId,
      PERSONAL_PROFILE_ID,
      input.sourceSuggestionId,
      JSON.stringify(payload),
      input.sourceFingerprint,
      now,
    ],
  );
  return { id, fingerprint: payload.fingerprint };
}

async function readSourceVersion(
  organizationId: string,
  suggestionId: string,
): Promise<SourceVersionRow | undefined> {
  const rows = await query<SourceVersionRow>(
    `select "payloadFingerprint",
            "payload"->>'categoryId' as "categoryId"
       from "AiSuggestion"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestionId, organizationId, PERSONAL_PROFILE_ID],
  );
  return rows[0];
}

async function readDeterministicSourceFingerprint(
  organizationId: string,
  suggestionId: string,
): Promise<string | null | undefined> {
  const rows = await query<{ sourcePayloadFingerprint: string | null }>(
    `select "payload"->>'sourcePayloadFingerprint' as "sourcePayloadFingerprint"
       from "AiSuggestion"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestionId, organizationId, PERSONAL_PROFILE_ID],
  );
  return rows[0]?.sourcePayloadFingerprint;
}

async function readPayloadDetail(
  token: string,
  suggestionId: string,
  correlationId: string,
): Promise<PayloadDetail> {
  const response = await apiRequest(
    token,
    "GET",
    `/api/ai-review-queue/${suggestionId}/payload`,
    undefined,
    correlationId,
  );
  assert.equal(response.statusCode, 200);
  return readBody<PayloadResponse>(response).payload;
}

async function loginAndReadToken(): Promise<string> {
  const response = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(response.statusCode, 201);
  return readBody<SessionResponse>(response).session.token;
}

async function apiRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  correlationId?: string,
): Promise<ApiResponse> {
  const url = new URL(path, "http://solverfin.integration.test");
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (correlationId !== undefined) headers["x-correlation-id"] = correlationId;
  const request: ApiRequest = {
    method,
    pathname: url.pathname,
    query: url.searchParams,
    headers,
    body,
  };
  const response =
    (await handleImportBatchesApiRequest(request)) ??
    (await handleDeterministicRequest(request)) ??
    (await handleCategorizationAwareAiReviewQueueApiRequest(request)) ??
    (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled`);
  return response;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

function requireSuggestion(detail: ImportDetail, index: number): ImportSuggestion {
  const suggestion = detail.suggestions[index];
  assert.ok(suggestion, `Expected import suggestion at index ${index}`);
  return suggestion;
}

type ReviewKind = "deduplication" | "reconciliation";

interface Fixtures {
  accountId: string;
  categoryId: string;
}

interface ScenarioInput {
  token: string;
  organizationId: string;
  fixtures: Fixtures;
  suffix: string;
  kind: ReviewKind;
  amountMinor: number;
  occurredOn: string;
  description: string;
  expectedSourceStatus: "approved" | "rejected";
}

interface SourceVersionRow {
  payloadFingerprint: string | null;
  categoryId: string | null;
}

interface CanonicalVersionRow {
  payloadFingerprint: string | null;
  fingerprint: string | null;
}

interface ImportDetail {
  importBatch: { id: string };
  suggestions: ImportSuggestion[];
}

interface ImportSuggestion {
  id: string;
}

interface DeterministicSuggestion {
  id: string;
  payload: { targetTransactionId?: string };
}

interface ScanBody {
  deduplicationSuggestions: DeterministicSuggestion[];
  reconciliationSuggestions: DeterministicSuggestion[];
}

interface PayloadDetail {
  suggestionKind: string;
  fingerprint: string;
}

interface DecisionBody {
  suggestion: { status: string };
  sourceSuggestion?: { status: string };
  transaction?: { id: string; status: string };
}

interface AccountResponse {
  account: { id: string };
}

interface CategoryResponse {
  category: { id: string };
}

interface TransactionResponse {
  transaction: { id: string };
}

interface PayloadResponse {
  payload: PayloadDetail;
}

interface SessionResponse {
  session: { token: string };
}
