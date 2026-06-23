import { randomUUID } from "node:crypto";

import {
  buildImportSuggestionDeduplicationCandidate,
  buildTransactionDeduplicationCandidate,
  detectDuplicateTransactions,
  previewReconciliation,
  type AiSuggestion,
  type AuditLogEntryDraft,
  type EntityId,
  type ImportTransactionSuggestion,
  type TenantContext,
  type Transaction,
  type TransactionKind,
  type TransactionSource,
  type TransactionStatus,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import type { query as QueryFn } from "../db.js";

export interface DeterministicReviewSuggestions {
  deduplicationSuggestions: AiSuggestion[];
  reconciliationSuggestions: AiSuggestion[];
}

export interface ListDeterministicReviewSuggestionsFilters {
  kind?: "deduplication" | "reconciliation";
  status?: AiSuggestion["status"] | "all";
  sourceEntityId?: EntityId;
}

export interface ReviewSuggestionResult {
  suggestion: AiSuggestion;
  transaction?: Transaction;
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
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "provider", "model", "reviewedByUserId",
  "reviewedAt", "createdAt", "updatedAt"`;

export async function createDeterministicImportReviewSuggestionsForContext(
  context: TenantContext,
  importBatchId: EntityId,
  importSuggestions: readonly ImportTransactionSuggestion[],
  now: string,
  executeQuery: typeof QueryFn,
): Promise<DeterministicReviewSuggestions> {
  const existingTransactions = await listReviewableTransactions(context, executeQuery);
  const existingCandidates = existingTransactions.map(buildTransactionDeduplicationCandidate);
  const deduplicationSuggestions: AiSuggestion[] = [];
  const reconciliationSuggestions: AiSuggestion[] = [];

  for (const importSuggestion of importSuggestions) {
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

      if (possibleDuplicate === undefined) {
        continue;
      }

      const deduplicationSuggestion = buildAiSuggestion({
        context,
        importBatchId,
        targetEntityId: possibleDuplicate.id,
        kind: "deduplication",
        confidence: reviewCandidate.score / 100,
        explanation: buildDeduplicationExplanation(importSuggestion, reviewCandidate.reasons),
        now,
      });
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
          ...(importSuggestion.accountId !== undefined
            ? { accountId: importSuggestion.accountId }
            : {}),
          ...(importSuggestion.categoryId !== undefined
            ? { categoryId: importSuggestion.categoryId }
            : {}),
        },
        transaction: possibleDuplicate,
      });
      const reconciliationSuggestion = buildAiSuggestion({
        context,
        importBatchId,
        targetEntityId: possibleDuplicate.id,
        kind: "reconciliation",
        confidence:
          reconciliationPreview.status === "ready"
            ? Math.max(0.8, reviewCandidate.score / 100)
            : Math.min(0.69, reviewCandidate.score / 100),
        explanation: buildReconciliationExplanation(
          importSuggestion,
          reconciliationPreview.conflicts,
        ),
        now,
      });

      deduplicationSuggestions.push(deduplicationSuggestion);
      reconciliationSuggestions.push(reconciliationSuggestion);
    }
  }

  for (const suggestion of [...deduplicationSuggestions, ...reconciliationSuggestions]) {
    await executeQuery(buildInsertAiSuggestionSql(), buildAiSuggestionParams(suggestion));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(context, suggestion, "create", now),
    );
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
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map(mapAiSuggestionRow).filter((suggestion) => {
    if (filters.kind !== undefined && suggestion.kind !== filters.kind) {
      return false;
    }

    if (
      filters.status !== undefined &&
      filters.status !== "all" &&
      suggestion.status !== filters.status
    ) {
      return false;
    }

    if (
      filters.sourceEntityId !== undefined &&
      suggestion.sourceEntityId !== filters.sourceEntityId
    ) {
      return false;
    }

    return true;
  });
}

export async function approveDeterministicReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<ReviewSuggestionResult> {
  const now = new Date().toISOString();
  const suggestion = await findSuggestionForContext(context, suggestionId);
  assertPendingSuggestion(suggestion);

  let transaction: Transaction | undefined;
  const approvedSuggestion = markSuggestionReviewed(context, suggestion, "approved", now);

  await withTransaction(async (executeQuery) => {
    if (suggestion.kind === "reconciliation") {
      transaction = await reconcileTargetTransaction(context, suggestion, now, executeQuery);
    }

    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(approvedSuggestion));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(context, approvedSuggestion, "approve", now),
    );
  });

  return transaction === undefined
    ? { suggestion: approvedSuggestion }
    : { suggestion: approvedSuggestion, transaction };
}

export async function rejectDeterministicReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  reason?: string,
): Promise<ReviewSuggestionResult> {
  const now = new Date().toISOString();
  const suggestion = await findSuggestionForContext(context, suggestionId);
  assertPendingSuggestion(suggestion);
  const rejectedSuggestion = markSuggestionReviewed(context, suggestion, "rejected", now);

  await withTransaction(async (executeQuery) => {
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(rejectedSuggestion));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        rejectedSuggestion,
        "reject",
        now,
        reason ?? "Sugestao deterministica rejeitada pelo usuario.",
      ),
    );
  });

  return { suggestion: rejectedSuggestion };
}

async function listReviewableTransactions(
  context: TenantContext,
  executeQuery: typeof QueryFn,
): Promise<Transaction[]> {
  const rows = await executeQuery<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "organizationId" = $1 and "financialProfileId" = $2
       and "status" in ('PLANNED', 'POSTED', 'SUGGESTED')
     order by "occurredOn" desc, "createdAt" desc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows.map(mapTransactionRow);
}

async function findTransactionForContext(
  context: TenantContext,
  transactionId: EntityId,
  executeQuery: typeof QueryFn,
): Promise<Transaction | undefined> {
  const rows = await executeQuery<TransactionRow>(
    `select ${TRANSACTION_SELECT_COLUMNS} from "Transaction"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [transactionId, context.organizationId, context.financialProfileId],
  );

  return rows[0] ? mapTransactionRow(rows[0]) : undefined;
}

async function findSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<AiSuggestion> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION')`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );

  const suggestion = rows[0] ? mapAiSuggestionRow(rows[0]) : undefined;

  if (suggestion === undefined) {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_NOT_FOUND",
      "Sugestao de revisao nao encontrada no perfil financeiro ativo.",
      404,
    );
  }

  return suggestion;
}

async function reconcileTargetTransaction(
  context: TenantContext,
  suggestion: AiSuggestion,
  now: string,
  executeQuery: typeof QueryFn,
): Promise<Transaction> {
  if (suggestion.targetEntityId === undefined) {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_TARGET_REQUIRED",
      "Sugestao de conciliacao precisa apontar para um lancamento existente.",
    );
  }

  const currentTransaction = await findTransactionForContext(
    context,
    suggestion.targetEntityId,
    executeQuery,
  );

  if (currentTransaction === undefined) {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_TARGET_NOT_FOUND",
      "Lancamento alvo nao encontrado no perfil financeiro ativo.",
      404,
    );
  }

  if (currentTransaction.status === "reconciled") {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_TARGET_ALREADY_RECONCILED",
      "Lancamento alvo ja esta conciliado.",
    );
  }

  if (currentTransaction.status === "voided") {
    throw new DeterministicReviewSuggestionError(
      "REVIEW_SUGGESTION_TARGET_VOIDED",
      "Lancamento cancelado nao pode ser conciliado.",
    );
  }

  const transaction: Transaction = {
    ...currentTransaction,
    status: "reconciled",
    reconciledAt: now,
    aiSuggestionId: suggestion.id,
    updatedAt: now,
    updatedByUserId: context.userId,
  };

  await executeQuery(
    `update "Transaction" set
       "status" = 'RECONCILED', "reconciledAt" = $4, "aiSuggestionId" = $5,
       "updatedAt" = $4, "updatedByUserId" = $6
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [
      transaction.id,
      context.organizationId,
      context.financialProfileId,
      now,
      suggestion.id,
      context.userId,
    ],
  );
  await insertAuditLogEntry(
    executeQuery,
    buildTransactionReconciliationAuditEntry(context, transaction, now),
  );

  return transaction;
}

function buildAiSuggestion(input: {
  context: TenantContext;
  importBatchId: EntityId;
  targetEntityId: EntityId;
  kind: Extract<AiSuggestion["kind"], "deduplication" | "reconciliation">;
  confidence: number;
  explanation: string;
  now: string;
}): AiSuggestion {
  return {
    id: randomUUID(),
    organizationId: input.context.organizationId,
    financialProfileId: input.context.financialProfileId,
    kind: input.kind,
    status: "pending_review",
    sourceEntityId: input.importBatchId,
    targetEntityId: input.targetEntityId,
    confidence: Number(input.confidence.toFixed(4)),
    explanation: input.explanation.slice(0, 500),
    provider: "solverfin-rule",
    model: input.kind === "deduplication" ? "deduplication-v1" : "reconciliation-v1",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function buildDeduplicationExplanation(
  suggestion: ImportTransactionSuggestion,
  reasons: readonly { message: string }[],
): string {
  const reasonText = reasons.map((reason) => reason.message).join(" ");

  return (
    `Regra deterministica: a linha ${suggestion.sourceRowNumber} do CSV pode duplicar um lancamento existente. ` +
    `${reasonText} Revise antes de confirmar qualquer efeito financeiro.`
  );
}

function buildReconciliationExplanation(
  suggestion: ImportTransactionSuggestion,
  conflicts: readonly { message: string }[],
): string {
  if (conflicts.length === 0) {
    return (
      `Regra deterministica: a linha ${suggestion.sourceRowNumber} do CSV combina com um lancamento previsto/manual. ` +
      "A aprovacao marca o lancamento alvo como conciliado e mantem trilha de revisao."
    );
  }

  return (
    `Regra deterministica: a linha ${suggestion.sourceRowNumber} do CSV e parecida com um lancamento existente, ` +
    `mas precisa de revisao por conflito: ${conflicts.map((conflict) => conflict.message).join(" ")}`
  );
}

function markSuggestionReviewed(
  context: TenantContext,
  suggestion: AiSuggestion,
  status: Extract<AiSuggestion["status"], "approved" | "rejected">,
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
    );
  }
}

function buildInsertAiSuggestionSql(): string {
  return `insert into "AiSuggestion"
    ("id", "organizationId", "financialProfileId", "kind", "status", "sourceEntityId", "targetEntityId",
     "confidence", "explanation", "provider", "model", "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt")
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;
}

function buildUpdateAiSuggestionSql(): string {
  return `update "AiSuggestion" set
    "kind" = $4, "status" = $5, "sourceEntityId" = $6, "targetEntityId" = $7, "confidence" = $8,
    "explanation" = $9, "provider" = $10, "model" = $11, "reviewedByUserId" = $12, "reviewedAt" = $13,
    "createdAt" = $14, "updatedAt" = $15
   where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`;
}

function buildAiSuggestionParams(suggestion: AiSuggestion): unknown[] {
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
  action: Extract<AuditLogEntryDraft["action"], "create" | "approve" | "reject">,
  occurredAt: string,
  reason?: string,
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
    reason:
      reason ??
      (action === "create"
        ? "Sugestao deterministica criada para revisao."
        : "Sugestao deterministica revisada pelo usuario."),
    redactedChanges: {
      status: action === "create" ? "added" : "changed",
      confidence: action === "create" ? "added" : "changed",
      explanation: action === "create" ? "added" : "changed",
    },
  };
}

function buildTransactionReconciliationAuditEntry(
  context: TenantContext,
  transaction: Transaction,
  occurredAt: string,
): AuditLogEntryDraft {
  return {
    organizationId: transaction.organizationId,
    financialProfileId: transaction.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action: "reconcile",
    entityKind: "transaction",
    entityId: transaction.id,
    reason: "Conciliacao aprovada a partir de sugestao deterministica.",
    redactedChanges: {
      status: "changed",
      reconciledAt: "added",
      aiSuggestionId: "added",
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
