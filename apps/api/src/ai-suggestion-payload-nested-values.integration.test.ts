import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { closePool, query } from "./db.js";

const PERSONAL_PROFILE_ID = "33333333-3333-4333-8333-333333333331";

type InvalidPayloadCase = {
  kind:
    | "TRANSACTION_EXTRACTION"
    | "CATEGORIZATION"
    | "DEDUPLICATION"
    | "RECONCILIATION"
    | "INSIGHT";
  payload: unknown;
};

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

  const validInsightPayload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "import", sourceKind: "csv" },
      target: { entityKind: "financial_profile" },
      confidence: 0.75,
      reasons: ["Fixture fictícia para validar valores aninhados."],
      audit: { createdAt: "2026-08-04T19:30:00.000Z" },
      insightType: "summary",
      title: "Resumo fictício",
      summary: "Nenhum dado real é usado neste teste.",
      periodStartOn: "2026-07-01",
      periodEndOn: "2026-07-31",
      metric: { name: "total", value: 1, unit: "count" },
    },
  });

  const invalidCases: InvalidPayloadCase[] = [
    {
      kind: "INSIGHT",
      payload: mutateNested(validInsightPayload, "origin", "sourceKind", "spreadsheet"),
    },
    {
      kind: "INSIGHT",
      payload: mutateNested(validInsightPayload, "target", "entityKind", "bank_message"),
    },
    {
      kind: "INSIGHT",
      payload: mutateNested(validInsightPayload, "audit", "createdAt", "not-a-date"),
    },
    {
      kind: "INSIGHT",
      payload: mutateNested(validInsightPayload, "metric", "unit", "money"),
    },
    {
      kind: "INSIGHT",
      payload: mutateNested(validInsightPayload, "metric", "value", "1"),
    },
    {
      kind: "INSIGHT",
      payload: { ...structuredClone(validInsightPayload), reasons: [""] },
    },
    ...buildKindSpecificInvalidCases(validInsightPayload),
  ];

  for (const invalidCase of invalidCases) {
    const id = randomUUID();
    await assert.rejects(
      () => insertSuggestion(id, organizationId, invalidCase.kind, invalidCase.payload),
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

  const offsetPayload = buildAiSuggestionPayload({
    payload: {
      ...validInsightPayload,
      audit: { createdAt: "2026-08-04T16:30:00-03:00" },
    },
  });
  const offsetSuggestionId = randomUUID();

  try {
    await insertSuggestion(offsetSuggestionId, organizationId, "INSIGHT", offsetPayload);

    const rows = await query<{ total: number }>(
      `select count(*)::int as total from "AiSuggestion" where "id" = $1`,
      [offsetSuggestionId],
    );
    assert.equal(rows[0]?.total, 1);

    await assert.rejects(
      () =>
        query(
          `update "AiSuggestion"
              set "status" = 'EDITED', "payload" = "payload", "updatedAt" = now()
            where "id" = $1`,
          [offsetSuggestionId],
        ),
      (error: unknown) => {
        const record = error as { code?: string; message?: string };
        assert.equal(record.code, "P0001");
        assert.equal(record.message, "AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
        return true;
      },
    );
  } finally {
    await query(`delete from "AiSuggestion" where "id" = $1`, [offsetSuggestionId]);
  }
}

function buildKindSpecificInvalidCases(validInsightPayload: unknown): InvalidPayloadCase[] {
  const transactionV1 = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 1,
      origin: { kind: "provider", provider: "kind-values-test" },
      target: { entityKind: "transaction" },
      confidence: 0.8,
      reasons: ["Fixture fictícia para validar extração."],
      audit: { createdAt: "2026-08-04T19:30:00.000Z" },
      sourceRowNumber: 1,
      sourceHash: "kind-values-source",
      occurredOn: "2026-08-04",
      kind: "expense",
      amountMinor: 1234,
      currency: "BRL",
      description: "Compra fictícia",
    },
  });
  const categorization = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "automation" },
      target: { entityKind: "transaction" },
      confidence: 0.8,
      reasons: ["Fixture fictícia para validar categorização."],
      audit: { createdAt: "2026-08-04T19:30:00.000Z" },
      targetEntityId: randomUUID(),
      proposedStatus: "posted",
    },
  });
  const deduplication = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "deduplication",
      payloadVersion: 1,
      origin: { kind: "system", component: "kind-values-test" },
      target: { entityKind: "transaction" },
      confidence: 0.8,
      reasons: ["Fixture fictícia para validar deduplicação."],
      audit: { createdAt: "2026-08-04T19:30:00.000Z" },
      sourceSuggestionId: randomUUID(),
      sourcePayloadFingerprint: `sha256-${"a".repeat(64)}`,
      targetTransactionId: randomUUID(),
      conflicts: [],
    },
  });
  const reconciliation = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "reconciliation",
      payloadVersion: 1,
      origin: { kind: "system", component: "kind-values-test" },
      target: { entityKind: "transaction" },
      confidence: 0.8,
      reasons: ["Fixture fictícia para validar conciliação."],
      audit: { createdAt: "2026-08-04T19:30:00.000Z" },
      sourceSuggestionId: randomUUID(),
      sourcePayloadFingerprint: `sha256-${"b".repeat(64)}`,
      targetTransactionId: randomUUID(),
      conflicts: [],
    },
  });

  return [
    {
      kind: "TRANSACTION_EXTRACTION",
      payload: { ...structuredClone(transactionV1), direction: "outflow" },
    },
    {
      kind: "TRANSACTION_EXTRACTION",
      payload: mutateRoot(transactionV1, "amountMinor", 0),
    },
    {
      kind: "CATEGORIZATION",
      payload: mutateRoot(categorization, "proposedStatus", "archived"),
    },
    {
      kind: "DEDUPLICATION",
      payload: mutateRoot(deduplication, "sourcePayloadFingerprint", ""),
    },
    {
      kind: "RECONCILIATION",
      payload: mutateRoot(reconciliation, "targetTransactionId", ""),
    },
    {
      kind: "INSIGHT",
      payload: mutateRoot(validInsightPayload, "insightType", "forecast"),
    },
    {
      kind: "INSIGHT",
      payload: mutateRoot(validInsightPayload, "periodStartOn", "2026-02-30"),
    },
    {
      kind: "INSIGHT",
      payload: mutateRoot(validInsightPayload, "confidence", "0.75"),
    },
    {
      kind: "INSIGHT",
      payload: mutateRoot(validInsightPayload, "contractVersion", "1"),
    },
    {
      kind: "INSIGHT",
      payload: mutateRoot(validInsightPayload, "payloadVersion", "1"),
    },
  ];
}

function mutateNested(
  source: unknown,
  objectKey: "origin" | "target" | "audit" | "metric",
  field: string,
  value: unknown,
): unknown {
  const payload = structuredClone(source) as Record<string, unknown>;
  const nested = payload[objectKey] as Record<string, unknown>;
  nested[field] = value;
  return payload;
}

function mutateRoot(source: unknown, field: string, value: unknown): unknown {
  const payload = structuredClone(source) as Record<string, unknown>;
  payload[field] = value;
  return payload;
}

async function insertSuggestion(
  id: string,
  organizationId: string,
  kind: InvalidPayloadCase["kind"],
  payload: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
       "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, 'PENDING_REVIEW', 0.75, 'Texto não autoritativo.',
             $5::jsonb, 'solverfin-rule', 'nested-values-test', $6, $6)`,
    [id, organizationId, PERSONAL_PROFILE_ID, kind, JSON.stringify(payload), now],
  );
}
