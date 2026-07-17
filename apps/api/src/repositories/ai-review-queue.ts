import {
  parseTransactionExtractionPayload,
  type AiSuggestion,
  type AuditLogEntryDraft,
  type EntityId,
  type TenantContext,
  type Transaction,
  type TransactionKind,
} from "@solverfin/domain";

import { query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import {
  approveImportSuggestionForContext,
  rejectImportSuggestionForContext,
  updateImportSuggestionForContext,
} from "./imports.js";
import { createTransactionForContext } from "./transactions.js";

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
  suggestion: AiSuggestion;
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
  const now = new Date().toISOString();
  const suggestion = await findSuggestionForContext(context, suggestionId);

  if (isImportExtractionSuggestion(suggestion)) {
    const result = await approveImportSuggestionForContext(
      context,
      suggestion.sourceEntityId as string,
      suggestion.id,
    );
    return result.transaction === undefined
      ? { suggestion: result.suggestion }
      : { suggestion: result.suggestion, transaction: result.transaction };
  }

  assertPending(suggestion);

  let transaction: Transaction | undefined;
  let targetEntityId: string | undefined;

  if (suggestion.kind === "transaction_extraction") {
    const draft = parseProposedTransaction(suggestion);
    const payload = mergeTransactionDraft(draft, payloadOverride);
    transaction = await createTransactionForContext(context, {
      ...payload,
      status: "posted",
      source: "ai_suggestion",
    });
    targetEntityId = transaction.id;

    await query(
      `update "Transaction" set "aiSuggestionId" = $1, "updatedAt" = $2, "updatedByUserId" = $3
       where "id" = $4 and "organizationId" = $5 and "financialProfileId" = $6`,
      [
        suggestion.id,
        now,
        context.userId,
        transaction.id,
        context.organizationId,
        context.financialProfileId,
      ],
    );
    transaction = { ...transaction, aiSuggestionId: suggestion.id };
  }

  const approvedSuggestion = markSuggestionReviewed(
    context,
    suggestion,
    "approved",
    now,
    targetEntityId,
  );

  await withTransaction(async (executeQuery) => {
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
      ),
    );
  });

  return transaction === undefined
    ? { suggestion: approvedSuggestion }
    : { suggestion: approvedSuggestion, transaction };
}

export async function editAiReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  payload: Partial<AiSuggestedTransactionDraft>,
  reason?: string,
): Promise<ReviewMutationResult> {
  const now = new Date().toISOString();
  const suggestion = await findSuggestionForContext(context, suggestionId);

  if (isImportExtractionSuggestion(suggestion)) {
    const result = await updateImportSuggestionForContext(
      context,
      suggestion.sourceEntityId as string,
      suggestion.id,
      {
        ...(payload.occurredOn === undefined ? {} : { occurredOn: payload.occurredOn }),
        ...(payload.kind === "income" || payload.kind === "expense" ? { kind: payload.kind } : {}),
        ...(payload.amountMinor === undefined ? {} : { amountMinor: payload.amountMinor }),
        ...(payload.currency === undefined ? {} : { currency: payload.currency }),
        ...(payload.description === undefined ? {} : { description: payload.description }),
        ...(payload.accountId === undefined ? {} : { accountId: payload.accountId }),
        ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
      },
    );
    return { suggestion: result.suggestion };
  }

  assertPending(suggestion);

  if (suggestion.kind === "transaction_extraction") {
    const draft = parseProposedTransaction(suggestion);
    mergeTransactionDraft(draft, payload);
  }

  const editedSuggestion = markSuggestionReviewed(context, suggestion, "edited", now);

  await withTransaction(async (executeQuery) => {
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
  });

  return { suggestion: editedSuggestion };
}

export async function rejectAiReviewSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  reason?: string,
): Promise<ReviewMutationResult> {
  const now = new Date().toISOString();
  const suggestion = await findSuggestionForContext(context, suggestionId);

  if (isImportExtractionSuggestion(suggestion)) {
    const result = await rejectImportSuggestionForContext(
      context,
      suggestion.sourceEntityId as string,
      suggestion.id,
      reason,
    );
    return { suggestion: result.suggestion };
  }

  assertPending(suggestion);
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
        reason ?? "Sugestao rejeitada pelo usuario.",
      ),
    );
  });

  return { suggestion: rejectedSuggestion };
}

async function findSuggestionForContext(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<AiSuggestion> {
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

function matchesFilters(suggestion: AiSuggestion, filters: AiReviewQueueListFilters): boolean {
  const status = filters.status ?? "pending_review";

  if (status !== "all" && suggestion.status !== status) {
    return false;
  }

  if (filters.kind !== undefined && suggestion.kind !== filters.kind) {
    return false;
  }

  return true;
}

function buildQueueItem(suggestion: AiSuggestion): AiReviewQueueItem {
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

  if (proposedTransaction !== undefined) item.proposedTransaction = proposedTransaction;
  if (suggestion.sourceEntityId !== undefined) item.sourceEntityId = suggestion.sourceEntityId;
  if (suggestion.targetEntityId !== undefined) item.targetEntityId = suggestion.targetEntityId;
  if (suggestion.provider !== undefined) item.provider = suggestion.provider;
  if (suggestion.model !== undefined) item.model = suggestion.model;
  if (suggestion.reviewedByUserId !== undefined)
    item.reviewedByUserId = suggestion.reviewedByUserId;
  if (suggestion.reviewedAt !== undefined) item.reviewedAt = suggestion.reviewedAt;

  return item;
}

function resolveOrigin(suggestion: AiSuggestion): AiReviewQueueItem["origin"] {
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
  suggestion: AiSuggestion,
  proposedTransaction: AiSuggestedTransactionDraft | undefined,
): string {
  if (proposedTransaction !== undefined) {
    return `${proposedTransaction.occurredOn} - ${proposedTransaction.description}`.slice(0, 160);
  }

  return suggestion.explanation.slice(0, 160);
}

function parseProposedTransaction(suggestion: AiSuggestion): AiSuggestedTransactionDraft {
  const parsed = tryParseProposedTransaction(suggestion);

  if (parsed === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED",
      "Esta sugestao ainda nao possui dados suficientes para aprovacao automatica.",
    );
  }

  return parsed;
}

function tryParseProposedTransaction(
  suggestion: AiSuggestion,
): AiSuggestedTransactionDraft | undefined {
  const structured = parseTransactionExtractionPayload(suggestion.payload);
  if (structured !== undefined && structured.accountId !== undefined) {
    return {
      kind: structured.kind,
      amountMinor: structured.amountMinor,
      occurredOn: structured.occurredOn,
      accountId: structured.accountId,
      description: structured.description,
      currency: structured.currency,
      ...(structured.categoryId === undefined ? {} : { categoryId: structured.categoryId }),
    };
  }

  const match =
    /^CSV linha (\d+): ([0-9-]+); ([a-z_]+); (\d+) centavos; (.*)\. Revise antes de criar o lancamento final\.$/.exec(
      suggestion.explanation,
    );

  if (match === null) {
    return undefined;
  }

  const details = parseDescriptionDetails(match[5] ?? "");

  if (details.accountId === undefined) {
    return undefined;
  }

  return {
    occurredOn: match[2] ?? "",
    kind: (match[3] ?? "expense") as TransactionKind,
    amountMinor: Number(match[4]),
    description: details.description,
    accountId: details.accountId,
    currency: "BRL",
    ...(details.categoryId !== undefined ? { categoryId: details.categoryId } : {}),
  };
}

function parseDescriptionDetails(value: string): {
  description: string;
  accountId?: string;
  categoryId?: string;
} {
  const parts = value.split("; ");
  const description = parts[0]?.trim() ?? "";
  const accountPart = parts.find((part) => part.startsWith("conta "));
  const categoryPart = parts.find((part) => part.startsWith("categoria "));

  return {
    description,
    ...(accountPart !== undefined ? { accountId: accountPart.slice("conta ".length) } : {}),
    ...(categoryPart !== undefined ? { categoryId: categoryPart.slice("categoria ".length) } : {}),
  };
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
    ...(payload.destinationAccountId !== undefined
      ? { destinationAccountId: payload.destinationAccountId }
      : {}),
  };
}

function assertPending(suggestion: AiSuggestion): void {
  if (suggestion.status !== "pending_review") {
    throw new AiReviewQueueError(
      "AI_REVIEW_INVALID_TRANSITION",
      "Apenas sugestoes pendentes podem ser revisadas.",
    );
  }
}

function markSuggestionReviewed(
  context: TenantContext,
  suggestion: AiSuggestion,
  status: Extract<AiSuggestion["status"], "approved" | "edited" | "rejected">,
  now: string,
  targetEntityId?: string,
): AiSuggestion {
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
      "explanation" = $9, "provider" = $10, "model" = $11, "reviewedByUserId" = $12,
      "reviewedAt" = $13, "createdAt" = $14, "updatedAt" = $15
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

  for (const key of Object.keys(payload)) {
    changes[key] = "changed";
  }

  return changes;
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
  const payload = parseTransactionExtractionPayload(row.payload);
  if (payload !== undefined) suggestion.payload = payload;
  if (row.targetEntityId !== null) suggestion.targetEntityId = row.targetEntityId;
  if (row.provider !== null) suggestion.provider = row.provider;
  if (row.model !== null) suggestion.model = row.model;
  if (row.reviewedByUserId !== null) suggestion.reviewedByUserId = row.reviewedByUserId;
  if (row.reviewedAt !== null) suggestion.reviewedAt = row.reviewedAt.toISOString();

  return suggestion;
}

function isImportExtractionSuggestion(suggestion: AiSuggestion): boolean {
  return (
    suggestion.kind === "transaction_extraction" &&
    suggestion.sourceEntityId !== undefined &&
    suggestion.provider?.startsWith("solverfin-import") === true &&
    parseTransactionExtractionPayload(suggestion.payload) !== undefined
  );
}
