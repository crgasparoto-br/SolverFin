import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { FakeAiProvider } from "@solverfin/ai";
import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import { applyIntelligentCategorizationForContext } from "./intelligent-categorization-service.js";
import {
  listCategoryLearningForContext,
  recordCategoryCorrectionFromSuggestionForContext,
} from "./repositories/category-learning.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";
const USER_ID = "11111111-1111-4111-8111-111111111111";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests.",
  );
  const profiles = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profiles[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const categories = await query<{ id: string }>(
    `select "id" from "Category"
     where "organizationId" = $1 and "financialProfileId" = $2
       and lower("kind"::text) = 'expense' and lower("status"::text) = 'active'
     order by "createdAt" asc limit 1`,
    [organizationId, PERSONAL_PROFILE_ID],
  );
  const categoryId = categories[0]?.id;
  assert.ok(categoryId, "An active expense category seed is required.");

  const context = {
    organizationId,
    financialProfileId: PERSONAL_PROFILE_ID,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };
  const marker = randomUUID();
  const description = `Mercado ficticio issue 564 ${marker}`;
  const firstSourceId = randomUUID();
  const secondSourceId = randomUUID();
  const unavailableSourceId = randomUUID();
  const sourceIds = [firstSourceId, secondSourceId, unavailableSourceId];

  try {
    await insertExtractionSuggestion(
      context,
      firstSourceId,
      description,
      `source-a-${marker}`,
    );
    await insertExtractionSuggestion(
      context,
      secondSourceId,
      description,
      `source-b-${marker}`,
    );

    const firstLearning = await recordCategoryCorrectionFromSuggestionForContext(
      context,
      firstSourceId,
      categoryId,
      `issue-564-${marker}`,
    );
    const [concurrentLearningA, concurrentLearningB] = await Promise.all([
      recordCategoryCorrectionFromSuggestionForContext(
        context,
        firstSourceId,
        categoryId,
        `issue-564-${marker}`,
      ),
      recordCategoryCorrectionFromSuggestionForContext(
        context,
        firstSourceId,
        categoryId,
        `issue-564-${marker}`,
      ),
    ]);

    assert.equal(concurrentLearningA.id, firstLearning.id);
    assert.equal(concurrentLearningB.id, firstLearning.id);

    const provenanceRows = await query<{
      correctionCount: number;
      lastSourceSuggestionId: string | null;
      lastSourceFingerprint: string | null;
      sourcePayloadFingerprint: string | null;
    }>(
      `select l."correctionCount", l."lastSourceSuggestionId", l."lastSourceFingerprint",
              s."payloadFingerprint" as "sourcePayloadFingerprint"
       from "CategoryLearningEntry" l
       left join "AiSuggestion" s
         on s."id" = l."lastSourceSuggestionId"
        and s."organizationId" = l."organizationId"
        and s."financialProfileId" = l."financialProfileId"
       where l."id" = $1 and l."organizationId" = $2 and l."financialProfileId" = $3`,
      [firstLearning.id, organizationId, PERSONAL_PROFILE_ID],
    );
    assert.equal(
      provenanceRows[0]?.correctionCount,
      3,
      "concurrent corrections must converge on the same durable learning row",
    );
    assert.equal(provenanceRows[0]?.lastSourceSuggestionId, firstSourceId);
    assert.equal(
      provenanceRows[0]?.lastSourceFingerprint,
      provenanceRows[0]?.sourcePayloadFingerprint,
      "learning provenance must retain the source suggestion fingerprint",
    );

    const listed = await listCategoryLearningForContext(context, "active");
    const matching = listed.filter((entry) => entry.id === firstLearning.id);
    assert.equal(
      matching.length,
      1,
      "learning must be durable and tenant-scoped",
    );

    const [concurrentRunA, concurrentRunB] = await Promise.all([
      applyIntelligentCategorizationForContext(context, {
        selectProvider: () => disabledSelection(),
        resolveConsent: () => "granted",
        correlationId: `issue-564-${marker}`,
      }),
      applyIntelligentCategorizationForContext(context, {
        selectProvider: () => disabledSelection(),
        resolveConsent: () => "granted",
        correlationId: `issue-564-${marker}`,
      }),
    ]);
    assert.ok(
      concurrentRunA.created + concurrentRunB.created >= 2,
      "concurrent categorization should create the pending learning-backed candidates once",
    );

    const learnedRows = await query<{ provider: string; payload: unknown }>(
      `select "provider", "payload" from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
       order by "createdAt" desc`,
      [organizationId, PERSONAL_PROFILE_ID, secondSourceId],
    );
    assert.equal(
      learnedRows.length,
      1,
      "one categorization is expected for the source/version even under concurrency",
    );
    assert.equal(learnedRows[0]?.provider, "solverfin-learning");
    const learnedPayload = learnedRows[0]?.payload as
      | Record<string, unknown>
      | undefined;
    assert.equal(learnedPayload?.suggestionKind, "categorization");
    assert.equal(learnedPayload?.proposedCategoryId, categoryId);
    assert.equal(typeof learnedPayload?.fingerprint, "string");

    const secondRun = await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId: `issue-564-${marker}`,
    });
    assert.ok(
      secondRun.skippedIdempotent >= 2,
      "same source and version must be idempotent",
    );

    const repeatedRows = await query<{ count: string }>(
      `select count(*)::text as count from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'`,
      [organizationId, PERSONAL_PROFILE_ID, secondSourceId],
    );
    assert.equal(repeatedRows[0]?.count, "1");

    await insertExtractionSuggestion(
      context,
      unavailableSourceId,
      `Servico sem historico ${marker}`,
      `source-unavailable-${marker}`,
    );
    const unavailableRun = await applyIntelligentCategorizationForContext(
      context,
      {
        selectProvider: () => disabledSelection(),
        resolveConsent: () => "granted",
        correlationId: `issue-564-${marker}`,
      },
    );
    assert.ok(unavailableRun.created >= 1);

    const unavailableRows = await query<{
      provider: string;
      payload: unknown;
    }>(
      `select "provider", "payload" from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
       order by "createdAt" desc`,
      [organizationId, PERSONAL_PROFILE_ID, unavailableSourceId],
    );
    assert.equal(unavailableRows.length, 1);
    assert.equal(unavailableRows[0]?.provider, "solverfin-categorization");
    const unavailablePayload = unavailableRows[0]?.payload as
      | Record<string, unknown>
      | undefined;
    assert.equal(unavailablePayload?.proposedCategoryId, undefined);
    assert.equal(unavailablePayload?.proposedStatus, "pending_review");
  } finally {
    await query(
      `delete from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2 and "merchantKey" = $3`,
      [organizationId, PERSONAL_PROFILE_ID, description.toLowerCase()],
    );
    await query(
      `delete from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and ("id" = any($3::uuid[]) or "sourceSuggestionId" = any($3::uuid[]))`,
      [organizationId, PERSONAL_PROFILE_ID, sourceIds],
    );
    await query(
      `delete from "SecurityAuditEvent" where "correlationId" = $1`,
      [`issue-564-${marker}`],
    );
  }

  await testFakeProviderOutcomes(organizationId);
}

async function testFakeProviderOutcomes(organizationId: string): Promise<void> {
  const profileId = randomUUID();
  const categoryId = randomUUID();
  const validSourceId = randomUUID();
  const invalidSourceId = randomUUID();
  const lowConfidenceSourceId = randomUUID();
  const sourceIds = [validSourceId, invalidSourceId, lowConfidenceSourceId];
  const marker = randomUUID();
  const context = {
    organizationId,
    financialProfileId: profileId,
    financialProfileKind: "personal" as const,
    userId: USER_ID,
  };

  try {
    await query(
      `insert into "FinancialProfile"
        ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'PERSONAL', 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [profileId, organizationId, USER_ID, `Perfil IA ficticio ${marker}`],
    );
    await query(
      `insert into "Category"
        ("id", "organizationId", "financialProfileId", "name", "kind", "status", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
       values ($1, $2, $3, 'Categoria IA ficticia', 'EXPENSE', 'ACTIVE', $4, $4, clock_timestamp(), clock_timestamp())`,
      [categoryId, organizationId, profileId, USER_ID],
    );

    await insertExtractionSuggestion(
      context,
      validSourceId,
      `Servico IA valido ${marker}`,
      `provider-valid-${marker}`,
    );
    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => readySelection([providerResult("c1", 0.91)]),
      resolveConsent: () => "granted",
    });
    await assertCategorization(
      context,
      validSourceId,
      "fake",
      categoryId,
      undefined,
    );

    await insertExtractionSuggestion(
      context,
      invalidSourceId,
      `Servico IA invalido ${marker}`,
      `provider-invalid-${marker}`,
    );
    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () =>
        readySelection([
          providerResult("categoria-fora-da-lista", 0.91),
          providerResult("categoria-fora-da-lista", 0.91),
        ]),
      resolveConsent: () => "granted",
    });
    await assertCategorization(
      context,
      invalidSourceId,
      "solverfin-categorization",
      undefined,
      "pending_review",
    );

    await insertExtractionSuggestion(
      context,
      lowConfidenceSourceId,
      `Servico IA baixa confianca ${marker}`,
      `provider-low-${marker}`,
    );
    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => readySelection([providerResult("c1", 0.42)]),
      resolveConsent: () => "granted",
    });
    await assertCategorization(
      context,
      lowConfidenceSourceId,
      "fake",
      undefined,
      "pending_review",
    );
  } finally {
    await query(
      `delete from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and ("id" = any($3::uuid[]) or "sourceSuggestionId" = any($3::uuid[]))`,
      [organizationId, profileId, sourceIds],
    );
    await query(
      `delete from "Category" where "organizationId" = $1 and "financialProfileId" = $2`,
      [organizationId, profileId],
    );
    await query(
      `delete from "FinancialProfile" where "id" = $1 and "organizationId" = $2`,
      [profileId, organizationId],
    );
  }
}

async function assertCategorization(
  context: { organizationId: string; financialProfileId: string },
  sourceSuggestionId: string,
  expectedProvider: string,
  expectedCategoryId: string | undefined,
  expectedStatus: string | undefined,
): Promise<void> {
  const rows = await query<{ provider: string; payload: unknown }>(
    `select "provider", "payload" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
     order by "createdAt" desc`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.provider, expectedProvider);
  const payload = rows[0]?.payload as Record<string, unknown> | undefined;
  assert.equal(payload?.proposedCategoryId, expectedCategoryId);
  assert.equal(payload?.proposedStatus, expectedStatus);
}

async function insertExtractionSuggestion(
  context: {
    organizationId: string;
    financialProfileId: string;
  },
  id: string,
  description: string,
  sourceFingerprint: string,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "system", component: "issue-564-integration-test" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: ["Fixture ficticia para validar categorizacao."],
      audit: { createdAt: now, sourceFingerprint },
      sourceRowNumber: 1,
      sourceHash: sourceFingerprint,
      occurredOn: "2026-08-07",
      kind: "expense",
      direction: "outflow",
      amountMinor: 12345,
      currency: "BRL",
      description,
    },
  });

  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
       "confidence", "explanation", "payload", "payloadFingerprint", "provider", "model",
       "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
     values ($1, $2, $3, 'TRANSACTION_EXTRACTION', 'PENDING_REVIEW', null, null, 0.91,
             'Fixture ficticia da issue 564.', $4::jsonb, $5, 'solverfin-test', 'issue-564-v1',
             null, null, $6, $6)`,
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

function providerResult(proposedCategoryId: string, confidence: number) {
  return {
    text: "fixture ficticia",
    structured: { proposedCategoryId },
    confidence,
  };
}

function readySelection(responses: Parameters<typeof FakeAiProvider>[0]) {
  return { status: "ready", provider: new FakeAiProvider(responses) } as const;
}

function disabledSelection() {
  return { status: "disabled", provider: undefined } as const;
}
