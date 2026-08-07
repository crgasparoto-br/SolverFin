import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";
import { applyIntelligentCategorizationForContext } from "./intelligent-categorization-service.js";
import { recordCategoryCorrectionFromSuggestionForContext } from "./repositories/category-learning.js";

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
  const alphaDescription = `Mercado alfa issue 564 ${marker}`;
  const betaDescription = `Padaria beta issue 564 ${marker}`;
  const alphaCorrectionSourceId = randomUUID();
  const alphaCandidateSourceId = randomUUID();
  const betaCorrectionSourceId = randomUUID();
  const sourceIds = [alphaCorrectionSourceId, alphaCandidateSourceId, betaCorrectionSourceId];
  const correlationId = `issue-564-selective-${marker}`;

  try {
    await insertExtractionSuggestion(
      context,
      alphaCorrectionSourceId,
      alphaDescription,
      `alpha-correction-${marker}`,
    );
    await insertExtractionSuggestion(
      context,
      alphaCandidateSourceId,
      alphaDescription,
      `alpha-candidate-${marker}`,
    );
    await recordCategoryCorrectionFromSuggestionForContext(
      context,
      alphaCorrectionSourceId,
      categoryId,
      correlationId,
    );

    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId,
    });
    const initialAlphaRows = await listCategorizationRows(context, alphaCandidateSourceId);
    assert.equal(initialAlphaRows.length, 1);
    assert.equal(initialAlphaRows[0]?.status, "PENDING_REVIEW");
    const initialExecutionKey = initialAlphaRows[0]?.model;
    assert.ok(initialExecutionKey);

    await insertExtractionSuggestion(
      context,
      betaCorrectionSourceId,
      betaDescription,
      `beta-correction-${marker}`,
    );
    await recordCategoryCorrectionFromSuggestionForContext(
      context,
      betaCorrectionSourceId,
      categoryId,
      correlationId,
    );
    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId,
    });

    const afterUnrelatedRows = await listCategorizationRows(context, alphaCandidateSourceId);
    assert.equal(afterUnrelatedRows.length, 1);
    assert.equal(afterUnrelatedRows[0]?.status, "PENDING_REVIEW");
    assert.equal(afterUnrelatedRows[0]?.model, initialExecutionKey);

    await recordCategoryCorrectionFromSuggestionForContext(
      context,
      alphaCorrectionSourceId,
      categoryId,
      correlationId,
    );
    await applyIntelligentCategorizationForContext(context, {
      selectProvider: () => disabledSelection(),
      resolveConsent: () => "granted",
      correlationId,
    });

    const afterRelatedRows = await listCategorizationRows(context, alphaCandidateSourceId);
    assert.equal(afterRelatedRows.length, 2);
    const pendingRows = afterRelatedRows.filter((row) => row.status === "PENDING_REVIEW");
    const expiredRows = afterRelatedRows.filter((row) => row.status === "EXPIRED");
    assert.equal(pendingRows.length, 1);
    assert.equal(expiredRows.length, 1);
    assert.notEqual(pendingRows[0]?.model, initialExecutionKey);
  } finally {
    await query(
      `delete from "CategoryLearningEntry"
       where "organizationId" = $1 and "financialProfileId" = $2
         and "merchantKey" = any($3::text[])`,
      [
        organizationId,
        PERSONAL_PROFILE_ID,
        [alphaDescription.toLowerCase(), betaDescription.toLowerCase()],
      ],
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

async function listCategorizationRows(
  context: { organizationId: string; financialProfileId: string },
  sourceSuggestionId: string,
): Promise<Array<{ status: string; model: string | null }>> {
  return query<{ status: string; model: string | null }>(
    `select "status"::text as status, "model"
     from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "sourceSuggestionId" = $3 and "kind" = 'CATEGORIZATION'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId, sourceSuggestionId],
  );
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
      origin: { kind: "system", component: "issue-564-selective-invalidation-test" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: ["Fixture ficticia para validar invalidacao seletiva."],
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
             'Fixture ficticia da issue 564.', $4::jsonb, $5, 'solverfin-test', 'issue-564-selective-v1',
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
  return { status: "disabled", provider: undefined } as const;
}
