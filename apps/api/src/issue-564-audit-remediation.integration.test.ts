import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import {
  handleCategorizationAwareImportBatchesApiRequest as handleImportRequest,
} from "./categorization-aware-import-router.js";
import { closePool, query } from "./db.js";
import { applyIntelligentCategorizationForContext } from "./intelligent-categorization-service.js";
import { handleMvpApiRequest } from "./mvp.js";
import {
  recordCategoryCorrectionFromSuggestionForContext as recordCorrection,
} from "./repositories/category-learning.js";
import { handleApiRequest, type ApiRequest, type ApiResponse } from "./router.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const USER_ID = "11111111-1111-4111-8111-111111111111";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const accountRows = await query<{ id: string }>(
    `select "id" from "Account"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "status" = 'ACTIVE'
     order by "createdAt" asc
     limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const accountId = accountRows[0]?.id;
  assert.ok(accountId, "An active account seed is required.");

  const token = await loginAndReadToken();
  const marker = randomUUID();
  const categoryA = randomUUID();
  const categoryB = randomUUID();
  const categoryC = randomUUID();
  const context = {
    organizationId,
    financialProfileId: PERSONAL_PROFILE_ID,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };

  try {
    await insertCategory(organizationId, categoryA, `Categoria A ${marker}`);
    await insertCategory(organizationId, categoryB, `Categoria B ${marker}`);

    await testImportCategoryNoop(token, accountId, categoryA, categoryB, marker);
    await testMerchantKeyBoundaries(context, categoryA, marker);
    await testSelectiveCategoryInvalidation(context, categoryA, categoryC, marker);
  } finally {
    await query(
      `delete from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "categoryId" = any($3::uuid[])`,
      [organizationId, PERSONAL_PROFILE_ID, [categoryA, categoryB, categoryC]],
    );
    await query(
      `delete from "Category"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "id" = any($3::uuid[])`,
      [organizationId, PERSONAL_PROFILE_ID, [categoryA, categoryB, categoryC]],
    );
  }
}

async function testImportCategoryNoop(
  token: string,
  accountId: string,
  categoryA: string,
  categoryB: string,
  marker: string,
): Promise<void> {
  const description = `Mercado noop issue 564 ${marker}`;
  const created = await apiRequest(token, "POST", "/api/import-batches/csv", {
    originalFileName: `issue-564-noop-${marker}.csv`,
    content: `date,description,amount\n2026-08-07,${description},-10.00`,
    accountId,
    consentAccepted: true,
  });
  assert.equal(created.statusCode, 201);

  const detail = readBody<{
    importBatch: { id: string };
    suggestions: Array<{ id: string; payload: { amountMinor: number } }>;
  }>(created);
  const batchId = detail.importBatch.id;
  const source = detail.suggestions[0];
  assert.ok(source);

  try {
    const firstCorrection = await apiRequest(
      token,
      "PATCH",
      `/api/import-batches/${batchId}/suggestions/${source.id}`,
      { categoryId: categoryA },
    );
    assert.equal(firstCorrection.statusCode, 200);

    const firstLearning = await readLearning(categoryA, source.id);
    assert.equal(firstLearning.correctionCount, 1);
    const firstProvenance = firstLearning.lastSourceFingerprint;
    assert.ok(firstProvenance);

    const sameCategoryEdit = await apiRequest(
      token,
      "PATCH",
      `/api/import-batches/${batchId}/suggestions/${source.id}`,
      { amountMinor: source.payload.amountMinor + 100, categoryId: categoryA },
    );
    assert.equal(sameCategoryEdit.statusCode, 200);

    const afterNoop = await readLearning(categoryA, source.id);
    assert.equal(afterNoop.correctionCount, 1, "Same category must not reinforce learning");
    assert.equal(
      afterNoop.lastSourceFingerprint,
      firstProvenance,
      "Same category must preserve learning provenance",
    );

    const changedCategory = await apiRequest(
      token,
      "PATCH",
      `/api/import-batches/${batchId}/suggestions/${source.id}`,
      { categoryId: categoryB },
    );
    assert.equal(changedCategory.statusCode, 200);

    const secondLearning = await readLearning(categoryB, source.id);
    assert.equal(secondLearning.correctionCount, 1);
    assert.notEqual(secondLearning.id, firstLearning.id);
  } finally {
    await cleanupSources([source.id]);
    await query(`delete from "ImportBatch" where "id" = $1`, [batchId]);
  }
}

async function testMerchantKeyBoundaries(
  context: TestContext,
  categoryId: string,
  marker: string,
): Promise<void> {
  const sourceIds: string[] = [];
  const entryIds: string[] = [];

  try {
    for (const length of [240, 241, 2048]) {
      const sourceId = randomUUID();
      sourceIds.push(sourceId);
      const description = boundaryDescription(length, marker);
      const sourceFingerprint = `boundary-${length}-${marker}`;
      await insertExtractionSuggestion(context, sourceId, description, sourceFingerprint);
      const entry = await recordCorrection(
        context,
        sourceId,
        categoryId,
        `issue-564-boundary-${marker}`,
      );
      entryIds.push(entry.id);

      const rows = await query<{ keyLength: number }>(
        `select char_length("merchantKey")::int as "keyLength"
         from "CategoryLearningEntry"
         where "id" = $1 and "organizationId" = $2
           and "financialProfileId" = $3`,
        [entry.id, context.organizationId, context.financialProfileId],
      );
      assert.equal(rows[0]?.keyLength, length, `merchantKey length ${length} must persist`);
    }
  } finally {
    if (entryIds.length > 0) {
      await query(`delete from "CategoryLearningEntry" where "id" = any($1::uuid[])`, [entryIds]);
    }
    await cleanupSources(sourceIds);
  }
}

async function testSelectiveCategoryInvalidation(
  context: TestContext,
  learnedCategoryId: string,
  unrelatedCategoryId: string,
  marker: string,
): Promise<void> {
  const description = `Mercado seletivo issue 564 ${marker}`;
  const correctionSourceId = randomUUID();
  const candidateSourceId = randomUUID();
  const sourceIds = [correctionSourceId, candidateSourceId];

  try {
    await insertExtractionSuggestion(
      context,
      correctionSourceId,
      description,
      `selective-correction-${marker}`,
      learnedCategoryId,
    );
    await recordCorrection(
      context,
      correctionSourceId,
      learnedCategoryId,
      `issue-564-selective-${marker}`,
    );
    await insertExtractionSuggestion(
      context,
      candidateSourceId,
      description,
      `selective-candidate-${marker}`,
    );

    await applyIntelligentCategorizationForContext(context, disabledRuntime());
    const initialRows = await readCategorizationRows(context, candidateSourceId);
    assert.equal(initialRows.length, 1);
    assert.equal(initialRows[0]?.status, "PENDING_REVIEW");
    assert.equal(initialRows[0]?.provider, "solverfin-learning");
    const initialModel = initialRows[0]?.model;
    assert.ok(initialModel);

    await insertCategory(
      context.organizationId,
      unrelatedCategoryId,
      `Categoria nao relacionada ${marker}`,
    );
    await applyIntelligentCategorizationForContext(context, disabledRuntime());

    const afterUnrelated = await readCategorizationRows(context, candidateSourceId);
    assert.equal(
      afterUnrelated.length,
      1,
      "Unrelated category must not invalidate a learning decision",
    );
    assert.equal(afterUnrelated[0]?.model, initialModel);

    await query(
      `update "Category"
       set "status" = 'ARCHIVED', "updatedAt" = clock_timestamp()
       where "id" = $1 and "organizationId" = $2
         and "financialProfileId" = $3`,
      [learnedCategoryId, context.organizationId, context.financialProfileId],
    );
    await applyIntelligentCategorizationForContext(context, disabledRuntime());

    const afterDependent = await readCategorizationRows(context, candidateSourceId);
    assert.equal(afterDependent.length, 2);
    assert.equal(countStatus(afterDependent, "PENDING_REVIEW"), 1);
    assert.equal(countStatus(afterDependent, "EXPIRED"), 1);
    assert.notEqual(
      afterDependent.find((row) => row.status === "PENDING_REVIEW")?.model,
      initialModel,
    );
    assert.equal(
      new Set(afterDependent.map((row) => row.payloadFingerprint)).size,
      2,
      "Decision versions must use distinct relational fingerprints",
    );
  } finally {
    await cleanupSources(sourceIds);
  }
}

async function insertCategory(
  organizationId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  await query(
    `insert into "Category"
      ("id", "organizationId", "financialProfileId", "name", "kind", "status",
       "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'EXPENSE', 'ACTIVE', $5, $5,
             clock_timestamp(), clock_timestamp())`,
    [categoryId, organizationId, PERSONAL_PROFILE_ID, name, USER_ID],
  );
}

async function insertExtractionSuggestion(
  context: Pick<TestContext, "organizationId" | "financialProfileId">,
  id: string,
  description: string,
  sourceFingerprint: string,
  categoryId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "system", component: "issue-564-audit-remediation-test" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: ["Fixture ficticia para remediacao da auditoria da issue 564."],
      audit: { createdAt: now, sourceFingerprint },
      sourceRowNumber: 1,
      sourceHash: sourceFingerprint,
      occurredOn: "2026-08-07",
      kind: "expense",
      direction: "outflow",
      amountMinor: 12345,
      currency: "BRL",
      description,
      ...(categoryId === undefined ? {} : { categoryId }),
    },
  });

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status",
       "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload",
       "payloadFingerprint", "provider", "model", "reviewedByUserId", "reviewedAt",
       "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null,
             0.91, 'Fixture ficticia da issue 564.', $4::jsonb, $5,
             'solverfin-test', 'issue-564-remediation-v1', null, null, $6, $6)`,
    [
      id,
      context.organizationId,
      context.financialProfileId,
      JSON.stringify(payload),
      payload.fingerprint,
      now,
    ],
  );
}

async function readLearning(categoryId: string, sourceSuggestionId: string): Promise<LearningRow> {
  const rows = await query<LearningRow>(
    `select "id", "correctionCount", "lastSourceFingerprint"
     from "CategoryLearningEntry"
     where "organizationId" = (
       select "organizationId" from "FinancialProfile" where "id" = $1
     ) and "financialProfileId" = $1 and "categoryId" = $2
       and "lastSourceSuggestionId" = $3
     order by "updatedAt" desc
     limit 1`,
    [PERSONAL_PROFILE_ID, categoryId, sourceSuggestionId],
  );
  const row = rows[0];
  assert.ok(row, "Expected category learning row");
  return row;
}

async function readCategorizationRows(
  context: Pick<TestContext, "organizationId" | "financialProfileId">,
  sourceSuggestionId: string,
): Promise<CategorizationRow[]> {
  return query<CategorizationRow>(
    `select "status"::text as "status", "model", "provider", "payloadFingerprint"
     from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId],
  );
}

async function cleanupSources(sourceIds: readonly string[]): Promise<void> {
  if (sourceIds.length === 0) return;
  await query(
    `delete from "CategoryLearningEntry"
     where "lastSourceSuggestionId" = any($1::uuid[])`,
    [sourceIds],
  );
  await query(
    `delete from "AiSuggestion"
     where "id" = any($1::uuid[])
        or "sourceSuggestionId" = any($1::uuid[])`,
    [sourceIds],
  );
  await query(
    `delete from "SecurityAuditEvent"
     where "metadata"->>'sourceSuggestionId' = any($1::text[])`,
    [sourceIds],
  );
}

function boundaryDescription(length: number, marker: string): string {
  const prefix = `b${length}-${marker}-`;
  assert.ok(prefix.length < length);
  return `${prefix}${"x".repeat(length - prefix.length)}`;
}

function disabledRuntime() {
  return {
    selectProvider: () => ({ status: "disabled", provider: undefined }) as const,
    resolveConsent: () => "granted" as const,
    correlationId: "issue-564-audit-remediation",
  };
}

function countStatus(rows: readonly CategorizationRow[], status: string): number {
  return rows.filter((row) => row.status === status).length;
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
  const response = (await handleImportRequest(request)) ?? (await handleApiRequest(request));
  assert.ok(response, `${method} ${path} should be handled`);
  return response;
}

function readBody<T>(response: Pick<ApiResponse, "body">): T {
  assert.equal(typeof response.body, "object");
  assert.notEqual(response.body, null);
  return response.body as T;
}

interface TestContext {
  organizationId: string;
  financialProfileId: string;
  financialProfileKind: "personal";
  userId: string;
}

interface LearningRow {
  id: string;
  correctionCount: number;
  lastSourceFingerprint: string | null;
}

interface CategorizationRow {
  status: string;
  model: string | null;
  provider: string | null;
  payloadFingerprint: string | null;
}
