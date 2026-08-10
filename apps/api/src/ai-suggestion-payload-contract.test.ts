import assert from "node:assert/strict";

import { buildAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import {
  AiSuggestionPayloadApiError,
  mapAiSuggestionPayloadPersistenceError,
  resolveAiSuggestionPayloadForApi,
} from "./ai-suggestion-payload-contract.js";

const now = "2026-08-04T12:30:00.000Z";

returnsTypedPublicContractWithoutInternalFields();
migratesLegacyOnlyOnExplicitCompatibleMutation();
returnsControlledErrorsForMissingMismatchedAndUnexpectedPayloads();

function returnsTypedPublicContractWithoutInternalFields(): void {
  const payload = buildAiSuggestionPayload({
    payload: {
      contractVersion: 1,
      suggestionKind: "categorization",
      payloadVersion: 1,
      origin: {
        kind: "provider",
        provider: "private-provider",
        model: "private-model",
      },
      target: { entityKind: "transaction", entityId: "transaction-1" },
      confidence: 0.91,
      reasons: ["Correspondencia estruturada."],
      audit: { createdAt: now, correlationId: "private-correlation" },
      targetEntityId: "transaction-1",
      targetTransactionId: "transaction-1",
      proposedCategoryId: "category-1",
    },
  });
  const result = resolveAiSuggestionPayloadForApi({
    kind: "categorization",
    status: "pending_review",
    payload,
    origin: { kind: "system", component: "unused" },
    target: { entityKind: "transaction" },
    audit: { createdAt: now },
  });

  assert.equal(result.migratedFromLegacy, false);
  assert.equal(result.publicPayload.suggestionKind, "categorization");
  const serialized = JSON.stringify(result.publicPayload);
  assert.doesNotMatch(serialized, /private-provider|private-model|private-correlation/);
  assert.doesNotMatch(serialized, /transaction-1|category-1/);
}

function migratesLegacyOnlyOnExplicitCompatibleMutation(): void {
  const context = {
    kind: "transaction_extraction" as const,
    status: "pending_review" as const,
    payload: {
      payloadVersion: 2,
      sourceRowNumber: 4,
      sourceHash: "legacy-hash",
      occurredOn: "2026-08-04",
      kind: "expense",
      direction: "outflow",
      amountMinor: 4500,
      currency: "BRL",
      description: "Compra ficticia",
      accountId: "account-1",
    },
    origin: {
      kind: "import" as const,
      sourceKind: "csv" as const,
      sourceEntityId: "batch-1",
    },
    target: {
      entityKind: "import_suggestion" as const,
      entityId: "suggestion-1",
    },
    confidence: 1,
    audit: { createdAt: now },
  };

  assert.throws(
    () => resolveAiSuggestionPayloadForApi(context),
    hasCode("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED"),
  );
  const migrated = resolveAiSuggestionPayloadForApi(context, {
    migrateLegacyOnCompatibleMutation: true,
    includeScopedEntityIds: true,
  });
  assert.equal(migrated.migratedFromLegacy, true);
  assert.equal(migrated.payload.contractVersion, 1);
  assert.equal("entityId" in migrated.publicPayload.target, false);
}

function returnsControlledErrorsForMissingMismatchedAndUnexpectedPayloads(): void {
  assert.throws(
    () =>
      resolveAiSuggestionPayloadForApi({
        kind: "insight",
        status: "pending_review",
        payload: null,
        origin: { kind: "system", component: "test" },
        target: { entityKind: "period" },
        audit: { createdAt: now },
      }),
    hasCode("AI_SUGGESTION_PAYLOAD_MISSING"),
  );

  const databaseError = mapAiSuggestionPayloadPersistenceError({
    code: "P0001",
    message: "AI_SUGGESTION_PAYLOAD_CONFLICT: internal detail",
  });
  assert.equal(databaseError.code, "AI_SUGGESTION_PAYLOAD_CONFLICT");
  assert.doesNotMatch(databaseError.message, /internal detail/);

  const unexpected = mapAiSuggestionPayloadPersistenceError({
    code: "P0001",
    message:
      "fingerprint=secret idempotencyKey=secret amountMinor=999999 SQL select * from private",
  });
  assert.equal(unexpected.code, "API_UNEXPECTED_ERROR");
  assert.equal(unexpected.statusCode, 500);
  assert.doesNotMatch(unexpected.message, /fingerprint|idempotencyKey|999999|SQL|private/);
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof AiSuggestionPayloadApiError && error.code === code;
}
