import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
    await insertExtractionSuggestion(context, firstSourceId, description, `source-a-${marker}`);
    await insertExtractionSuggestion(context, secondSourceId, description, `source-b-${marker}`);

    const firstLearning = await recordCategoryCorrectionFromSuggestionForContext(
      context,
      firstSourceId,
      categoryId,
      `issue-564-${marker}`,
    );
    const repeatedLearning = await recordCategoryCorrectionFromSuggestionForContext(
      context,
      firstSourceId,
      categoryId,
      `issue-564-${marker}`,
    );

    assert.equal(repeatedLearning.id, firstLearning.id);
    assert.equal(repeatedLearning.correctionCount, firstLearning.correctionCount + 1);

    const listed = await listCategoryLearningForContext(context, "active");
    const matching = listed.filter((entry) => entry.id === firstLearning.id);
    assert.equal(matching.length, 1, "learning must be durable and tenant-scoped");

    const firstRun = await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId: `issue-564-${marker}`,
    });
    assert.ok(firstRun.created >= 2, "learning should create reviewable categorizations");

    const learnedRows = await query<{ provider: string; payload: unknown }>(
      `select "provider", "payload" from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
       order by "createdAt" desc`,
      [organizationId, PERSONAL_PROFILE_ID, secondSourceId],
    );
    assert.equal(learnedRows.length, 1, "one categorization is expected for the source/version");
    assert.equal(learnedRows[0]?.provider, "solverfin-learning");
    const learnedPayload = learnedRows[0]?.payload as Record<string, unknown> | undefined;
    assert.equal(learnedPayload?.suggestionKind, "categorization");
    assert.equal(learnedPayload?.proposedCategoryId, categoryId);
    assert.equal(typeof learnedPayload?.fingerprint, "string");

    const secondRun = await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId: `issue-564-${marker}`,
    });
    assert.ok(secondRun.skippedIdempotent >= 2, "same source and version must be idempotent");

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
    const unavailableRun = await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId: `issue-564-${marker}`,
    });
    assert.ok(unavailableRun.created >= 1);

    const unavailableRows = await query<{ provider: string; payload: unknown }>(
      `select "provider", "payload" from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
       order by "createdAt" desc`,
      [organizationId, PERSONAL_PROFILE_ID, unavailableSourceId],
    );
    assert.equal(unavailableRows.length, 1);
    assert.equal(unavailableRows[0]?.provider, "solverfin-categorization");
    const unavailablePayload = unavailableRows[0]?.payload as Record<string, unknown> | undefined;
    assert.equal(unavailablePayload?.proposedCategoryId, undefined);
    assert.equal(unavailablePayload?.proposedStatus, "pending_review");
  } finally {
    await query(
      `delete from "AiSuggestion"
       where "organizationId" = $1 and "financialProfileId" = $2
         and ("id" = any($3::uuid[]) or "sourceSuggestionId" = any($3::uuid[]))`,
      [organizationId, PERSONAL_PROFILE_ID, sourceIds],
    );
    await query(
      `delete from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2 and "merchantKey" = $3`,
      [organizationId, PERSONAL_PROFILE_ID, description.toLowerCase()],
    );
    await query(`delete from "SecurityAuditEvent" where "correlationId" = $1`, [
      `issue-564-${marker}`,
    ]);
  }
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

function disabledSelection() {
  return {
    status: "disabled",
    health: {
      status: "disabled",
      providerId: "disabled",
      model: "disabled",
      issues: ["Provider disabled for deterministic integration test."],
    },
  } as never;
}
