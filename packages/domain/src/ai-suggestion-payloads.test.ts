import assert from "node:assert/strict";

import {
  AiSuggestionPayloadError,
  assertAiSuggestionPayloadSourceCurrent,
  buildAiSuggestionPayload,
  migrateLegacyAiSuggestionPayload,
  mutateAiSuggestionPayload,
  readAiSuggestionPayload,
  requireCurrentAiSuggestionPayload,
  toPublicAiSuggestionPayload,
  type AiSuggestionPayload,
} from "./ai-suggestion-payloads.js";

const now = "2026-08-04T12:30:00.000Z";

validatesEverySupportedKind();
readsLegacyPayloadsWithoutReinterpretation();
migratesLegacyOnlyWhilePending();
rejectsMissingInvalidMismatchedAndObsoletePayloads();
recomputesFingerprintAndDetectsConcurrentMutation();
rejectsStaleSourceAndResolvedMutation();
publicProjectionDoesNotLeakInternalIdentifiersByDefault();
rejectsRawAndUnknownSensitiveFields();

function validatesEverySupportedKind(): void {
  const payloads: AiSuggestionPayload[] = [
    buildAiSuggestionPayload({
      payload: {
        contractVersion: 1,
        suggestionKind: "transaction_extraction",
        payloadVersion: 2,
        origin: {
          kind: "import",
          sourceKind: "csv",
          sourceEntityId: "batch-1",
        },
        target: {
          entityKind: "import_suggestion",
          entityId: "suggestion-1",
        },
        confidence: 0.95,
        reasons: ["Linha estruturada validada."],
        audit: { createdAt: now, sourceFingerprint: "source-v1" },
        sourceRowNumber: 2,
        sourceHash: "row-hash",
        occurredOn: "2026-08-04",
        kind: "expense",
        direction: "outflow",
        amountMinor: 1299,
        currency: "BRL",
        description: "Compra ficticia",
        accountId: "account-1",
        categoryId: "category-1",
      },
    }),
    buildAiSuggestionPayload({
      payload: {
        contractVersion: 1,
        suggestionKind: "categorization",
        payloadVersion: 1,
        origin: { kind: "rule", ruleId: "rule-1" },
        target: { entityKind: "transaction", entityId: "transaction-1" },
        confidence: 0.8,
        reasons: ["Descricao compativel com a regra."],
        audit: { createdAt: now },
        targetEntityId: "transaction-1",
        targetTransactionId: "transaction-1",
        proposedCategoryId: "category-1",
      },
    }),
    buildAiSuggestionPayload({
      payload: {
        contractVersion: 1,
        suggestionKind: "deduplication",
        payloadVersion: 1,
        origin: { kind: "system", component: "deduplication-v2" },
        target: { entityKind: "transaction", entityId: "transaction-1" },
        confidence: 0.88,
        reasons: ["Valor e data coincidem."],
        audit: { createdAt: now, sourceFingerprint: "source-v1" },
        sourceSuggestionId: "source-1",
        sourcePayloadFingerprint: "source-v1",
        targetTransactionId: "transaction-1",
        conflicts: [],
      },
    }),
    buildAiSuggestionPayload({
      payload: {
        contractVersion: 1,
        suggestionKind: "reconciliation",
        payloadVersion: 1,
        origin: { kind: "system", component: "reconciliation-v2" },
        target: { entityKind: "transaction", entityId: "transaction-1" },
        confidence: 0.76,
        reasons: ["Conta e valor coincidem."],
        audit: { createdAt: now, sourceFingerprint: "source-v1" },
        sourceSuggestionId: "source-1",
        sourcePayloadFingerprint: "source-v1",
        targetTransactionId: "transaction-1",
        conflicts: ["Data difere em um dia."],
      },
    }),
    buildAiSuggestionPayload({
      payload: {
        contractVersion: 1,
        suggestionKind: "insight",
        payloadVersion: 1,
        origin: {
          kind: "provider",
          provider: "fake-provider",
          model: "fake-model",
        },
        target: { entityKind: "period" },
        confidence: 0.72,
        reasons: ["Variacao calculada sobre dados autorizados."],
        audit: { createdAt: now },
        insightType: "trend",
        title: "Despesas recorrentes cresceram",
        summary: "A soma ficticia aumentou no periodo analisado.",
        periodStartOn: "2026-07-01",
        periodEndOn: "2026-07-31",
        metric: {
          name: "expense_change",
          value: 12.5,
          unit: "percentage",
        },
      },
    }),
  ];

  assert.deepEqual(
    payloads.map(
      (payload) =>
        requireCurrentAiSuggestionPayload(payload, payload.suggestionKind).suggestionKind,
    ),
    ["transaction_extraction", "categorization", "deduplication", "reconciliation", "insight"],
  );
}

function readsLegacyPayloadsWithoutReinterpretation(): void {
  const transaction = {
    payloadVersion: 2,
    sourceRowNumber: 2,
    sourceHash: "legacy-row",
    occurredOn: "2026-08-04",
    kind: "expense",
    direction: "outflow",
    amountMinor: 1000,
    currency: "BRL",
    description: "Legado ficticio",
    accountId: "account-1",
  };
  const deterministic = {
    payloadVersion: 1,
    sourceSuggestionId: "source-1",
    sourcePayloadFingerprint: "source-v1",
    targetTransactionId: "transaction-1",
    reasons: ["Mesmo valor."],
    conflicts: [],
  };

  assert.equal(readAiSuggestionPayload(transaction, "transaction_extraction").state, "legacy");
  assert.equal(readAiSuggestionPayload(deterministic, "deduplication").state, "legacy");
  assert.equal(readAiSuggestionPayload(deterministic, "reconciliation").state, "legacy");
  assert.equal(readAiSuggestionPayload(transaction, "categorization").state, "invalid");
}

function migratesLegacyOnlyWhilePending(): void {
  const migrated = migrateLegacyAiSuggestionPayload({
    expectedKind: "transaction_extraction",
    status: "pending_review",
    legacyPayload: {
      payloadVersion: 1,
      sourceRowNumber: 7,
      sourceHash: "legacy-v1",
      occurredOn: "2026-08-03",
      kind: "income",
      amountMinor: 5000,
      currency: "BRL",
      description: "Receita ficticia",
      accountId: "account-1",
    },
    origin: {
      kind: "import",
      sourceKind: "ofx",
      sourceEntityId: "batch-1",
    },
    target: {
      entityKind: "import_suggestion",
      entityId: "suggestion-1",
    },
    confidence: 1,
    audit: { createdAt: now },
  });

  assert.equal(migrated.contractVersion, 1);
  assert.equal(migrated.suggestionKind, "transaction_extraction");
  assert.throws(
    () =>
      migrateLegacyAiSuggestionPayload({
        expectedKind: "transaction_extraction",
        status: "approved",
        legacyPayload: migrated,
        origin: { kind: "system", component: "test" },
        target: { entityKind: "transaction" },
        audit: { createdAt: now },
      }),
    hasCode("AI_SUGGESTION_PAYLOAD_IMMUTABLE"),
  );
}

function rejectsMissingInvalidMismatchedAndObsoletePayloads(): void {
  assert.throws(
    () => requireCurrentAiSuggestionPayload(undefined, "insight"),
    hasCode("AI_SUGGESTION_PAYLOAD_MISSING"),
  );
  assert.equal(readAiSuggestionPayload({ payloadVersion: 999 }, "insight").state, "invalid");
  assert.throws(
    () =>
      buildAiSuggestionPayload({
        payload: {
          contractVersion: 1,
          suggestionKind: "insight",
          payloadVersion: 1,
          origin: { kind: "system", component: "invalid-date-test" },
          target: { entityKind: "period" },
          reasons: ["Data impossivel deve ser recusada."],
          audit: { createdAt: now },
          insightType: "summary",
          title: "Resumo invalido",
          summary: "Resumo ficticio.",
          periodStartOn: "2026-02-31",
          periodEndOn: "2026-03-01",
        },
      }),
    hasCode("AI_SUGGESTION_PAYLOAD_INVALID"),
  );

  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "rule" },
      target: { entityKind: "transaction", entityId: "transaction-1" },
      reasons: ["Regra ficticia."],
      audit: { createdAt: now },
      targetEntityId: "transaction-1",
      targetTransactionId: "transaction-1",
      proposedCategoryId: "category-1",
    },
  });

  assert.throws(
    () => requireCurrentAiSuggestionPayload(payload, "insight"),
    hasCode("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH"),
  );
  assert.throws(
    () =>
      requireCurrentAiSuggestionPayload(
        { ...payload, proposedCategoryId: "category-2" },
        "categorization",
      ),
    hasCode("AI_SUGGESTION_PAYLOAD_OBSOLETE"),
  );
}

function recomputesFingerprintAndDetectsConcurrentMutation(): void {
  const original = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: { kind: "rule", ruleId: "rule-1" },
      target: { entityKind: "transaction", entityId: "transaction-1" },
      reasons: ["Regra ficticia."],
      audit: { createdAt: now },
      targetEntityId: "transaction-1",
      targetTransactionId: "transaction-1",
      proposedCategoryId: "category-1",
    },
  });
  const changed = mutateAiSuggestionPayload({
    payload: original,
    status: "pending_review",
    expectedFingerprint: original.fingerprint,
    audit: { createdAt: now, correlationId: "correlation-2" },
    mutation: (draft) => ({ ...draft, proposedCategoryId: "category-2" }),
  });

  assert.notEqual(changed.fingerprint, original.fingerprint);
  assert.throws(
    () =>
      mutateAiSuggestionPayload({
        payload: changed,
        status: "pending_review",
        expectedFingerprint: original.fingerprint,
        audit: { createdAt: now },
        mutation: (draft) => draft,
      }),
    hasCode("AI_SUGGESTION_PAYLOAD_CONFLICT"),
  );
}

function rejectsStaleSourceAndResolvedMutation(): void {
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "deduplication",
      payloadVersion: 1,
      origin: { kind: "system", component: "deduplication-v2" },
      target: { entityKind: "transaction", entityId: "transaction-1" },
      reasons: ["Valor coincidente."],
      audit: { createdAt: now, sourceFingerprint: "source-v1" },
      sourceSuggestionId: "source-1",
      sourcePayloadFingerprint: "source-v1",
      targetTransactionId: "transaction-1",
      conflicts: [],
    },
  });

  assert.throws(
    () => assertAiSuggestionPayloadSourceCurrent(payload, "source-v2"),
    hasCode("AI_SUGGESTION_PAYLOAD_OBSOLETE"),
  );
  assert.throws(
    () =>
      requireCurrentAiSuggestionPayload(
        {
          ...payload,
          audit: { ...payload.audit, sourceFingerprint: "source-v2" },
        },
        "deduplication",
      ),
    hasCode("AI_SUGGESTION_PAYLOAD_OBSOLETE"),
  );
  assert.throws(
    () =>
      mutateAiSuggestionPayload({
        payload,
        status: "approved",
        expectedFingerprint: payload.fingerprint,
        audit: { createdAt: now },
        mutation: (draft) => draft,
      }),
    hasCode("AI_SUGGESTION_PAYLOAD_IMMUTABLE"),
  );
}

function publicProjectionDoesNotLeakInternalIdentifiersByDefault(): void {
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "transaction_extraction",
      payloadVersion: 2,
      origin: {
        kind: "provider",
        provider: "internal-provider",
        model: "internal-model",
      },
      target: { entityKind: "transaction", entityId: "transaction-secret" },
      confidence: 0.9,
      reasons: ["Extracao estruturada."],
      audit: { createdAt: now, correlationId: "secret-correlation" },
      sourceRowNumber: 1,
      sourceHash: "secret-source-hash",
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: 2500,
      currency: "BRL",
      description: "Descricao ficticia",
      accountId: "account-secret",
      categoryId: "category-secret",
    },
  });

  const publicPayload = JSON.stringify(toPublicAiSuggestionPayload(payload));
  assert.doesNotMatch(publicPayload, /internal-provider|internal-model|secret-correlation/);
  assert.doesNotMatch(
    publicPayload,
    /transaction-secret|account-secret|category-secret|secret-source-hash/,
  );
  assert.match(publicPayload, /transaction_extraction/);
}

function rejectsRawAndUnknownSensitiveFields(): void {
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "insight",
      payloadVersion: 1,
      origin: { kind: "system", component: "insight-test" },
      target: { entityKind: "period" },
      reasons: ["Dados agregados."],
      audit: { createdAt: now },
      insightType: "summary",
      title: "Resumo ficticio",
      summary: "Resumo calculado.",
      periodStartOn: "2026-07-01",
      periodEndOn: "2026-07-31",
    },
  });
  const injected = {
    ...payload,
    rawPrompt: "segredo",
    bankMessage: "texto bruto",
  };
  injected.fingerprint = payload.fingerprint;
  assert.throws(
    () => requireCurrentAiSuggestionPayload(injected, "insight"),
    hasCode("AI_SUGGESTION_PAYLOAD_INVALID"),
  );
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof AiSuggestionPayloadError && error.code === code;
}
