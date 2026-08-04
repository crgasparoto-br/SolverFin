import assert from "node:assert/strict";

import {
  AiSuggestionPayloadViewError,
  parseAiSuggestionPayloadResponse,
} from "./ai-suggestion-payload-contract.js";

parsesStableTypedResponse();
parsesEveryDiscriminatedProposal();
rejectsUnexpectedInternalFieldsAndMalformedResponses();
rejectsV2OnlyFieldsFromV1TransactionPayload();

function parsesStableTypedResponse(): void {
  const parsed = parseAiSuggestionPayloadResponse({
    suggestionId: "suggestion-1",
    legacyProjection: false,
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "provider" },
      fingerprint: `sha256-${"a".repeat(64)}`,
      confidence: 0.8,
      reasons: ["Dados agregados."],
      target: { entityKind: "period" },
      proposal: {
        insightType: "summary",
        title: "Resumo ficticio",
        summary: "Dados calculados.",
        periodStartOn: "2026-07-01",
        periodEndOn: "2026-07-31",
      },
    },
  });

  assert.equal(parsed.suggestionId, "suggestion-1");
  assert.equal(parsed.legacyProjection, false);
  assert.equal(parsed.kind, "insight");
  assert.equal(parsed.versionLabel, "v1.1");
  assert.equal(parsed.confidence, 0.8);
}

function parsesEveryDiscriminatedProposal(): void {
  const fingerprint = `sha256-${"b".repeat(64)}`;
  const common = {
    contractVersion: 1,
    origin: { kind: "system" },
    fingerprint,
    reasons: ["Fixture ficticia."],
  };
  const payloads = [
    {
      ...common,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      target: { entityKind: "transaction" },
      proposal: {
        occurredOn: "2026-08-04",
        kind: "expense",
        direction: "outflow",
        amountMinor: 1000,
        currency: "BRL",
        description: "Compra ficticia",
      },
    },
    {
      ...common,
      suggestionKind: "categorization",
      payloadVersion: 1,
      target: { entityKind: "transaction" },
      proposal: { proposedStatus: "posted" },
    },
    {
      ...common,
      suggestionKind: "deduplication",
      payloadVersion: 1,
      target: { entityKind: "transaction" },
      proposal: { conflicts: [] },
    },
    {
      ...common,
      suggestionKind: "reconciliation",
      payloadVersion: 1,
      target: { entityKind: "transaction" },
      proposal: { conflicts: ["Data divergente."] },
    },
    {
      ...common,
      suggestionKind: "insight",
      payloadVersion: 1,
      target: { entityKind: "period" },
      proposal: {
        insightType: "trend",
        title: "Tendencia ficticia",
        summary: "Dados agregados.",
        periodStartOn: "2026-07-01",
        periodEndOn: "2026-07-31",
      },
    },
  ];

  assert.deepEqual(
    payloads.map(
      (payload, index) =>
        parseAiSuggestionPayloadResponse({
          suggestionId: `suggestion-${index + 1}`,
          legacyProjection: false,
          payload,
        }).kind,
    ),
    ["transaction_extraction", "categorization", "deduplication", "reconciliation", "insight"],
  );
}

function rejectsUnexpectedInternalFieldsAndMalformedResponses(): void {
  assert.throws(
    () =>
      parseAiSuggestionPayloadResponse({
        suggestionId: "suggestion-private",
        legacyProjection: false,
        payload: {
          contractVersion: 1,
          suggestionKind: "categorization",
          payloadVersion: 1,
          origin: { kind: "rule", ruleId: "must-not-be-public" },
          fingerprint: "fp",
          reasons: [],
          target: { entityKind: "transaction" },
          proposal: {},
          rawPrompt: "must-not-be-public",
        },
      }),
    (error: unknown) => error instanceof AiSuggestionPayloadViewError,
  );
  assert.throws(
    () =>
      parseAiSuggestionPayloadResponse({
        suggestionId: "suggestion-unknown",
        legacyProjection: false,
        payload: { suggestionKind: "unknown" },
      }),
    (error: unknown) => error instanceof AiSuggestionPayloadViewError,
  );
}

function rejectsV2OnlyFieldsFromV1TransactionPayload(): void {
  assert.throws(
    () =>
      parseAiSuggestionPayloadResponse({
        suggestionId: "suggestion-v1",
        legacyProjection: false,
        payload: {
          contractVersion: 1,
          suggestionKind: "transaction_extraction",
          payloadVersion: 1,
          origin: { kind: "import" },
          fingerprint: `sha256-${"c".repeat(64)}`,
          reasons: [],
          target: { entityKind: "transaction" },
          proposal: {
            occurredOn: "2026-08-04",
            kind: "expense",
            amountMinor: 1000,
            currency: "BRL",
            description: "Compra ficticia",
            otherAccountId: "account-v2-only",
          },
        },
      }),
    (error: unknown) => error instanceof AiSuggestionPayloadViewError,
  );
}
