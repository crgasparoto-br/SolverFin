import assert from "node:assert/strict";

import {
  AiSuggestionPayloadError,
  buildAiSuggestionPayload,
  readAiSuggestionPayload,
  requireCurrentAiSuggestionPayload,
  toPublicAiSuggestionPayload,
} from "./ai-suggestion-payloads.js";

const createdAt = "2026-08-11T12:00:00.000Z";

validatesVerifiableInsightV2();
publicProjectionScopesIdentifiers();
rejectsCurrencyMismatchAndUnknownFields();
detectsNumericEvidenceTampering();

function buildValidPayload() {
  return buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 2,
      origin: { kind: "rule", ruleId: "financial-insights-v2" },
      target: { entityKind: "financial_profile", entityId: "profile-1" },
      confidence: 0.95,
      reasons: ["Valores calculados deterministicamente."],
      audit: {
        createdAt,
        sourceFingerprint:
          "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      insightType: "trend",
      insightKind: "category_spending_increase",
      insightKey: "category_spending_increase:BRL:category-1:-",
      title: "Gasto maior na categoria Mercado",
      summary: "O gasto subiu em relação ao período comparável.",
      periodStartOn: "2026-08-01",
      periodEndOn: "2026-08-11",
      currency: "BRL",
      filters: { currency: "BRL", categoryId: "category-1" },
      evidence: [
        { label: "valor_atual", value: 16000, unit: "minor_currency", currency: "BRL" },
        {
          label: "valor_anterior_ou_planejado",
          value: 10000,
          unit: "minor_currency",
          currency: "BRL",
        },
        { label: "variacao_percentual", value: 60, unit: "percentage" },
      ],
      comparison: {
        kind: "previous_period",
        currentValue: 16000,
        previousValue: 10000,
        unit: "minor_currency",
        percentChange: 60,
        previousPeriodStartOn: "2026-07-01",
        previousPeriodEndOn: "2026-07-11",
      },
      limitations: ["Lançamentos pendentes de revisão foram excluídos."],
      calculationVersion: "financial-insights-v2",
      dataFingerprint: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      relatedEntityIds: ["11111111-1111-4111-8111-111111111111"],
      navigation: { view: "transactions", categoryId: "category-1" },
    },
  });
}

function validatesVerifiableInsightV2(): void {
  const payload = buildValidPayload();
  const read = readAiSuggestionPayload(payload, "insight");
  assert.equal(read.state, "current");
  assert.equal(payload.payloadVersion, 2);
  assert.equal(payload.insightKind, "category_spending_increase");
  assert.equal(payload.evidence[0]?.value, 16000);
  assert.match(payload.fingerprint, /^sha256-[a-f0-9]{64}$/);
}

function publicProjectionScopesIdentifiers(): void {
  const payload = buildValidPayload();
  const hidden = JSON.stringify(toPublicAiSuggestionPayload(payload));
  assert.doesNotMatch(hidden, /category-1|11111111-1111-4111-8111-111111111111|profile-1/);
  assert.match(hidden, /financial-insights-v2|16000|BRL/);

  const scoped = toPublicAiSuggestionPayload(payload, { includeScopedEntityIds: true });
  assert.equal(scoped.suggestionKind, "insight");
  if (scoped.suggestionKind !== "insight" || scoped.payloadVersion !== 2) {
    assert.fail("Expected public insight V2.");
  }
  assert.equal(scoped.proposal.filters.categoryId, "category-1");
  assert.equal(scoped.proposal.navigation?.categoryId, "category-1");
  assert.deepEqual(scoped.proposal.relatedEntityIds, ["11111111-1111-4111-8111-111111111111"]);
}

function rejectsCurrencyMismatchAndUnknownFields(): void {
  const payload = buildValidPayload();
  assert.throws(
    () =>
      requireCurrentAiSuggestionPayload(
        {
          ...payload,
          fingerprint: "pending",
          evidence: [
            { label: "valor_atual", value: 16000, unit: "minor_currency", currency: "USD" },
          ],
        },
        "insight",
      ),
    hasCode("AI_SUGGESTION_PAYLOAD_INVALID"),
  );
  assert.throws(
    () =>
      requireCurrentAiSuggestionPayload(
        { ...payload, fingerprint: "pending", rawFinancialText: "sensitive" },
        "insight",
      ),
    hasCode("AI_SUGGESTION_PAYLOAD_INVALID"),
  );
}

function detectsNumericEvidenceTampering(): void {
  const payload = buildValidPayload();
  assert.throws(
    () =>
      requireCurrentAiSuggestionPayload(
        {
          ...payload,
          evidence: payload.evidence.map((item, index) =>
            index === 0 ? { ...item, value: item.value + 1 } : item,
          ),
        },
        "insight",
      ),
    hasCode("AI_SUGGESTION_PAYLOAD_OBSOLETE"),
  );
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof AiSuggestionPayloadError && error.code === code;
}
