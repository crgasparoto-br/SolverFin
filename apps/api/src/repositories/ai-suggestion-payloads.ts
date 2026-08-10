import {
  readAiSuggestionPayload,
  type AiSuggestionPayloadKind,
  type AiSuggestionPayloadOrigin,
  type AiSuggestionPayloadStatus,
  type AiSuggestionPayloadTarget,
  type PublicAiSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";
import type { EntityId, TenantContext } from "@solverfin/domain";

import { resolveAiSuggestionPayloadForApi } from "../ai-suggestion-payload-contract.js";
import { query } from "../db.js";

interface AiSuggestionPayloadRow {
  id: string;
  kind: string;
  status: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  confidence: string | number;
  payload: unknown;
  payloadFingerprint: string | null;
  provider: string | null;
  model: string | null;
  createdAt: Date;
}

export interface AiSuggestionPayloadDetail {
  suggestionId: EntityId;
  legacyProjection: boolean;
  payload: PublicAiSuggestionPayload;
}

export class AiSuggestionPayloadRepositoryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AiSuggestionPayloadRepositoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function getAiSuggestionPayloadForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<AiSuggestionPayloadDetail> {
  const rows = await query<AiSuggestionPayloadRow>(
    `select "id", "kind", "status", "sourceEntityId", "targetEntityId", "confidence", "payload",
            "payloadFingerprint", "provider", "model", "createdAt"
       from "AiSuggestion"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new AiSuggestionPayloadRepositoryError(
      "AI_SUGGESTION_PAYLOAD_NOT_FOUND",
      "Sugestao nao encontrada no perfil financeiro ativo.",
      404,
    );
  }

  const kind = parseKind(row.kind);
  const status = parseStatus(row.status);
  const origin = resolveOrigin(row);
  const target = resolveTarget(row, kind);
  const read = readAiSuggestionPayload(row.payload, kind);
  const legacyProjection = read.state === "legacy";
  const result = resolveAiSuggestionPayloadForApi(
    {
      kind,
      status,
      payload: row.payload,
      origin,
      target,
      confidence: Number(row.confidence),
      audit: {
        createdAt: row.createdAt.toISOString(),
        ...(row.payloadFingerprint === null ? {} : { sourceFingerprint: row.payloadFingerprint }),
      },
    },
    {
      projectLegacyForRead: true,
      includeScopedEntityIds: true,
    },
  );

  return {
    suggestionId: row.id,
    legacyProjection,
    payload: result.publicPayload,
  };
}

function parseKind(value: string): AiSuggestionPayloadKind {
  const kind = value.toLowerCase();
  if (
    kind !== "transaction_extraction" &&
    kind !== "categorization" &&
    kind !== "deduplication" &&
    kind !== "reconciliation" &&
    kind !== "insight"
  ) {
    throw new AiSuggestionPayloadRepositoryError(
      "AI_SUGGESTION_PAYLOAD_KIND_MISMATCH",
      "O tipo da sugestao nao possui contrato de payload suportado.",
      409,
    );
  }
  return kind;
}

function parseStatus(value: string): AiSuggestionPayloadStatus {
  const status = value.toLowerCase();
  if (
    status !== "pending_review" &&
    status !== "approved" &&
    status !== "edited" &&
    status !== "rejected" &&
    status !== "expired"
  ) {
    throw new AiSuggestionPayloadRepositoryError(
      "AI_SUGGESTION_PAYLOAD_INVALID",
      "A sugestao possui estado incompatível com o contrato de payload.",
      409,
    );
  }
  return status;
}

function resolveOrigin(row: AiSuggestionPayloadRow): AiSuggestionPayloadOrigin {
  if (row.provider?.startsWith("solverfin-import") === true) {
    return {
      kind: "import",
      sourceKind: row.provider.includes("ofx") ? "ofx" : "csv",
      ...(row.sourceEntityId === null ? {} : { sourceEntityId: row.sourceEntityId }),
    };
  }
  if (row.provider?.startsWith("solverfin-rule") === true) {
    return { kind: "rule" };
  }
  if (row.provider?.startsWith("solverfin-automation") === true) {
    return { kind: "automation" };
  }
  if (row.provider !== null) {
    return {
      kind: "provider",
      provider: row.provider,
      ...(row.model === null ? {} : { model: row.model }),
    };
  }
  return { kind: "system", component: "legacy-reader" };
}

function resolveTarget(
  row: AiSuggestionPayloadRow,
  kind: AiSuggestionPayloadKind,
): AiSuggestionPayloadTarget {
  return {
    entityKind:
      kind === "transaction_extraction"
        ? "import_suggestion"
        : kind === "insight"
          ? "financial_profile"
          : "transaction",
    ...(row.targetEntityId === null
      ? row.sourceEntityId === null
        ? {}
        : { entityId: row.sourceEntityId }
      : { entityId: row.targetEntityId }),
  };
}
