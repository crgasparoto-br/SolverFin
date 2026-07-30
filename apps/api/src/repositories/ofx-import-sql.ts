import {
  buildImportPayloadFingerprint,
  type AiSuggestion,
  type ImportBatch,
  type TransactionExtractionPayload,
} from "@solverfin/domain";

export function buildInsertOfxImportBatchSql(): string {
  return `insert into "ImportBatch"
    ("id", "organizationId", "financialProfileId", "defaultAccountId", "sourceKind", "status",
     "originalFileName", "sourceHash", "contentHash", "totalRows", "validRows", "duplicateRows", "problemRows", "problems",
     "csvDelimiter", "csvMapping", "receivedAt", "completedAt", "createdAt", "updatedAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16::jsonb,
      $17, $18, $19, $20)
    on conflict ("organizationId", "financialProfileId", "sourceHash") do nothing
    returning "id"`;
}

export function buildOfxImportBatchParams(batch: ImportBatch): unknown[] {
  return [
    batch.id,
    batch.organizationId,
    batch.financialProfileId,
    batch.defaultAccountId ?? null,
    batch.sourceKind.toUpperCase(),
    batch.status.toUpperCase(),
    batch.originalFileName ?? null,
    batch.sourceHash,
    batch.contentHash ?? null,
    batch.totalRows ?? 0,
    batch.validRows ?? 0,
    batch.duplicateRows ?? 0,
    batch.problemRows ?? 0,
    JSON.stringify(batch.problems ?? []),
    null,
    null,
    batch.receivedAt,
    batch.completedAt ?? null,
    batch.createdAt,
    batch.updatedAt,
  ];
}

export function buildOfxAiSuggestionParams(suggestion: AiSuggestion): unknown[] {
  const payload = suggestion.payload as TransactionExtractionPayload;
  return [
    suggestion.id,
    suggestion.organizationId,
    suggestion.financialProfileId,
    suggestion.kind.toUpperCase(),
    suggestion.status.toUpperCase(),
    suggestion.sourceEntityId ?? null,
    suggestion.targetEntityId ?? null,
    suggestion.confidence,
    suggestion.explanation,
    JSON.stringify(payload),
    null,
    buildImportPayloadFingerprint(payload),
    suggestion.provider ?? null,
    suggestion.model ?? null,
    suggestion.reviewedByUserId ?? null,
    suggestion.reviewedAt ?? null,
    suggestion.createdAt,
    suggestion.updatedAt,
  ];
}
