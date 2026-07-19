import { randomUUID } from "node:crypto";

import {
  buildImportPayloadFingerprint,
  buildImportSuggestionDeduplicationCandidate,
  buildTransactionDeduplicationCandidate,
  detectDuplicateTransactions,
  parseDeterministicReviewPayload,
  parseTransactionExtractionPayload,
  previewReconciliation,
  type AiSuggestion,
  type AuditLogEntryDraft,
  type DeterministicReviewPayloadV1,
  type EntityId,
  type ImportBatch,
  type ImportTransactionSuggestion,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
} from "@solverfin/domain";

import { query, withSharedTransaction, type QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import {
  refreshImportBatchStatusForContext,
  resolveImportSuggestionFromDeterministicDecision,
} from "./imports.js";

export interface DeterministicReviewSuggestions {
  deduplicationSuggestions: AiSuggestion[];
  reconciliationSuggestions: AiSuggestion[];
}

export interface ListDeterministicReviewSuggestionsFilters {
  kind?: "deduplication" | "reconciliation";
  status?: AiSuggestion["status"] | "all";
  sourceEntityId?: EntityId;
  sourceSuggestionId?: EntityId;
}

export interface ReviewSuggestionResult {
  suggestion: AiSuggestion;
  sourceSuggestion?: AiSuggestion;
  transaction?: Transaction;
  importBatch?: ImportBatch;
  idempotent?: boolean;
}

interface TransactionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  cardId: string | null;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentId: string | null;
  importBatchId: string | null;
  aiSuggestionId: string | null;
  transferGroupId: string | null;
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

interface AiSuggestionRow {
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

export class DeterministicReviewSuggestionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "DeterministicReviewSuggestionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const TRANSACTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
  "categoryId", "cardId", "invoiceId", "recurrenceId", "installmentId", "importBatchId", "aiSuggestionId",
  "transferGroupId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "plannedOn", "description",
  "reconciledAt", "voidedAt", "createdAt", "updatedAt", "createdByUserId", "updatedByUserId"`;
const AI_SUGGESTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "sourceSuggestionId",
  "payloadFingerprint", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt"`;

export async function createDeterministicImportReviewSuggestionsForContext(
  context: TenantContext,
  importBatchId: EntityId,
  importSuggestions: readonly ImportTransactionSuggestion[],
  now: string,
  executeQuery: QueryExecutor,
): Promise<DeterministicReviewSuggestions> {
  const existingTransactions = await listReviewableTransactions(context, executeQuery);
  const existingCandidates = existingTransactions.map(buildTransactionDeduplicationCandidate);
  const deduplicationSuggestions: AiSuggestion[] = [];
  const reconciliationSuggestions: AiSuggestion[] = [];

  for (const importSuggestion of importSuggestions) {
    const sourceFingerprint = buildImportPayloadFingerprint({
      payloadVersion: 1,
      sourceRowNumber: importSuggestion.sourceRowNumber,
      sourceHash: importSuggestion.sourceHash,
      occurredOn: importSuggestion.occurredOn,
      kind: importSuggestion.kind as "income" | "expense",
      amountMinor: importSuggestion.amountMinor,
      currency: importSuggestion.currency,
      description: importSuggestion.description,
      ...(importSuggestion.accountId === undefined
        ? {}
        : { accountId: importSuggestion.accountId }),
      ...(importSuggestion.categoryId === undefined
        ? {}
        : { categoryId: importSuggestion.categoryId }),
      ...(importSuggestion.externalId === undefined
        ? {}
        : { externalId: importSuggestion.externalId }),
    });
    const candidate = buildImportSuggestionDeduplicationCandidate(importSuggestion);
    const reviewCandidates = detectDuplicateTransactions({
      context,
      now,
      candidate,
      existingCandidates,
    });

    for (const reviewCandidate of reviewCandidates) {
      const possibleDuplicate = existingTransactions.find(
        (transaction) => transaction.id === reviewCandidate.possibleDuplicateId,
      );
      if (possibleDuplicate === undefined) continue;

      const reconciliationPreview = previewReconciliation({
        context,
        source: {
          organizationId: context.organizationId,
          financialProfileId: context.financialProfileId,
          entityKind: "imported_transaction",
          entityId: importSuggestion.id,
          amountMinor: importSuggestion.amountMinor,
          currency: importSuggestion.currency,
          occurredOn: importSuggestion.occurredOn,
          kind: importSuggestion.kind,
          ...(importSuggestion.accountId === undefined
            ? {}
            : { accountId: importSuggestion.accountId }),
          ...(importSuggestion.categoryId === undefined
            ? {}
            : { categoryId: importSuggestion.categoryId }),
        },
        transaction: possibleDuplicate,
      });
      const reasons = reviewCandidate.reasons.map((reason) => reason.message);
      const conflicts = reconciliationPreview.conflicts.map((conflict) => conflict.message);
      const deduplication = buildSuggestion({
        context,
        importBatchId,
        sourceSuggestionId: importSuggestion.id,
        sourceFingerprint,
        targetTransactionId: possibleDuplicate.id,
        kind: "deduplication",
        confidence: reviewCandidate.score / 100,
        explanation:
          `Linha ${importSuggestion.sourceRowNumber} pode duplicar um lancamento existente. ` +
          `${reasons.join(" ")} Revise antes de decidir.`,
        reasons,
        conflicts: [],
        now,
      });
      const reconciliation = buildSuggestion({
        context,
        importBatchId,
        sourceSuggestionId: importSuggestion.id,
        sourceFingerprint,
        targetTransactionId: possibleDuplicate.id,
        kind: "reconciliation",
        confidence:
          reconciliationPreview.status === "ready"
            ? Math.max(0.8, reviewCandidate.score / 100)
            : Math.min(0.69, reviewCandidate.score / 100),
        explanation:
          conflicts.length === 0
            ? `Linha ${importSuggestion.sourceRowNumber} combina com um lancamento existente e pode ser conciliada.`
            : `Linha ${importSuggestion.sourceRowNumber} e parecida, mas possui conflitos: ${conflicts.join(" ")}`,
        reasons,
        conflicts,
        now,
      });

      const savedDeduplication = await insertDeterministicSuggestionIdempotently(
        context,
        deduplication,
        executeQuery,
      );
      const savedReconciliation = await insertDeterministicSuggestionIdempotently(
        context,
        reconciliation,
        executeQuery,
      );
      deduplicationSuggestions.push(savedDeduplication);
      reconciliationSuggestions.push(savedReconciliation);
    }
  }

  return { deduplicationSuggestions, reconciliationSuggestions };
}

export async function listDeterministicReviewSuggestionsForContext(
  context: TenantContext,
  filters: ListDeterministicReviewSuggestionsFilters = {},
): Promise<AiSuggestion[]> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION')
     order by "createdAt" asc, "id" asc`,
    [context.organizationId, context.financialProfileId],
  );
  return rows.map(mapAiSuggestionRow).filter((suggestion) => {
    if (filters.kind !== undefined && suggestion.kind !== filters.kind) return false;
    if (
      filters.status !== undefined &&
      filters.status !== "all" &&
      suggestion.status !== filters.status
    )
      return false;
    if (
      filters.sourceEntityId !== undefined &&
      suggestion.sourceEntityId !== filters.sourceEntityId
    )
      return false;
    if (
      filters.sourceSuggestionId !== undefined &&
      parseDeterministicReviewPayload(suggestion.payload)?.sourceSuggestionId !==
        filters.sourceSuggestionId
    )
      return false;
    return true;
  });
}

export async function approveDeterministicReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<ReviewSuggestionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const suggestion = await findSuggestionForContext(context, suggestionId, executeQuery, true);
    if (suggestion.status === "approved") return { suggestion, idempotent: true };
    assertPendingSuggestion(suggestion);
    const payload = parseDeterministicReviewPayload(suggestion.payload);
    if (payload === undefined) {
      throw new DeterministicReviewSuggestionError(
        "REVIEW_SUGGESTION_PAYLOAD_INVALID",
        "Sugestao deterministica nao possui vinculo estruturado valido.",
      );
    }

    const sourceRows = await executeQuery<AiSuggestionRow>(
      `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3 for update`,
      [payload.sourceSuggestionId, context.organizationId, context.financialProfileId],
    );
    const source = sourceRows[0] ? mapAiSuggestionRow(sourceRows[0]) : undefined;
    const sourcePayload = source ? parseTransactionExtractionPayload(source.payload) : undefined;
    if (source === undefined || sourcePayload === undefined) {
      throw new DeterministicReviewSuggestionError(
        "REVIEW_SOURCE_SUGGESTION_NOT_FOUND",
        "Linha de importacao vinculada nao esta mais disponivel.",
        404,
      );
    }
    if (buildImportPayloadFingerprint(sourcePayload) !== payload.sourcePayloadFingerprint) {
      throw new DeterministicReviewSuggestionError(
        "REVIEW_SUGGESTION_STALE",
        "A linha de importacao foi alterada. Execute a deteccao novamente antes de decidir.",
        409,
      );
    }

    const resolved = await resolveImportSuggestionFromDeterministicDecision(
      context,
      payload.sourceSuggestionId,
      suggestion,
      executeQuery,
    );
    const now = new Date().toISOString();
    const approved = markSuggestionReviewed(context, suggestion, "approved", now);
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(approved));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        approved,
        "approve",
        now,
        "Sugestao deterministica aprovada e linha de origem resolvida.",
      ),
    );
    return {
      suggestion: approved,
      sourceSuggestion: resolved.sourceSuggestion,
      ...(resolved.transaction === undefined ? {} : { transaction: resolved.transaction }),
      importBatch: resolved.importBatch,
      idempotent: false,
    };
  });
}

export async function rejectDeterministicReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  reason?: string,
): Promise<ReviewSuggestionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const suggestion = await findSuggestionForContext(context, suggestionId, executeQuery, true);
    if (suggestion.status === "rejected") return { suggestion, idempotent: true };
    assertPendingSuggestion(suggestion);
    const now = new Date().toISOString();
    const rejected = markSuggestionReviewed(context, suggestion, "rejected", now);
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(rejected));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        rejected,
        "reject",
        now,
        reason?.trim() || "Sugestao deterministica rejeitada pelo usuario.",
      ),
    );
    if (rejected.sourceEntityId !== undefined) {
      await refreshImportBatchStatusForContext(context, rejected.sourceEntityId, executeQuery);
    }
    return { suggestion: rejected, idempotent: false };
  });
}

async function insertDeterministicSuggestionIdempotently(
  context: TenantContext,
  suggestion: AiSuggestion,
  executeQuery: QueryExecutor,
): Promise<AiSuggestion> {
  const payload = parseDeterministicReviewPayload(suggestion.payload);
  if (payload === undefined) throw new Error("Deterministic payload required.");
  const rows = await executeQuery<AiSuggestionRow>(
    `${buildInsertAiSuggestionSql()} on conflict
      ("organizationId", "financialProfileId", "kind", "sourceSuggestionId", "payloadFingerprint", "targetEntityId")
      do nothing returning ${AI_SUGGESTION_SELECT_COLUMNS}`,
    buildAiSuggestionParams(suggestion),
  );
  if (rows[0] !== undefined) {
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        suggestion,
        "create",
        suggestion.createdAt,
        "Sugestao deterministica criada para revisao.",
      ),
    );
    return mapAiSuggestionRow(rows[0]);
  }
  const existingRows = await executeQuery<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = $3
       and "sourceSuggestionId" = $4 and "payloadFingerprint" = $5 and "targetEntityId" = $6`,
    [
      suggestion.organizationId,
      suggestion.financialProfileId,
      suggestion.kind.toUpperCase(),
      payload.sourceSuggestionId,
      payload.sourcePayloadFingerprint,
      payload.targetTransactionId,
    ],
  );
  if (existingRows[0] === undefined) throw new Error("Idempotent suggestion lookup failed.");
  return mapAiSuggestionRow(existingRows[0]);
}

async function listReviewableTransactions(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<Transaction[]> {
  const rows = await executeQuery<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "status" in ('PLANNED', 'POSTED', 'SUGGESTED', 'RECONCILED')
     order by "occurredOn" desc, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );
  return rows.map(mapTransactionRow);
}

async function findSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  executeQuery: QueryExecutor,
  lock = false,
): Promise<AiSuggestion> {
  const rows = await executeQuery<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION')${lock ? " for update" : ""}`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  if (rows[0] === undefined) {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_NOT_FOUND",
      "Sugestao de revisao nao encontrada no perfil financeiro ativo.",
      404,
    );
  }
  return mapAiSuggestionRow(rows[0]);
}

function buildSuggestion(input: {
  context: TenantContext;
  importBatchId: EntityId;
  sourceSuggestionId: EntityId;
  sourceFingerprint: string;
  targetTransactionId: EntityId;
  kind: "deduplication" | "reconciliation";
  confidence: number;
  explanation: string;
  reasons: readonly string[];
  conflicts: readonly string[];
  now: string;
}): AiSuggestion {
  const payload: DeterministicReviewPayloadV1 = {
    payloadVersion: 1,
    sourceSuggestionId: input.sourceSuggestionId,
    sourcePayloadFingerprint: input.sourceFingerprint,
    targetTransactionId: input.targetTransactionId,
    reasons: input.reasons,
    conflicts: input.conflicts,
  };
  return {
    id: randomUUID(),
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    kind: input.kind,
    status: "pending_review",
    sourceEntityId: input.importBatchId,
    targetEntityId: input.targetTransactionId,
    confidence: Number(input.confidence.toFixed(4)),
    explanation: input.explanation.slice(0, 500),
    payload,
    provider: "solverfin-rule",
    model: input.kind === "deduplication" ? "deduplication-v2" : "reconciliation-v2",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function markSuggestionReviewed(
  context: TenantContext,
  suggestion: AiSuggestion,
  status: "approved" | "rejected",
  now: string,
): AiSuggestion {
  return {
    ...suggestion,
    status,
    reviewedByUserId: context.userId,
    reviewedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

function assertPendingSuggestion(suggestion: AiSuggestion): void {
  if (suggestion.status !== "pending_review") {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_ALREADY_REVIEWED",
      "Apenas sugestoes pendentes podem ser aprovadas ou rejeitadas.",
      409,
    );
  }
}

function buildInsertAiSuggestionSql(): string {
  return `insert into "AiSuggestion"
    ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
     "confidence", "explanation", "payload", "sourceSuggestionId", "payloadFingerprint", "provider", "model",
     "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18)`;
}

function buildUpdateAiSuggestionSql(): string {
  return `update "AiSuggestion" set
    "kind" = $4, "status" = $5, "sourceEntityId" = $6, "targetEntityId" = $7, "confidence" = $8,
    "explanation" = $9, "payload" = $10::jsonb, "sourceSuggestionId" = $11, "payloadFingerprint" = $12,
    "provider" = $13, "model" = $14, "reviewedByUserId" = $15, "reviewedAt" = $16,
    "createdAt" = $17, "updatedAt" = $18
   where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`;
}

function buildAiSuggestionParams(suggestion: AiSuggestion): unknown[] {
  const payload = parseDeterministicReviewPayload(suggestion.payload);
  return [
    suggestion.id,
    suggestion.organizationId,
    suggestion.financialProfileId,
    suggestion.kind.toUpperCase(),
    suggestion.status.toUpperCase(),
    suggestion.sourceEntityId ?? null,
    suggestion.targetEntityId ?? payload?.targetTransactionId ?? null,
    suggestion.confidence,
    suggestion.explanation,
    suggestion.payload === undefined ? null : JSON.stringify(suggestion.payload),
    payload?.sourceSuggestionId ?? null,
    payload?.sourcePayloadFingerprint ?? null,
    suggestion.provider ?? null,
    suggestion.model ?? null,
    suggestion.reviewedByUserId ?? null,
    suggestion.reviewedAt ?? null,
    suggestion.createdAt,
    suggestion.updatedAt,
  ];
}

function buildSuggestionAuditEntry(
  context: TenantContext,
  suggestion: AiSuggestion,
  action: "create" | "approve" | "reject",
  occurredAt: string,
  reason: string,
): AuditLogEntryDraft {
  return {
    organizationId: suggestion.organizationId,
    financialProfileId: suggestion.financialProfileId,
    occurredAt,
    actorKind: action === "create" ? "system" : "user",
    ...(action === "create" ? {} : { actorId: context.userId }),
    action,
    entityKind: "ai_suggestion",
    entityId: suggestion.id,
    reason,
    redactedChanges: {
      status: action === "create" ? "added" : "changed",
      payload: action === "create" ? "added" : "changed",
      reviewedAt: action === "create" ? "added" : "changed",
    },
  };
}

function mapAiSuggestionRow(row: AiSuggestionRow): AiSuggestion {
  const suggestion: AiSuggestion = {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AiSuggestion["kind"],
    status: row.status.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.sourceEntityId !== null) suggestion.sourceEntityId = row.sourceEntityId;
  if (row.targetEntityId !== null) suggestion.targetEntityId = row.targetEntityId;
  const payload =
    parseDeterministicReviewPayload(row.payload) ?? parseTransactionExtractionPayload(row.payload);
  if (payload !== undefined) suggestion.payload = payload;
  if (row.provider !== null) suggestion.provider = row.provider;
  if (row.model !== null) suggestion.model = row.model;
  if (row.reviewedByUserId !== null) suggestion.reviewedByUserId = row.reviewedByUserId;
  if (row.reviewedAt !== null) suggestion.reviewedAt = row.reviewedAt.toISOString();
  return suggestion;
}

function mapTransactionRow(row: TransactionRow): Transaction {
  const transaction: Transaction = {
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
  };
  if (row.accountId !== null) transaction.accountId = row.accountId;
  if (row.destinationAccountId !== null)
    transaction.destinationAccountId = row.destinationAccountId;
  if (row.categoryId !== null) transaction.categoryId = row.categoryId;
  if (row.cardId !== null) transaction.cardId = row.cardId;
  if (row.invoiceId !== null) transaction.invoiceId = row.invoiceId;
  if (row.recurrenceId !== null) transaction.recurrenceId = row.recurrenceId;
  if (row.installmentId !== null) transaction.installmentId = row.installmentId;
  if (row.importBatchId !== null) transaction.importBatchId = row.importBatchId;
  if (row.aiSuggestionId !== null) transaction.aiSuggestionId = row.aiSuggestionId;
  if (row.transferGroupId !== null) transaction.transferGroupId = row.transferGroupId;
  if (row.reconciledAt !== null) transaction.reconciledAt = row.reconciledAt.toISOString();
  if (row.voidedAt !== null) transaction.voidedAt = row.voidedAt.toISOString();
  if (row.createdByUserId !== null) transaction.createdByUserId = row.createdByUserId;
  if (row.updatedByUserId !== null) transaction.updatedByUserId = row.updatedByUserId;
  return transaction;
}
