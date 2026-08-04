import {
  AiSuggestionPayloadError,
  migrateLegacyAiSuggestionPayload,
  projectLegacyAiSuggestionPayloadForRead,
  readAiSuggestionPayload,
  toPublicAiSuggestionPayload,
  type AiSuggestionPayload,
  type AiSuggestionPayloadAudit,
  type AiSuggestionPayloadKind,
  type AiSuggestionPayloadOrigin,
  type AiSuggestionPayloadStatus,
  type AiSuggestionPayloadTarget,
  type PublicAiSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";

export interface PersistedAiSuggestionPayloadContext {
  kind: AiSuggestionPayloadKind;
  status: AiSuggestionPayloadStatus;
  payload: unknown;
  origin: AiSuggestionPayloadOrigin;
  target: AiSuggestionPayloadTarget;
  confidence?: number;
  audit: AiSuggestionPayloadAudit;
}

export interface AiSuggestionPayloadApiResult {
  payload: AiSuggestionPayload;
  migratedFromLegacy: boolean;
  publicPayload: PublicAiSuggestionPayload;
}

export class AiSuggestionPayloadApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AiSuggestionPayloadApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function resolveAiSuggestionPayloadForApi(
  context: PersistedAiSuggestionPayloadContext,
  options: {
    migrateLegacyOnCompatibleMutation?: boolean;
    projectLegacyForRead?: boolean;
    includeScopedEntityIds?: boolean;
  } = {},
): AiSuggestionPayloadApiResult {
  const read = readAiSuggestionPayload(context.payload, context.kind);
  if (read.state === "missing") {
    throw mapPayloadError(
      new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_MISSING"),
    );
  }
  if (read.state === "invalid") throw mapPayloadError(read.error);

  let payload: AiSuggestionPayload;
  let migratedFromLegacy = false;
  if (read.state === "legacy") {
    if (options.migrateLegacyOnCompatibleMutation === true) {
      payload = migrateLegacyAiSuggestionPayload({
        expectedKind: context.kind,
        status: context.status,
        legacyPayload: read.payload,
        origin: context.origin,
        target: context.target,
        ...(context.confidence === undefined ? {} : { confidence: context.confidence }),
        audit: context.audit,
      });
      migratedFromLegacy = true;
    } else if (options.projectLegacyForRead === true) {
      payload = projectLegacyAiSuggestionPayloadForRead({
        expectedKind: context.kind,
        legacyPayload: read.payload,
        origin: context.origin,
        target: context.target,
        ...(context.confidence === undefined ? {} : { confidence: context.confidence }),
        audit: context.audit,
      });
    } else {
      throw mapPayloadError(
        new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED"),
      );
    }
  } else {
    payload = read.payload;
  }

  return {
    payload,
    migratedFromLegacy,
    publicPayload: toPublicAiSuggestionPayload(payload, {
      includeScopedEntityIds: options.includeScopedEntityIds === true,
    }),
  };
}

export function mapAiSuggestionPayloadPersistenceError(error: unknown): AiSuggestionPayloadApiError {
  if (error instanceof AiSuggestionPayloadApiError) return error;
  if (error instanceof AiSuggestionPayloadError) return mapPayloadError(error);

  const record = isRecord(error) ? error : undefined;
  const databaseCode = typeof record?.code === "string" ? record.code : undefined;
  const databaseMessage = typeof record?.message === "string" ? record.message : "";
  const knownCode = KNOWN_DATABASE_CODES.find((code) => databaseMessage.includes(code));
  if (databaseCode === "P0001" && knownCode !== undefined) {
    return mapPayloadError(new AiSuggestionPayloadError(knownCode));
  }

  return new AiSuggestionPayloadApiError(
    "API_UNEXPECTED_ERROR",
    "Nao foi possivel processar a sugestao. Tente novamente.",
    500,
  );
}

function mapPayloadError(error: AiSuggestionPayloadError): AiSuggestionPayloadApiError {
  return new AiSuggestionPayloadApiError(error.code, error.message, error.statusCode);
}

const KNOWN_DATABASE_CODES = [
  "AI_SUGGESTION_PAYLOAD_MISSING",
  "AI_SUGGESTION_PAYLOAD_INVALID",
  "AI_SUGGESTION_PAYLOAD_KIND_MISMATCH",
  "AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED",
  "AI_SUGGESTION_PAYLOAD_OBSOLETE",
  "AI_SUGGESTION_PAYLOAD_IMMUTABLE",
  "AI_SUGGESTION_PAYLOAD_CONFLICT",
] as const satisfies readonly AiSuggestionPayloadError["code"][];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
