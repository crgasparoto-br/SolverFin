import type {
  Account,
  AiSuggestion,
  AuditLogEntryDraft,
  Category,
  EntityId,
  ISODate,
  ISODateTime,
  TenantScoped,
  Transaction,
  TransactionKind,
  TransactionMutationResult,
} from "./index.js";
import type { TenantContext } from "./tenant.js";
import { getTenantScopedResource, listTenantScopedResources } from "./tenant-authorization.js";
import { createTransaction } from "./transactions.js";

export type AiSuggestionReviewStatus = "pending_review" | "approved" | "edited" | "rejected";
export type AiSuggestionReviewOrigin = "ai" | "rule" | "import" | "automation";
export type AiSuggestionReviewRisk = "normal" | "low_confidence";

export interface AiSuggestedTransactionDraft {
  kind: TransactionKind;
  amountMinor: number;
  occurredOn: ISODate;
  accountId: EntityId;
  description: string;
  currency?: string;
  categoryId?: EntityId;
  destinationAccountId?: EntityId;
}

export interface ReviewableAiSuggestion extends TenantScoped {
  suggestion: AiSuggestion;
  origin: AiSuggestionReviewOrigin;
  proposedTransaction: AiSuggestedTransactionDraft;
  maskedSummary: string;
  createdAt: ISODateTime;
}

export interface AiSuggestionReviewListItem {
  id: EntityId;
  kind: AiSuggestion["kind"];
  status: AiSuggestionReviewStatus;
  origin: AiSuggestionReviewOrigin;
  confidence: number;
  explanation: string;
  risk: AiSuggestionReviewRisk;
  maskedSummary: string;
  proposedTransaction: AiSuggestedTransactionDraft;
  createdAt: ISODateTime;
}

export interface ListAiSuggestionReviewsFilters {
  includeLowConfidence?: boolean;
  kind?: AiSuggestion["kind"];
}

export interface ApproveAiSuggestionInput {
  context: TenantContext;
  suggestion: ReviewableAiSuggestion | undefined;
  transactionId: EntityId;
  now: ISODateTime;
  account?: Account;
  destinationAccount?: Account;
  category?: Category;
  payloadOverride?: Partial<AiSuggestedTransactionDraft>;
  reason?: string;
}

export interface RejectAiSuggestionInput {
  context: TenantContext;
  suggestion: ReviewableAiSuggestion | undefined;
  now: ISODateTime;
  reason?: string;
}

export interface AdjustAiSuggestionInput {
  context: TenantContext;
  suggestion: ReviewableAiSuggestion | undefined;
  now: ISODateTime;
  payload: Partial<AiSuggestedTransactionDraft>;
  reason?: string;
}

export interface AiSuggestionApprovalResult {
  suggestion: AiSuggestion;
  transactionResult: TransactionMutationResult;
  auditEntries: readonly AuditLogEntryDraft[];
}

export interface AiSuggestionReviewResult {
  suggestion: AiSuggestion;
  reviewItem?: ReviewableAiSuggestion;
  auditEntry: AuditLogEntryDraft;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function listPendingAiSuggestionReviews(
  context: TenantContext,
  suggestions: readonly ReviewableAiSuggestion[],
  filters: ListAiSuggestionReviewsFilters = {},
): AiSuggestionReviewListItem[] {
  return listTenantScopedResources(context, suggestions)
    .filter((item) => item.suggestion.status === "pending_review")
    .filter((item) => filters.kind === undefined || item.suggestion.kind === filters.kind)
    .filter(
      (item) =>
        filters.includeLowConfidence === true ||
        item.suggestion.confidence >= LOW_CONFIDENCE_THRESHOLD,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(buildReviewListItem);
}

export function approveAiSuggestion(input: ApproveAiSuggestionInput): AiSuggestionApprovalResult {
  const reviewItem = getReviewItem(input.context, input.suggestion);
  assertPending(reviewItem.suggestion);

  const payload = buildTransactionPayload(reviewItem.proposedTransaction, input.payloadOverride);
  const baseTransactionResult = createTransaction({
    id: input.transactionId,
    context: input.context,
    now: input.now,
    account: input.account,
    destinationAccount: input.destinationAccount,
    category: input.category,
    payload: {
      ...payload,
      source: "ai_suggestion",
      status: "posted",
    },
  });
  const transaction: Transaction = {
    ...baseTransactionResult.transaction,
    aiSuggestionId: reviewItem.suggestion.id,
  };
  const transactionAuditEntry: AuditLogEntryDraft = {
    ...baseTransactionResult.auditEntry,
    redactedChanges: {
      ...(baseTransactionResult.auditEntry.redactedChanges ?? {}),
      aiSuggestionId: "added",
    },
  };
  const approvedSuggestion = markSuggestionReviewed(
    input.context,
    reviewItem.suggestion,
    "approved",
    input.now,
    transaction.id,
  );
  const suggestionAuditEntry = buildSuggestionAuditEntry({
    action: "approve",
    context: input.context,
    suggestion: approvedSuggestion,
    occurredAt: input.now,
    reason: input.reason ?? "Sugestao aprovada e convertida em lancamento.",
  });

  return {
    suggestion: approvedSuggestion,
    transactionResult: {
      ...baseTransactionResult,
      transaction,
      auditEntry: transactionAuditEntry,
    },
    auditEntries: [suggestionAuditEntry, transactionAuditEntry],
  };
}

export function rejectAiSuggestion(input: RejectAiSuggestionInput): AiSuggestionReviewResult {
  const reviewItem = getReviewItem(input.context, input.suggestion);
  assertPending(reviewItem.suggestion);
  const rejectedSuggestion = markSuggestionReviewed(
    input.context,
    reviewItem.suggestion,
    "rejected",
    input.now,
  );

  return {
    suggestion: rejectedSuggestion,
    auditEntry: buildSuggestionAuditEntry({
      action: "reject",
      context: input.context,
      suggestion: rejectedSuggestion,
      occurredAt: input.now,
      reason: input.reason ?? "Sugestao rejeitada pelo usuario.",
    }),
  };
}

export function adjustAiSuggestion(input: AdjustAiSuggestionInput): AiSuggestionReviewResult {
  const reviewItem = getReviewItem(input.context, input.suggestion);
  assertPending(reviewItem.suggestion);
  const adjustedSuggestion = markSuggestionReviewed(
    input.context,
    reviewItem.suggestion,
    "edited",
    input.now,
  );
  const adjustedReviewItem: ReviewableAiSuggestion = {
    ...reviewItem,
    suggestion: adjustedSuggestion,
    proposedTransaction: buildTransactionPayload(reviewItem.proposedTransaction, input.payload),
  };

  return {
    suggestion: adjustedSuggestion,
    reviewItem: adjustedReviewItem,
    auditEntry: buildSuggestionAuditEntry({
      action: "update",
      context: input.context,
      suggestion: adjustedSuggestion,
      occurredAt: input.now,
      reason: input.reason ?? "Sugestao ajustada antes da aprovacao.",
      redactedChanges: buildRedactedProposalChanges(
        reviewItem.proposedTransaction,
        adjustedReviewItem.proposedTransaction,
      ),
    }),
  };
}

function buildReviewListItem(item: ReviewableAiSuggestion): AiSuggestionReviewListItem {
  return {
    id: item.suggestion.id,
    kind: item.suggestion.kind,
    status: "pending_review",
    origin: item.origin,
    confidence: item.suggestion.confidence,
    explanation: item.suggestion.explanation,
    risk: item.suggestion.confidence < LOW_CONFIDENCE_THRESHOLD ? "low_confidence" : "normal",
    maskedSummary: item.maskedSummary,
    proposedTransaction: item.proposedTransaction,
    createdAt: item.createdAt,
  };
}

function getReviewItem(
  context: TenantContext,
  suggestion: ReviewableAiSuggestion | undefined,
): ReviewableAiSuggestion {
  const reviewItem = getTenantScopedResource(context, suggestion);
  getTenantScopedResource(context, reviewItem.suggestion);

  return reviewItem;
}

function assertPending(suggestion: AiSuggestion): void {
  if (suggestion.status !== "pending_review") {
    throw new Error("Only pending AI suggestions can be reviewed.");
  }
}

function markSuggestionReviewed(
  context: TenantContext,
  suggestion: AiSuggestion,
  status: Extract<AiSuggestion["status"], "approved" | "edited" | "rejected">,
  now: ISODateTime,
  targetEntityId?: EntityId,
): AiSuggestion {
  const reviewedSuggestion: AiSuggestion = {
    ...suggestion,
    status,
    reviewedAt: now,
    reviewedByUserId: context.userId,
    updatedAt: now,
    updatedByUserId: context.userId,
  };

  if (targetEntityId !== undefined) {
    reviewedSuggestion.targetEntityId = targetEntityId;
  }

  return reviewedSuggestion;
}

function buildTransactionPayload(
  base: AiSuggestedTransactionDraft,
  override: Partial<AiSuggestedTransactionDraft> | undefined,
): AiSuggestedTransactionDraft {
  const payload = {
    ...base,
    ...(override ?? {}),
  };

  return {
    kind: payload.kind,
    amountMinor: payload.amountMinor,
    occurredOn: payload.occurredOn,
    accountId: payload.accountId,
    description: payload.description.trim(),
    ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.destinationAccountId !== undefined
      ? { destinationAccountId: payload.destinationAccountId }
      : {}),
  };
}

function buildSuggestionAuditEntry(input: {
  action: "approve" | "reject" | "update";
  context: TenantContext;
  suggestion: AiSuggestion;
  occurredAt: ISODateTime;
  reason: string;
  redactedChanges?: AuditLogEntryDraft["redactedChanges"];
}): AuditLogEntryDraft {
  return {
    organizationId: input.suggestion.organizationId,
    financialProfileId: input.suggestion.financialProfileId,
    occurredAt: input.occurredAt,
    actorKind: "user",
    actorId: input.context.userId,
    action: input.action,
    entityKind: "ai_suggestion",
    entityId: input.suggestion.id,
    reason: input.reason,
    ...(input.redactedChanges !== undefined ? { redactedChanges: input.redactedChanges } : {}),
  };
}

function buildRedactedProposalChanges(
  before: AiSuggestedTransactionDraft,
  after: AiSuggestedTransactionDraft,
): AuditLogEntryDraft["redactedChanges"] {
  const fields = [
    "kind",
    "amountMinor",
    "occurredOn",
    "accountId",
    "description",
    "currency",
    "categoryId",
    "destinationAccountId",
  ] as const satisfies readonly (keyof AiSuggestedTransactionDraft)[];
  const changes: NonNullable<AuditLogEntryDraft["redactedChanges"]> = {};

  for (const field of fields) {
    if (before[field] === after[field]) {
      continue;
    }

    if (before[field] === undefined) {
      changes[field] = "added";
      continue;
    }

    if (after[field] === undefined) {
      changes[field] = "removed";
      continue;
    }

    changes[field] = "changed";
  }

  return changes;
}
