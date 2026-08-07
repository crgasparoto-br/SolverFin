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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const profiles = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profiles[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  await testLearningPersistenceAndConcurrency(organizationId);
  await testFakeProviderOutcomes(organizationId);
}

async function testLearningPersistenceAndConcurrency(organizationId: string): Promise<void> {
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
  const correlationId = `issue-564-${marker}`;

  try {
    await insertExtractionSuggestion(context, firstSourceId, description, `source-a-${marker}`);
    await insertExtractionSuggestion(context, secondSourceId, description, `source-b-${marker}`);

    const firstLearning = await recordCategoryCorrectionFromSuggestionForContext(
      context,
      firstSourceId,
      categoryId,
      correlationId,
    );
    const [concurrentLearningA, concurrentLearningB] = await Promise.all([
      recordCategoryCorrectionFromSuggestionForContext(
        context,
        firstSourceId,
        categoryId,
        correlationId,
      ),
      recordCategoryCorrectionFromSuggestionForContext(
        context,
        firstSourceId,
        categoryId,
        correlationId,
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
    assert.equal(provenanceRows[0]?.correctionCount, 3);
    assert.equal(provenanceRows[0]?.lastSourceSuggestionId, firstSourceId);
    assert.equal(
      provenanceRows[0]?.lastSourceFingerprint,
      provenanceRows[0]?.sourcePayloadFingerprint,
    );

    const listed = await listCategoryLearningForContext(context, "active");
    assert.equal(listed.filter((entry) => entry.id === firstLearning.id).length, 1);

    const [concurrentRunA, concurrentRunB] = await Promise.all([
      applyIntelligentCategorizationForContext(context, {
        selectProvider: () => disabledSelection(),
        resolveConsent: () => "granted",
        correlationId,
      }),
      applyIntelligentCategorizationForContext(context, {
        selectProvider: () => disabledSelection(),
        resolveConsent: () => "granted",
        correlationId,
      }),
    ]);
    assert.ok(concurrentRunA.created + concurrentRunB.created >= 2);

    await assertCategorization(
      context,
      secondSourceId,
      "solverfin-learning",
      categoryId,
      undefined,
    );
    const repeatedRows = await query<{ count: string }>(
      `select count(*)::text as count from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'`,
      [organizationId, PERSONAL_PROFILE_ID, secondSourceId],
    );
    assert.equal(repeatedRows[0]?.count, "1");

    const secondRun = await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId,
    });
    assert.ok(secondRun.skippedIdempotent >= 2);

    await insertExtractionSuggestion(
      context,
      unavailableSourceId,
      `Servico sem historico ${marker}`,
      `source-unavailable-${marker}`,
    );
    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId,
    });
    await assertCategorization(
      context,
      unavailableSourceId,
      "solverfin-categorization",
      undefined,
      "pending_review",
    );
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
    await query(`delete from "SecurityAuditEvent" where "correlationId" = $1`, [correlationId]);
  }
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
    await assertCategorization(context, validSourceId, "fake", categoryId, undefined);

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
    await assertCategorization(context, lowConfidenceSourceId, "fake", undefined, "pending_review");
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
    await query(`delete from "FinancialProfile" where "id" = $1 and "organizationId" = $2`, [
      profileId,
      organizationId,
    ]);
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
  assert.equal(typeof payload?.fingerprint, "string");
}

async function insertExtractionSuggestion(
  context: { organizationId: string; financialProfileId: string },
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
    structured: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      proposedCategoryId,
      reasons: ["Fixture ficticia de classificacao."],
    },
    confidence,
  };
}

function readySelection(responses: ConstructorParameters<typeof FakeAiProvider>[0]) {
  return { status: "ready", provider: new FakeAiProvider(responses) } as const;
}

function disabledSelection() {
  return { status: "disabled", provider: undefined } as const;
}
