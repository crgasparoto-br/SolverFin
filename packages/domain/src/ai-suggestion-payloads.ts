import { createHash } from "node:crypto";

import {
  AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION,
  AiSuggestionPayloadError,
  type AiSuggestionPayload,
  type AiSuggestionPayloadAudit,
  type AiSuggestionPayloadDraft,
  type AiSuggestionPayloadKind,
  type AiSuggestionPayloadOrigin,
  type AiSuggestionPayloadReadResult,
  type AiSuggestionPayloadStatus,
  type AiSuggestionPayloadTarget,
  type LegacyAiSuggestionPayload,
} from "./ai-suggestion-payload-types.js";
import {
  canonicalJson,
  expectRecord,
  isLegacyDeterministicReviewPayload,
  isLegacyTransactionExtractionPayload,
  isRecord,
  parseCurrentByKind,
  parseLegacyAiSuggestionPayload,
  parseSuggestionKind,
  validateCommonFields,
} from "./ai-suggestion-payload-internals.js";

export * from "./ai-suggestion-payload-types.js";
export * from "./ai-suggestion-payload-public.js";

type BuiltAiSuggestionPayload<TDraft extends AiSuggestionPayloadDraft> = TDraft extends {
  suggestionKind: infer TKind;
  payloadVersion: infer TVersion;
}
  ? Extract<AiSuggestionPayload, { suggestionKind: TKind; payloadVersion: TVersion }>
  : never;

export function buildAiSuggestionPayload<TDraft extends AiSuggestionPayloadDraft>(input: {
  payload: TDraft;
}): BuiltAiSuggestionPayload<TDraft> {
  const payload = {
    ...input.payload,
    fingerprint: input.payload.fingerprint ?? "pending",
  } as AiSuggestionPayload;
  payload.fingerprint = buildAiSuggestionPayloadFingerprint(payload);
  return validateAiSuggestionPayload(
    payload,
    payload.suggestionKind,
  ) as BuiltAiSuggestionPayload<TDraft>;
}

export function readAiSuggestionPayload(
  value: unknown,
  expectedKind: AiSuggestionPayloadKind,
): AiSuggestionPayloadReadResult {
  if (value === undefined || value === null) return { state: "missing" };

  try {
    if (isRecord(value) && "contractVersion" in value) {
      return {
        state: "current",
        payload: validateAiSuggestionPayload(value, expectedKind),
      };
    }

    const legacy = parseLegacyAiSuggestionPayload(value, expectedKind);
    if (legacy !== undefined) return { state: "legacy", payload: legacy };

    return {
      state: "invalid",
      error: new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID"),
    };
  } catch (error) {
    return {
      state: "invalid",
      error:
        error instanceof AiSuggestionPayloadError
          ? error
          : new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID"),
    };
  }
}

export function requireCurrentAiSuggestionPayload(
  value: unknown,
  expectedKind: AiSuggestionPayloadKind,
): AiSuggestionPayload {
  const result = readAiSuggestionPayload(value, expectedKind);
  if (result.state === "current") return result.payload;
  if (result.state === "missing") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_MISSING");
  }
  if (result.state === "legacy") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  throw result.error;
}

export function validateAiSuggestionPayload(
  value: unknown,
  expectedKind?: AiSuggestionPayloadKind,
): AiSuggestionPayload {
  const record = expectRecord(value);
  if (record.contractVersion !== AI_SUGGESTION_PAYLOAD_CONTRACT_VERSION) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
  }
  const suggestionKind = parseSuggestionKind(record.suggestionKind);
  if (expectedKind !== undefined && suggestionKind !== expectedKind) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
  }

  validateCommonFields(record);
  const payload = parseCurrentByKind(record, suggestionKind);
  const expectedFingerprint = buildAiSuggestionPayloadFingerprint(payload);
  if (payload.fingerprint.startsWith("sha256-") && payload.fingerprint !== expectedFingerprint) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_OBSOLETE");
  }
  if (!/^(?:sha256|db-fp-v1)-[a-f0-9]{64}$/.test(payload.fingerprint)) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return payload;
}

export function buildAiSuggestionPayloadFingerprint(
  payload: Omit<AiSuggestionPayload, "fingerprint"> | AiSuggestionPayload,
): string {
  const record = expectRecord(payload);
  const withoutMutableAudit = { ...record };
  delete withoutMutableAudit.fingerprint;
  const audit = isRecord(record.audit) ? record.audit : undefined;
  if (typeof audit?.sourceFingerprint === "string") {
    withoutMutableAudit.audit = { sourceFingerprint: audit.sourceFingerprint };
  } else {
    delete withoutMutableAudit.audit;
  }
  return `sha256-${createHash("sha256").update(canonicalJson(withoutMutableAudit)).digest("hex")}`;
}

export interface ProjectLegacyAiSuggestionPayloadInput {
  expectedKind: AiSuggestionPayloadKind;
  legacyPayload: unknown;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}

export function projectLegacyAiSuggestionPayloadForRead(
  input: ProjectLegacyAiSuggestionPayloadInput,
): AiSuggestionPayload {
  const legacy = parseLegacyAiSuggestionPayload(input.legacyPayload, input.expectedKind);
  if (legacy === undefined) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return buildCurrentPayloadFromLegacy({
    expectedKind: input.expectedKind,
    legacy,
    origin: input.origin,
    target: input.target,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    audit: input.audit,
  });
}

export interface MigrateLegacyAiSuggestionPayloadInput {
  expectedKind: AiSuggestionPayloadKind;
  status: AiSuggestionPayloadStatus;
  legacyPayload: unknown;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}

export function migrateLegacyAiSuggestionPayload(
  input: MigrateLegacyAiSuggestionPayloadInput,
): AiSuggestionPayload {
  if (input.status !== "pending_review") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_IMMUTABLE");
  }
  const legacy = parseLegacyAiSuggestionPayload(input.legacyPayload, input.expectedKind);
  if (legacy === undefined) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_INVALID");
  }
  return buildCurrentPayloadFromLegacy({
    expectedKind: input.expectedKind,
    legacy,
    origin: input.origin,
    target: input.target,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    audit: input.audit,
  });
}

function buildCurrentPayloadFromLegacy(input: {
  expectedKind: AiSuggestionPayloadKind;
  legacy: LegacyAiSuggestionPayload;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}): AiSuggestionPayload {
  if (input.expectedKind === "transaction_extraction") {
    if (!isLegacyTransactionExtractionPayload(input.legacy)) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
    }
    return buildAiSuggestionPayload({
      payload: {
        ...input.legacy,
        contractVersion: 1,
        suggestionKind: "transaction_extraction",
        origin: input.origin,
        target: input.target,
        ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
        reasons: [],
        audit: input.audit,
      },
    });
  }
  if (input.expectedKind === "deduplication" || input.expectedKind === "reconciliation") {
    if (!isLegacyDeterministicReviewPayload(input.legacy)) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_KIND_MISMATCH");
    }
    return buildAiSuggestionPayload({
      payload: {
        ...input.legacy,
        contractVersion: 1,
        suggestionKind: input.expectedKind,
        origin: input.origin,
        target: input.target,
        ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
        audit: input.audit,
      },
    });
  }
  throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED");
}

export function mutateAiSuggestionPayload<TPayload extends AiSuggestionPayload>(input: {
  payload: TPayload;
  status: AiSuggestionPayloadStatus;
  expectedFingerprint: string;
  mutation: (draft: TPayload) => TPayload;
  audit: AiSuggestionPayloadAudit;
}): TPayload {
  if (input.status !== "pending_review") {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_IMMUTABLE");
  }
  const current = validateAiSuggestionPayload(
    input.payload,
    input.payload.suggestionKind,
  ) as TPayload;
  if (current.fingerprint !== input.expectedFingerprint) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
  }
  const next = input.mutation(structuredClone(current));
  const withAudit = {
    ...next,
    audit: input.audit,
    fingerprint: "pending",
  } as TPayload;
  withAudit.fingerprint = buildAiSuggestionPayloadFingerprint(withAudit);
  return validateAiSuggestionPayload(withAudit, withAudit.suggestionKind) as TPayload;
}

export function assertAiSuggestionPayloadSourceCurrent(
  payload: AiSuggestionPayload,
  actualSourceFingerprint: string,
): void {
  const expectedSourceFingerprint =
    payload.audit.sourceFingerprint ??
    (payload.suggestionKind === "deduplication" || payload.suggestionKind === "reconciliation"
      ? payload.sourcePayloadFingerprint
      : undefined);
  if (
    expectedSourceFingerprint !== undefined &&
    expectedSourceFingerprint !== actualSourceFingerprint
  ) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_OBSOLETE");
  }
}
