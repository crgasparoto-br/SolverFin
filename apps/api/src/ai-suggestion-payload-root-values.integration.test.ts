import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for root payload value integration tests.",
  );
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const now = "2026-08-05T01:15:00.000Z";
  const transaction = buildTransactionPayload(now);
  const categorization = buildCategorizationPayload(now);
  const insight = buildInsightPayload(now);

  const validCases = [transaction, categorization, insight];
  for (const payload of validCases) {
    const id = randomUUID();
    try {
      await insertSuggestion(id, organizationId, payload.suggestionKind, payload);
      const rows = await query<{ total: number }>(
        `select count(*)::int as total from "AiSuggestion" where "id" = $1`,
        [id],
      );
      assert.equal(rows[0]?.total, 1);
    } finally {
      await query(`delete from "AiSuggestion" where "id" = $1`, [id]);
    }
  }

  const invalidCases: Array<{ kind: string; payload: unknown }> = [
    { kind: "transaction_extraction", payload: replace(transaction, "contractVersion", "1") },
    { kind: "transaction_extraction", payload: replace(transaction, "payloadVersion", "2") },
    { kind: "transaction_extraction", payload: replace(transaction, "confidence", "0.9") },
    { kind: "transaction_extraction", payload: replace(transaction, "sourceRowNumber", 0) },
    { kind: "transaction_extraction", payload: replace(transaction, "amountMinor", -1) },
    { kind: "transaction_extraction", payload: replace(transaction, "amountMinor", "1299") },
    { kind: "transaction_extraction", payload: replace(transaction, "occurredOn", "2026-02-30") },
    { kind: "transaction_extraction", payload: replace(transaction, "currency", "brl") },
    { kind: "transaction_extraction", payload: replace(transaction, "kind", "refund") },
    { kind: "transaction_extraction", payload: replace(transaction, "direction", "sideways") },
    { kind: "categorization", payload: replace(categorization, "proposedStatus", "UNKNOWN") },
    { kind: "categorization", payload: replace(categorization, "proposedCategoryId", null) },
    {
      kind: "categorization",
      payload: replace(categorization, "sourceSuggestionId", randomUUID()),
    },
    { kind: "insight", payload: replace(insight, "periodStartOn", "2026-02-30") },
    { kind: "insight", payload: replace(insight, "insightType", "forecast") },
  ];

  for (const invalid of invalidCases) {
    const id = randomUUID();
    await assert.rejects(
      () => insertSuggestion(id, organizationId, invalid.kind, invalid.payload),
      (error: unknown) => {
        const record = error as { code?: string; message?: string };
        assert.equal(record.code, "P0001");
        assert.equal(record.message, "AI_SUGGESTION_PAYLOAD_INVALID");
        return true;
      },
    );
    const rows = await query<{ total: number }>(
      `select count(*)::int as total from "AiSuggestion" where "id" = $1`,
      [id],
    );
    assert.equal(rows[0]?.total, 0);
  }
}

function buildTransactionPayload(now: string) {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: { kind: "provider", provider: "root-values-test" },
      target: { entityKind: "transaction" },
      confidence: 0.91,
      reasons: ["Fixture ficticia para validar escalares financeiros."],
      audit: { createdAt: now },
      sourceRowNumber: 1,
      sourceHash: "root-values-source",
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: 1299,
      currency: "BRL",
      description: "Compra ficticia",
    },
  });
}

function buildCategorizationPayload(now: string) {
  const targetEntityId = randomUUID();
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "automation", ruleId: "root-values-rule" },
      target: { entityKind: "transaction", entityId: targetEntityId },
      confidence: 0.9,
      reasons: ["Fixture ficticia para validar categorizacao direta."],
      audit: { createdAt: now },
      targetEntityId,
      proposedCategoryId: "category-fixture",
      proposedStatus: "posted",
    },
  });
}

function buildInsightPayload(now: string) {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "system", component: "root-values-test" },
      target: { entityKind: "period" },
      confidence: 0.8,
      reasons: ["Fixture ficticia para validar periodo."],
      audit: { createdAt: now },
      insightType: "summary",
      title: "Resumo ficticio",
      summary: "Nenhum dado real e usado neste teste.",
      periodStartOn: "2026-07-01",
      periodEndOn: "2026-07-31",
    },
  });
}

function replace(source: unknown, field: string, value: unknown): unknown {
  const payload = structuredClone(source) as Record<string, unknown>;
  payload[field] = value;
  return payload;
}

async function insertSuggestion(
  id: string,
  organizationId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence",
       "explanation", "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'PENDING_REVIEW', 0.9,
             'Texto nao autoritativo.', $5::jsonb, 'root-values-test',
             'root-values-v1', $6, $6)`,
    [
      id,
      organizationId,
      PERSONAL_PROFILE_ID,
      kind.toUpperCase(),
      JSON.stringify(payload),
      now,
    ],
  );
}
