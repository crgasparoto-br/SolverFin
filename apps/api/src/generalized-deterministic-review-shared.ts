import {
  buildImportPayloadFingerprint,
  buildTransactionDeduplicationCandidate,
  deriveImportLineDirection,
  parseDeterministicReviewPayload,
  parseTransactionExtractionPayload,
  type AiSuggestion,
  type DeduplicationCandidate,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
} from "@solverfin/domain";
import {
  readAiSuggestionPayload,
  type DeduplicationSuggestionPayloadV1,
  type ReconciliationSuggestionPayloadV1,
} from "@solverfin/domain/ai-suggestion-payloads";

import type { QueryExecutor } from "./db.js";

export interface GeneralizedAiSuggestionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  confidence: string | number;
  explanation: string;
  payload: unknown;
  sourceSuggestionId: string | null;
  payloadFingerprint: string | null;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneralizedTransactionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  cardId: string | null;
  kind: string;
  status: string;
  source: string;
  amountMinor: number;
  currency: string;
  occurredOn: Date;
  plannedOn: Date;
  description: string;
  reconciledAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface GeneralizedSourceState {
  row: GeneralizedAiSuggestionRow;
  extraction: NonNullable<ReturnType<typeof parseTransactionExtractionPayload>>;
  candidate: DeduplicationCandidate;
  fingerprints: ReadonlySet<string>;
  preferredFingerprint: string;
}

export type GeneralizedDeterministicPayload =
  | DeduplicationSuggestionPayloadV1
  | ReconciliationSuggestionPayloadV1;

export const GENERALIZED_AI_SUGGESTION_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "sourceSuggestionId",
  "payloadFingerprint", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt"`;

export const GENERALIZED_TRANSACTION_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
  "categoryId", "cardId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn",
  "description", "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;

export async function listPendingExtractionRows(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<GeneralizedAiSuggestionRow[]> {
  return executeQuery<GeneralizedAiSuggestionRow>(
    `select ${GENERALIZED_AI_SUGGESTION_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "kind" = 'TRANSACTION_EXTRACTION' and "status" = 'PENDING_REVIEW'
     order by "createdAt" asc, "id" asc`,
    [context.organizationId, context.financialProfileId],
  );
}

export async function listReviewableTransactionRows(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<GeneralizedTransactionRow[]> {
  return executeQuery<GeneralizedTransactionRow>(
    `select ${GENERALIZED_TRANSACTION_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "status" in ('PLANNED', 'POSTED', 'SUGGESTED', 'RECONCILED')
     order by "occurredOn" desc, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );
}

export function buildGeneralizedSourceState(
  row: GeneralizedAiSuggestionRow,
): GeneralizedSourceState | undefined {
  const extraction = parseTransactionExtractionPayload(row.payload);
  if (extraction === undefined) return undefined;
  const read = readAiSuggestionPayload(row.payload, "transaction_extraction");
  const legacyFingerprint = buildImportPayloadFingerprint(extraction);
  const fingerprints = new Set<string>([legacyFingerprint]);
  if (read.state === "current") fingerprints.add(read.payload.fingerprint);
  if (row.payloadFingerprint !== null) fingerprints.add(row.payloadFingerprint);
  const preferredFingerprint =
    row.payloadFingerprint ??
    (read.state === "current" ? read.payload.fingerprint : legacyFingerprint);
  const direction = deriveImportLineDirection(extraction);
  const candidate: DeduplicationCandidate = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    candidateKind:
      row.provider?.includes("bank-message") === true ? "bank_message" : "import_suggestion",
    sourceKind:
      row.provider?.includes("bank-message") === true
        ? "bank_message"
        : row.provider?.startsWith("solverfin-import") === true
          ? "import"
          : "ai_suggestion",
    kind: extraction.kind,
    amountMinor: extraction.amountMinor,
    currency: extraction.currency,
    occurredOn: extraction.occurredOn,
    description: extraction.description,
    sourceHash: extraction.sourceHash,
  };
  if (
    extraction.kind === "transfer" &&
    extraction.payloadVersion === 2 &&
    direction !== undefined &&
    extraction.accountId !== undefined &&
    extraction.otherAccountId !== undefined
  ) {
    candidate.accountId =
      direction === "outflow" ? extraction.accountId : extraction.otherAccountId;
    candidate.destinationAccountId =
      direction === "outflow" ? extraction.otherAccountId : extraction.accountId;
  } else if (extraction.accountId !== undefined) {
    candidate.accountId = extraction.accountId;
  }
  if (extraction.externalId !== undefined) candidate.externalId = extraction.externalId;
  return { row, extraction, candidate, fingerprints, preferredFingerprint };
}

export function buildGeneralizedReconciliationSource(source: GeneralizedSourceState) {
  return {
    organizationId: source.row.organizationId,
    financialProfileId: source.row.financialProfileId,
    entityKind: "imported_transaction" as const,
    entityId: source.row.id,
    amountMinor: source.extraction.amountMinor,
    currency: source.extraction.currency,
    occurredOn: source.extraction.occurredOn,
    kind: source.extraction.kind,
    ...(source.candidate.accountId === undefined ? {} : { accountId: source.candidate.accountId }),
    ...(source.candidate.destinationAccountId === undefined
      ? {}
      : { destinationAccountId: source.candidate.destinationAccountId }),
    ...(source.extraction.categoryId === undefined
      ? {}
      : { categoryId: source.extraction.categoryId }),
  };
}

export function mapGeneralizedTransaction(row: GeneralizedTransactionRow): Transaction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as TransactionKind,
    status: row.status.toLowerCase() as TransactionStatus,
    source: row.source.toLowerCase() as TransactionSource,
    amountMinor: row.amountMinor,
    currency: row.currency,
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    plannedOn: row.plannedOn.toISOString().slice(0, 10),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.accountId === null ? {} : { accountId: row.accountId }),
    ...(row.destinationAccountId === null ? {} : { destinationAccountId: row.destinationAccountId }),
    ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
    ...(row.cardId === null ? {} : { cardId: row.cardId }),
    ...(row.reconciledAt === null ? {} : { reconciledAt: row.reconciledAt.toISOString() }),
    ...(row.voidedAt === null ? {} : { voidedAt: row.voidedAt.toISOString() }),
    ...(row.createdByUserId === null ? {} : { createdByUserId: row.createdByUserId }),
    ...(row.updatedByUserId === null ? {} : { updatedByUserId: row.updatedByUserId }),
  } as Transaction;
}

export function mapGeneralizedSuggestion(row: GeneralizedAiSuggestionRow): AiSuggestion {
  const payload =
    parseTransactionExtractionPayload(row.payload) ?? parseDeterministicReviewPayload(row.payload);
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AiSuggestion["kind"],
    status: row.status.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.sourceEntityId === null ? {} : { sourceEntityId: row.sourceEntityId }),
    ...(row.targetEntityId === null ? {} : { targetEntityId: row.targetEntityId }),
    ...(payload === undefined ? {} : { payload }),
    ...(row.provider === null ? {} : { provider: row.provider }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.reviewedByUserId === null ? {} : { reviewedByUserId: row.reviewedByUserId }),
    ...(row.reviewedAt === null ? {} : { reviewedAt: row.reviewedAt.toISOString() }),
  };
}

export function requireGeneralizedDeterministicPayload(
  row: GeneralizedAiSuggestionRow,
  kind: "deduplication" | "reconciliation",
): GeneralizedDeterministicPayload | undefined {
  const read = readAiSuggestionPayload(row.payload, kind);
  if (read.state !== "current") return undefined;
  return read.payload as GeneralizedDeterministicPayload;
}

export function parseGeneralizedDeterministicKind(
  value: string,
): "deduplication" | "reconciliation" | undefined {
  const kind = value.toLowerCase();
  return kind === "deduplication" || kind === "reconciliation" ? kind : undefined;
}

export function deterministicCandidateKey(kind: string, targetTransactionId: string): string {
  return `${kind.toLowerCase()}:${targetTransactionId}`;
}

export function sameDeterministicEvidence(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function parseStoredDeterministicPayload(row: GeneralizedAiSuggestionRow) {
  return parseDeterministicReviewPayload(row.payload);
}

export function buildExistingTransactionCandidates(rows: readonly GeneralizedTransactionRow[]) {
  return rows.map(mapGeneralizedTransaction).map(buildTransactionDeduplicationCandidate);
}
