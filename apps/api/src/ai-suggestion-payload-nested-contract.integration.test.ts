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
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const profileRows = await query<{ organizationId: string }>(
    `select "organizationId" from "FinancialProfile" where "id" = $1`,
    [PERSONAL_PROFILE_ID],
  );
  const organizationId = profileRows[0]?.organizationId;
  assert.ok(organizationId, "Personal financial profile seed is required.");

  const validPayload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "system", component: "nested-contract-test" },
      target: { entityKind: "financial_profile" },
      confidence: 0.75,
      reasons: ["Fixture fictícia para validar o contrato aninhado."],
      audit: { createdAt: new Date().toISOString() },
      insightType: "summary",
      title: "Resumo fictício",
      summary: "Nenhum dado real é usado neste teste.",
      periodStartOn: "2026-07-01",
      periodEndOn: "2026-07-31",
      metric: { name: "total", value: 1, unit: "count" },
    },
  });

  const validId = randomUUID();
  await insertSuggestion(validId, organizationId, validPayload);
  try {
    const stored = await query<{ total: number }>(
      `select count(*)::int as total from "AiSuggestion" where "id" = $1`,
      [validId],
    );
    assert.equal(stored[0]?.total, 1);
  } finally {
    await query(`delete from "AiSuggestion" where "id" = $1`, [validId]);
  }

  const invalidCases = [
    addNestedField(validPayload, "origin", "rawPrompt", "sensitive-marker"),
    addNestedField(validPayload, "target", "bankMessage", "sensitive-marker"),
    addNestedField(validPayload, "audit", "providerResponse", "sensitive-marker"),
    addNestedField(validPayload, "metric", "rawValue", "sensitive-marker"),
  ];

  for (const payload of invalidCases) {
    const id = randomUUID();
    await assert.rejects(
      () => insertSuggestion(id, organizationId, payload),
      (error: unknown) => {
        const record = error as { code?: string; message?: string };
        assert.equal(record.code, "P0001");
        assert.equal(record.message, "AI_SUGGESTION_PAYLOAD_INVALID");
        assert.doesNotMatch(record.message ?? "", /sensitive-marker/);
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

function addNestedField(
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

async function insertSuggestion(
  id: string,
  organizationId: string,
  payload: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await query(
    `insert into "AiSuggestion"
      ("id", "organizationId", "financialProfileId", "kind", "status", "confidence", "explanation",
       "payload", "provider", "model", "createdAt", "updatedAt")
     values ($1, $2, $3, 'INSIGHT', 'PENDING_REVIEW', 0.75, 'Texto não autoritativo.',
             $4::jsonb, 'solverfin-rule', 'nested-contract-test', $5, $5)`,
    [id, organizationId, PERSONAL_PROFILE_ID, JSON.stringify(payload), now],
  );
}
