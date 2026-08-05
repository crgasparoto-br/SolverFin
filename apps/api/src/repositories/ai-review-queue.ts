import {
  parseTransactionExtractionPayload,
  type AiSuggestion,
  type AuditLogEntryDraft,
  type EntityId,
  type ImportLineDirection,
  type TenantContext,
  type Transaction,
  type TransactionKind,
} from "@solverfin/domain";
import {
  buildAiSuggestionPayload,
  migrateLegacyAiSuggestionPayload,
  readAiSuggestionPayload,
  type AiSuggestionPayloadOrigin,
  type AiSuggestionPayloadTarget,
  type TransactionExtractionSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";

import { query, withTransaction, type QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { createAiSuggestionTransaction } from "./ai-suggestion-transactions.js";
import {
  approveImportSuggestionForContext,
  rejectImportSuggestionForContext,
  updateImportSuggestionForContext,
  type ImportSuggestionUpdatePayload,
} from "./imports.js";

export type PersistedAiSuggestion = Omit<AiSuggestion, "payload"> & {
  payload?: unknown;
};

export interface AiReviewQueueListFilters {
  kind?: AiSuggestion["kind"];
  status?: AiSuggestion["status"] | "all";
  includeLowConfidence?: boolean;
}

export interface AiSuggestedTransactionDraft {
  kind: TransactionKind;
  amountMinor: number;
  occurredOn: string;
  accountId: string;
  description: string;
  currency?: string;
  categoryId?: string;
  direction?: ImportLineDirection;
  otherAccountId?: string;
  destinationAccountId?: string;
}

export interface AiReviewQueueItem {
  id: EntityId;
  kind: AiSuggestion["kind"];
  status: AiSuggestion["status"];
  origin: "ai" | "rule" | "import" | "automation";
  confidence: number;
  risk: "normal" | "low_confidence";
  explanation: string;
  maskedSummary: string;
  proposedTransaction?: AiSuggestedTransactionDraft;
  sourceEntityId?: EntityId;
  targetEntityId?: EntityId;
  provider?: string;
  model?: string;
  reviewedByUserId?: EntityId;
  reviewedAt?: string;
  createdAt: string;
}

export interface ReviewMutationResult {
  suggestion: PersistedAiSuggestion;
  transaction?: Transaction;
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
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AiReviewQueueError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "AiReviewQueueError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const AI_SUGGESTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "provider", "model", "reviewedByUserId",
  "reviewedAt", "createdAt", "updatedAt"`;

export async function listAiReviewQueueForContext(
  context: TenantContext,
  filters: AiReviewQueueListFilters = {},
): Promise<AiReviewQueueItem[]> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId],
  );

  return rows
    .map(mapAiSuggestionRow)
    .filter((suggestion) => matchesFilters(suggestion, filters))
    .filter(
      (suggestion) =>
        filters.includeLowConfidence === true || suggestion.confidence >= LOW_CONFIDENCE_THRESHOLD,
    )
    .map(buildQueueItem);
}

export async function approveAiReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  payloadOverride?: Partial<AiSuggestedTransactionDraft>,
): Promise<ReviewMutationResult> {
  const observed = await findSuggestionForContext(context, suggestionId);

  if (isImportExtractionSuggestion(observed)) {
    const result = await approveImportSuggestionForContext(
      context,
      observed.sourceEntityId as string,
      observed.id,
    );
    return result.transaction === undefined
      ? { suggestion: result.suggestion }
      : { suggestion: result.suggestion, transaction: result.transaction };
  }

  return withTransaction(async (executeQuery) => {
    const suggestion = await lockSuggestionForContext(executeQuery, context, suggestionId);
    assertPending(suggestion);
    const now = new Date().toISOString();
    let transaction: Transaction | undefined;
    let targetEntityId: string | undefined;
    let reviewedPayload = suggestion.payload;

    if (suggestion.kind === "transaction_extraction") {
      const draft = parseProposedTransaction(suggestion);
      const payload = mergeTransactionDraft(draft, payloadOverride);
      reviewedPayload = buildReviewedTransactionPayload(suggestion, payload);
      transaction = await createAiSuggestionTransaction(
        executeQuery,
        context,
        suggestion.id,
        payload,
        now,
      );
      targetEntityId = transaction.id;
    }

    const approvedSuggestion = markSuggestionReviewed(
      context,
      { ...suggestion, payload: reviewedPayload },
      "approved",
      now,
      targetEntityId,
    );
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(approvedSuggestion));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        approvedSuggestion,
        "approve",
        now,
        transaction === undefined
          ? "Sugestao aprovada sem efeito financeiro automatico."
          : "Sugestao aprovada e convertida em lancamento.",
        payloadOverride === undefined ? undefined : buildRedactedProposalChanges(payloadOverride),
      ),
    );

    return transaction === undefined
      ? { suggestion: approvedSuggestion }
      : { suggestion: approvedSuggestion, transaction };
  });
}

export async function editAiReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  payload: Partial<AiSuggestedTransactionDraft>,
  reason?: string,
): Promise<ReviewMutationResult> {
  const observed = await findSuggestionForContext(context, suggestionId);

  if (isImportExtractionSuggestion(observed)) {
    const result = await updateImportSuggestionForContext(
      context,
      observed.sourceEntityId as string,
      observed.id,
      buildImportSuggestionChanges(payload),
    );
    return { suggestion: result.suggestion };
  }

  return withTransaction(async (executeQuery) => {
    const suggestion = await lockSuggestionForContext(executeQuery, context, suggestionId);
    assertPending(suggestion);
    const now = new Date().toISOString();
    let reviewedPayload = suggestion.payload;

    if (suggestion.kind === "transaction_extraction") {
      const draft = parseProposedTransaction(suggestion);
      const merged = mergeTransactionDraft(draft, payload);
      reviewedPayload = buildReviewedTransactionPayload(suggestion, merged);
    }

    const editedSuggestion = markSuggestionReviewed(
      context,
      { ...suggestion, payload: reviewedPayload },
      "edited",
      now,
    );
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(editedSuggestion));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        editedSuggestion,
        "update",
        now,
        reason ?? "Sugestao editada antes da confirmacao.",
        buildRedactedProposalChanges(payload),
      ),
    );
    return { suggestion: editedSuggestion };
  });
}

export async function rejectAiReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  reason?: string,
): Promise<ReviewMutationResult> {
  const observed = await findSuggestionForContext(context, suggestionId);

  if (isImportExtractionSuggestion(observed)) {
    const result = await rejectImportSuggestionForContext(
      context,
      observed.sourceEntityId as string,
      observed.id,
      reason,
    );
    return { suggestion: result.suggestion };
  }

  return withTransaction(async (executeQuery) => {
    const suggestion = await lockSuggestionForContext(executeQuery, context, suggestionId);
    assertPending(suggestion);
    const now = new Date().toISOString();
    const rejectedSuggestion = markSuggestionReviewed(context, suggestion, "rejected", now);
    await executeQuery(buildUpdateAiSuggestionSql(), buildAiSuggestionParams(rejectedSuggestion));
    await insertAuditLogEntry(
      executeQuery,
      buildSuggestionAuditEntry(
        context,
        rejectedSuggestion,
        "reject",
        now,
        reason ?? "Sugestao rejeitada pelo usuario.",
      ),
    );
    return { suggestion: rejectedSuggestion };
  });
}

async function findSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<PersistedAiSuggestion> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const suggestion = rows[0] ? mapAiSuggestionRow(rows[0]) : undefined;

  if (suggestion === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_SUGGESTION_NOT_FOUND",
      "Sugestao nao encontrada no perfil financeiro ativo.",
      404,
    );
  }

  return suggestion;
}

async function lockSuggestionForContext(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: EntityId,
): Promise<PersistedAiSuggestion> {
  const rows = await executeQuery<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
     for update`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const suggestion = rows[0] ? mapAiSuggestionRow(rows[0]) : undefined;
  if (suggestion === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_SUGGESTION_NOT_FOUND",
      "Sugestao nao encontrada no perfil financeiro ativo.",
      404,
    );
  }
  return suggestion;
}

function matchesFilters(
  suggestion: PersistedAiSuggestion,
  filters: AiReviewQueueListFilters,
): boolean {
  const status = filters.status ?? "pending_review";
  if (status !== "all" && suggestion.status !== status) return false;
  if (filters.kind !== undefined && suggestion.kind !== filters.kind) return false;
  return true;
}

function buildQueueItem(suggestion: PersistedAiSuggestion): AiReviewQueueItem {
  const proposedTransaction =
    suggestion.kind === "transaction_extraction"
      ? tryParseProposedTransaction(suggestion)
      : undefined;
  const item: AiReviewQueueItem = {
    id: suggestion.id,
    kind: suggestion.kind,
    status: suggestion.status,
    origin: resolveOrigin(suggestion),
    confidence: suggestion.confidence,
    risk: suggestion.confidence < LOW_CONFIDENCE_THRESHOLD ? "low_confidence" : "normal",
    explanation: suggestion.explanation,
    maskedSummary: buildMaskedSummary(suggestion, proposedTransaction),
    createdAt: suggestion.createdAt,
  };
  if (proposedTransaction !== undefined) {
    item.proposedTransaction = proposedTransaction;
  }
  if (suggestion.sourceEntityId !== undefined) {
    item.sourceEntityId = suggestion.sourceEntityId;
  }
  if (suggestion.targetEntityId !== undefined) {
    item.targetEntityId = suggestion.targetEntityId;
  }
  if (suggestion.provider !== undefined) item.provider = suggestion.provider;
  if (suggestion.model !== undefined) item.model = suggestion.model;
  if (suggestion.reviewedByUserId !== undefined) {
    item.reviewedByUserId = suggestion.reviewedByUserId;
  }
  if (suggestion.reviewedAt !== undefined) item.reviewedAt = suggestion.reviewedAt;
  return item;
}

function resolveOrigin(suggestion: PersistedAiSuggestion): AiReviewQueueItem["origin"] {
  if (suggestion.provider?.startsWith("solverfin-import") === true) {
    return "import";
  }
  if (suggestion.provider?.startsWith("solverfin-rule") === true) {
    return "rule";
  }
  if (suggestion.provider?.startsWith("solverfin-automation") === true) {
    return "automation";
  }
  return "ai";
}

function buildMaskedSummary(
  suggestion: PersistedAiSuggestion,
  proposedTransaction: AiSuggestedTransactionDraft | undefined,
): string {
  if (proposedTransaction !== undefined) {
    return `${proposedTransaction.occurredOn} - ${proposedTransaction.description}`.slice(0, 160);
  }
  return suggestion.explanation.slice(0, 160);
}

function parseProposedTransaction(suggestion: PersistedAiSuggestion): AiSuggestedTransactionDraft {
  const parsed = tryParseProposedTransaction(suggestion);
  if (parsed === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED",
      "Esta sugestao nao possui payload estruturado compativel para aprovacao automatica.",
      422,
    );
  }
  return parsed;
}

function tryParseProposedTransaction(
  suggestion: PersistedAiSuggestion,
): AiSuggestedTransactionDraft | undefined {
  const structured = parseTransactionExtractionPayload(suggestion.payload);
  if (structured === undefined || structured.accountId === undefined) {
    return undefined;
  }
  return {
    kind: structured.kind,
    amountMinor: structured.amountMinor,
    occurredOn: structured.occurredOn,
    accountId: structured.accountId,
    description: structured.description,
    currency: structured.currency,
    ...(structured.categoryId === undefined ? {} : { categoryId: structured.categoryId }),
    ...(structured.payloadVersion === 2 ? { direction: structured.direction } : {}),
    ...(structured.payloadVersion === 2 && structured.otherAccountId !== undefined
      ? { otherAccountId: structured.otherAccountId }
      : {}),
  };
}

function buildImportSuggestionChanges(
  payload: Partial<AiSuggestedTransactionDraft>,
): ImportSuggestionUpdatePayload {
  const changes: ImportSuggestionUpdatePayload = {};
  if (payload.occurredOn !== undefined) changes.occurredOn = payload.occurredOn;
  if (payload.kind !== undefined) changes.kind = payload.kind;
  if (payload.amountMinor !== undefined) changes.amountMinor = payload.amountMinor;
  if (payload.description !== undefined) changes.description = payload.description;
  if (payload.accountId !== undefined) changes.accountId = payload.accountId;
  if (payload.categoryId !== undefined) changes.categoryId = payload.categoryId;
  const otherAccountId = payload.otherAccountId ?? payload.destinationAccountId;
  if (otherAccountId !== undefined) changes.otherAccountId = otherAccountId;
  if (Object.keys(changes).length === 0) {
    throw new AiReviewQueueError(
      "AI_REVIEW_IMPORT_EDIT_PAYLOAD_REQUIRED",
      "Informe ao menos um campo compativel com a linha importada.",
    );
  }
  return changes;
}

function mergeTransactionDraft(
  draft: AiSuggestedTransactionDraft,
  override: Partial<AiSuggestedTransactionDraft> | undefined,
): AiSuggestedTransactionDraft {
  const payload = { ...draft, ...(override ?? {}) };
  if (!payload.accountId) {
    throw new AiReviewQueueError(
      "AI_REVIEW_ACCOUNT_REQUIRED",
      "Sugestao precisa de uma conta valida antes da aprovacao.",
    );
  }
  if (!payload.description.trim()) {
    throw new AiReviewQueueError(
      "AI_REVIEW_DESCRIPTION_REQUIRED",
      "Sugestao precisa de uma descricao antes da aprovacao.",
    );
  }
  return {
    kind: payload.kind,
    amountMinor: payload.amountMinor,
    occurredOn: payload.occurredOn,
    accountId: payload.accountId,
    description: payload.description.trim(),
    ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
    ...(payload.categoryId !== undefined ? { categoryId: payload.categoryId } : {}),
    ...(payload.direction !== undefined ? { direction: payload.direction } : {}),
    ...(payload.otherAccountId !== undefined ? { otherAccountId: payload.otherAccountId } : {}),
    ...(payload.destinationAccountId !== undefined
      ? { destinationAccountId: payload.destinationAccountId }
      : {}),
  };
}

function buildReviewedTransactionPayload(
  suggestion: PersistedAiSuggestion,
  draft: AiSuggestedTransactionDraft,
): TransactionExtractionSuggestionPayload {
  const current = readCurrentTransactionPayload(suggestion);
  const otherAccountId = draft.otherAccountId ?? draft.destinationAccountId;
  const common = {
    contractVersion: 1 as const,
    suggestionKind: "transaction_extraction" as const,
    origin: current.origin,
    target: current.target,
    ...(current.confidence === undefined ? {} : { confidence: current.confidence }),
    reasons: current.reasons,
    audit: current.audit,
    sourceRowNumber: current.sourceRowNumber,
    sourceHash: current.sourceHash,
    occurredOn: draft.occurredOn,
    amountMinor: draft.amountMinor,
    currency: draft.currency ?? current.currency,
    description: draft.description,
    accountId: draft.accountId,
    ...(draft.categoryId === undefined ? {} : { categoryId: draft.categoryId }),
    ...(current.externalId === undefined ? {} : { externalId: current.externalId }),
  };

  if (
    current.payloadVersion === 1 &&
    draft.kind !== "transfer" &&
    draft.direction === undefined &&
    otherAccountId === undefined
  ) {
    return buildAiSuggestionPayload({
      payload: {
        ...common,
        payloadVersion: 1,
        kind: draft.kind,
      },
    });
  }

  const direction =
    draft.direction ??
    (current.payloadVersion === 2
      ? current.direction
      : current.kind === "income"
        ? "inflow"
        : "outflow");
  return buildAiSuggestionPayload({
    payload: {
      ...common,
      payloadVersion: 2,
      kind: draft.kind,
      direction,
      ...(otherAccountId === undefined ? {} : { otherAccountId }),
    },
  });
}

function readCurrentTransactionPayload(
  suggestion: PersistedAiSuggestion,
): TransactionExtractionSuggestionPayload {
  const read = readAiSuggestionPayload(suggestion.payload, "transaction_extraction");
  if (read.state === "current" && read.payload.suggestionKind === "transaction_extraction") {
    return read.payload;
  }
  if (read.state === "legacy") {
    const migrated = migrateLegacyAiSuggestionPayload({
      expectedKind: "transaction_extraction",
      status: suggestion.status,
      legacyPayload: read.payload,
      origin: inferPayloadOrigin(suggestion),
      target: inferPayloadTarget(suggestion),
      confidence: suggestion.confidence,
      audit: { createdAt: suggestion.createdAt },
    });
    if (migrated.suggestionKind === "transaction_extraction") {
      return migrated;
    }
  }
  throw new AiReviewQueueError(
    "AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED",
    "Esta sugestao nao possui payload estruturado compativel para revisao.",
    422,
  );
}

function inferPayloadOrigin(suggestion: PersistedAiSuggestion): AiSuggestionPayloadOrigin {
  if (suggestion.provider?.startsWith("solverfin-import") === true) {
    return {
      kind: "import",
      sourceKind: suggestion.provider.includes("ofx") ? "ofx" : "csv",
      ...(suggestion.sourceEntityId === undefined
        ? {}
        : { sourceEntityId: suggestion.sourceEntityId }),
    };
  }
  if (suggestion.provider?.startsWith("solverfin-rule") === true) {
    return { kind: "rule" };
  }
  if (suggestion.provider?.startsWith("solverfin-automation") === true) {
    return { kind: "automation" };
  }
  if (suggestion.provider !== undefined) {
    return {
      kind: "provider",
      provider: suggestion.provider,
      ...(suggestion.model === undefined ? {} : { model: suggestion.model }),
    };
  }
  return { kind: "system", component: "ai-review-queue" };
}

function inferPayloadTarget(suggestion: PersistedAiSuggestion): AiSuggestionPayloadTarget {
  return suggestion.sourceEntityId === undefined
    ? { entityKind: "transaction" }
    : {
        entityKind: "import_suggestion",
        entityId: suggestion.sourceEntityId,
      };
}

function assertPending(suggestion: PersistedAiSuggestion): void {
  if (suggestion.status !== "pending_review") {
    throw new AiReviewQueueError(
      "AI_REVIEW_INVALID_TRANSITION",
      "Apenas sugestoes pendentes podem ser revisadas.",
      409,
    );
  }
}

function markSuggestionReviewed(
  context: TenantContext,
  suggestion: PersistedAiSuggestion,
  status: Extract<AiSuggestion["status"], "approved" | "edited" | "rejected">,
  now: string,
  targetEntityId?: string,
): PersistedAiSuggestion {
  return {
    ...suggestion,
    status,
    ...(targetEntityId !== undefined ? { targetEntityId } : {}),
    reviewedByUserId: context.userId,
    reviewedAt: now,
    updatedAt: now,
    updatedByUserId: context.userId,
  };
}

function buildUpdateAiSuggestionSql(): string {
  return `update "AiSuggestion" set
      "kind" = $4, "status" = $5, "sourceEntityId" = $6, "targetEntityId" = $7, "confidence" = $8,
      "explanation" = $9, "payload" = $10::jsonb, "provider" = $11, "model" = $12,
      "reviewedByUserId" = $13, "reviewedAt" = $14, "createdAt" = $15, "updatedAt" = $16
    where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`;
}

function buildAiSuggestionParams(suggestion: PersistedAiSuggestion): unknown[] {
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
    suggestion.payload === undefined ? null : JSON.stringify(suggestion.payload),
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
  suggestion: PersistedAiSuggestion,
  action: Extract<AuditLogEntryDraft["action"], "approve" | "reject" | "update">,
  occurredAt: string,
  reason: string,
  redactedChanges?: AuditLogEntryDraft["redactedChanges"],
): AuditLogEntryDraft {
  return {
    organizationId: suggestion.organizationId,
    financialProfileId: suggestion.financialProfileId,
    occurredAt,
    actorKind: "user",
    actorId: context.userId,
    action,
    entityKind: "ai_suggestion",
    entityId: suggestion.id,
    reason,
    redactedChanges: redactedChanges ?? {
      status: "changed",
      reviewedAt: "added",
      reviewedByUserId: "added",
    },
  };
}

function buildRedactedProposalChanges(
  payload: Partial<AiSuggestedTransactionDraft>,
): AuditLogEntryDraft["redactedChanges"] {
  const changes: NonNullable<AuditLogEntryDraft["redactedChanges"]> = {
    status: "changed",
    reviewedAt: "added",
    reviewedByUserId: "added",
  };
  for (const key of Object.keys(payload)) changes[key] = "changed";
  return changes;
}

function mapAiSuggestionRow(row: AiSuggestionRow): PersistedAiSuggestion {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AiSuggestion["kind"],
    status: row.status.toLowerCase() as AiSuggestion["status"],
    confidence: Number(row.confidence),
    explanation: row.explanation,
    ...(row.payload === null ? {} : { payload: row.payload }),
    ...(row.sourceEntityId === null ? {} : { sourceEntityId: row.sourceEntityId }),
    ...(row.targetEntityId === null ? {} : { targetEntityId: row.targetEntityId }),
    ...(row.provider === null ? {} : { provider: row.provider }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.reviewedByUserId === null ? {} : { reviewedByUserId: row.reviewedByUserId }),
    ...(row.reviewedAt === null ? {} : { reviewedAt: row.reviewedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isImportExtractionSuggestion(suggestion: PersistedAiSuggestion): boolean {
  return (
    suggestion.kind === "transaction_extraction" &&
    suggestion.sourceEntityId !== undefined &&
    suggestion.provider?.startsWith("solverfin-import") === true &&
    parseTransactionExtractionPayload(suggestion.payload) !== undefined
  );
}
