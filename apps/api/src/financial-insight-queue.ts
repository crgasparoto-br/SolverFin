import {
  deduplicateEquivalentFinancialInsights,
  FINANCIAL_INSIGHT_PRIORITY_POLICY_VERSION,
  resolveFinancialInsightSeverity,
  sortFinancialInsightsByPriority,
  type FinancialInsightSeverity,
} from "@solverfin/ai";
import type { TenantContext } from "@solverfin/domain";
import {
  readAiSuggestionPayload,
  toPublicAiSuggestionPayload,
  type InsightSuggestionPayloadV2,
  type PublicInsightProposalV2,
} from "@solverfin/domain/ai-suggestion-payloads";

import { withSharedTransaction, type QueryExecutor } from "./db.js";
import { insertAuditLogEntry } from "./repositories/audit.js";

/**
 * Actionable financial insight queue (#621).
 *
 * The queue is the single logical set consumed by Dashboard and Inbox:
 * equivalence deduplication -> canonical priority ordering -> optional presentation limit.
 * Resolution and snooze are bound to one persisted snapshot (row + `dataFingerprint`); they
 * never silence other snapshots of the same type, category or currency.
 */
export const FINANCIAL_INSIGHT_QUEUE_STATES = ["active", "snoozed", "resolved"] as const;
export type FinancialInsightQueueState = (typeof FINANCIAL_INSIGHT_QUEUE_STATES)[number];

export const FINANCIAL_INSIGHT_SNOOZE_DAYS = [1, 7, 30] as const;
export type FinancialInsightSnoozeDays = (typeof FINANCIAL_INSIGHT_SNOOZE_DAYS)[number];

export const FINANCIAL_INSIGHT_QUEUE_DEFAULT_LIMIT = 20;
export const FINANCIAL_INSIGHT_QUEUE_MAX_LIMIT = 100;

export interface FinancialInsightQueueFilters {
  state?: FinancialInsightQueueState;
  limit?: number;
  offset?: number;
}

export interface FinancialInsightQueueItem {
  id: string;
  state: FinancialInsightQueueState;
  severity: FinancialInsightSeverity;
  /** Envelope fingerprint required as `expectedFingerprint` by resolve/snooze. */
  fingerprint: string;
  confidence?: number;
  snoozedUntil?: string;
  resolvedAt?: string;
  proposal: PublicInsightProposalV2;
}

export interface FinancialInsightQueuePage {
  priorityPolicyVersion: typeof FINANCIAL_INSIGHT_PRIORITY_POLICY_VERSION;
  state: FinancialInsightQueueState;
  total: number;
  offset: number;
  limit: number;
  nextOffset?: number;
  items: FinancialInsightQueueItem[];
}

export class FinancialInsightQueueError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "FinancialInsightQueueError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface InsightQueueRow {
  id: string;
  status: string;
  payload: unknown;
  snoozedUntil: Date | null;
  reviewedAt: Date | null;
}

interface QueueCandidate {
  row: InsightQueueRow;
  payload: InsightSuggestionPayloadV2;
  state: FinancialInsightQueueState;
}

export function parseFinancialInsightQueueFilters(
  query: URLSearchParams,
): FinancialInsightQueueFilters {
  const state = query.get("state") ?? "active";
  if (!(FINANCIAL_INSIGHT_QUEUE_STATES as readonly string[]).includes(state)) {
    throw new FinancialInsightQueueError(
      "FINANCIAL_INSIGHT_QUEUE_STATE_INVALID",
      "Estado da fila de insights inválido.",
      400,
    );
  }
  return {
    state: state as FinancialInsightQueueState,
    limit: readBoundedInteger(
      query.get("limit"),
      FINANCIAL_INSIGHT_QUEUE_DEFAULT_LIMIT,
      1,
      FINANCIAL_INSIGHT_QUEUE_MAX_LIMIT,
    ),
    offset: readBoundedInteger(query.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export async function listFinancialInsightQueueForContext(
  context: TenantContext,
  filters: FinancialInsightQueueFilters = {},
  now = new Date(),
): Promise<FinancialInsightQueuePage> {
  const state = filters.state ?? "active";
  const limit = filters.limit ?? FINANCIAL_INSIGHT_QUEUE_DEFAULT_LIMIT;
  const offset = filters.offset ?? 0;
  const rows = await withSharedTransaction((executeQuery) =>
    listInsightRows(context, executeQuery),
  );
  const candidates = rows
    .map((row) => toCandidate(row, now))
    .filter((candidate): candidate is QueueCandidate => candidate?.state === state);
  const deduplicated = deduplicateEquivalentFinancialInsights(candidates, (candidate) => ({
    ...priorityKey(candidate.payload),
    calculationVersion: candidate.payload.calculationVersion,
    snapshotId: candidate.row.id,
  }));
  const ordered = sortFinancialInsightsByPriority(deduplicated, (candidate) =>
    priorityKey(candidate.payload),
  );
  const pageItems = ordered.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;

  return {
    priorityPolicyVersion: FINANCIAL_INSIGHT_PRIORITY_POLICY_VERSION,
    state,
    total: ordered.length,
    offset,
    limit,
    ...(nextOffset < ordered.length ? { nextOffset } : {}),
    items: pageItems.map(toQueueItem),
  };
}

export async function resolveFinancialInsightForContext(
  context: TenantContext,
  suggestionId: string,
  input: { expectedFingerprint: string; correlationId?: string },
  now = new Date(),
): Promise<FinancialInsightQueueItem> {
  return withSharedTransaction(async (executeQuery) => {
    const candidate = await lockPendingInsight(
      context,
      suggestionId,
      input.expectedFingerprint,
      executeQuery,
      "resolved",
    );
    if (candidate.state === "resolved") return toQueueItem(candidate);

    const occurredAt = now.toISOString();
    const rows = await executeQuery<InsightQueueRow>(
      `update "AiSuggestion"
          set "status" = 'RESOLVED', "reviewedByUserId" = $4, "reviewedAt" = $5, "updatedAt" = $5
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
          and "kind" = 'INSIGHT' and "status" = 'PENDING_REVIEW'
        returning "id", "status", "payload", "snoozedUntil", "reviewedAt"`,
      [
        suggestionId,
        context.organizationId,
        context.financialProfileId,
        context.userId,
        occurredAt,
      ],
    );
    const updated = rows[0];
    if (updated === undefined) throw invalidTransition();
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "ai_suggestion",
      entityId: suggestionId,
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      reason: "Insight financeiro resolvido pelo usuario; nenhum dado financeiro foi alterado.",
      redactedChanges: { status: "changed", resolvedAt: "added" },
    });
    return toQueueItem({ row: updated, payload: candidate.payload, state: "resolved" });
  });
}

export async function snoozeFinancialInsightForContext(
  context: TenantContext,
  suggestionId: string,
  input: {
    expectedFingerprint: string;
    durationDays: FinancialInsightSnoozeDays;
    correlationId?: string;
  },
  now = new Date(),
): Promise<FinancialInsightQueueItem> {
  return withSharedTransaction(async (executeQuery) => {
    const candidate = await lockPendingInsight(
      context,
      suggestionId,
      input.expectedFingerprint,
      executeQuery,
    );
    const occurredAt = now.toISOString();
    const snoozedUntil = new Date(now.getTime() + input.durationDays * 86_400_000).toISOString();
    const rows = await executeQuery<InsightQueueRow>(
      `update "AiSuggestion"
          set "snoozedUntil" = $4, "updatedAt" = $5
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
          and "kind" = 'INSIGHT' and "status" = 'PENDING_REVIEW'
        returning "id", "status", "payload", "snoozedUntil", "reviewedAt"`,
      [suggestionId, context.organizationId, context.financialProfileId, snoozedUntil, occurredAt],
    );
    const updated = rows[0];
    if (updated === undefined) throw invalidTransition();
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "ai_suggestion",
      entityId: suggestionId,
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      reason: `Insight financeiro adiado por ${input.durationDays} dia(s) pelo usuario.`,
      redactedChanges: { snoozedUntil: "changed" },
    });
    return toQueueItem({ row: updated, payload: candidate.payload, state: "snoozed" });
  });
}

export function parseFinancialInsightSnoozeDays(value: unknown): FinancialInsightSnoozeDays {
  if (
    typeof value === "number" &&
    (FINANCIAL_INSIGHT_SNOOZE_DAYS as readonly number[]).includes(value)
  ) {
    return value as FinancialInsightSnoozeDays;
  }
  throw new FinancialInsightQueueError(
    "FINANCIAL_INSIGHT_SNOOZE_DURATION_INVALID",
    "Escolha adiar por 1, 7 ou 30 dias.",
    400,
  );
}

async function listInsightRows(
  context: TenantContext,
  executeQuery: QueryExecutor,
): Promise<InsightQueueRow[]> {
  return executeQuery<InsightQueueRow>(
    `select "id", "status", "payload", "snoozedUntil", "reviewedAt"
       from "AiSuggestion"
      where "organizationId" = $1 and "financialProfileId" = $2 and "kind" = 'INSIGHT'
        and "status" in ('PENDING_REVIEW', 'RESOLVED')
        and "payload"->>'payloadVersion' = '2'`,
    [context.organizationId, context.financialProfileId],
  );
}

async function lockPendingInsight(
  context: TenantContext,
  suggestionId: string,
  expectedFingerprint: string,
  executeQuery: QueryExecutor,
  idempotentState?: "resolved",
): Promise<QueueCandidate> {
  const rows = await executeQuery<InsightQueueRow>(
    `select "id", "status", "payload", "snoozedUntil", "reviewedAt"
       from "AiSuggestion"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "kind" = 'INSIGHT'
      for update`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  const payload = row === undefined ? undefined : readV2Insight(row.payload);
  if (row === undefined || payload === undefined) {
    throw new FinancialInsightQueueError(
      "FINANCIAL_INSIGHT_NOT_FOUND",
      "Insight não encontrado no perfil financeiro ativo.",
      404,
    );
  }
  if (payload.fingerprint !== expectedFingerprint) {
    throw new FinancialInsightQueueError(
      "AI_SUGGESTION_PAYLOAD_CONFLICT",
      "Este insight mudou. Atualize a fila antes de tentar novamente.",
      409,
    );
  }
  const status = row.status.toUpperCase();
  if (idempotentState === "resolved" && status === "RESOLVED") {
    return { row, payload, state: "resolved" };
  }
  if (status !== "PENDING_REVIEW") throw invalidTransition();
  return { row, payload, state: "active" };
}

function toCandidate(row: InsightQueueRow, now: Date): QueueCandidate | undefined {
  const payload = readV2Insight(row.payload);
  if (payload === undefined) return undefined;
  const status = row.status.toUpperCase();
  if (status === "RESOLVED") return { row, payload, state: "resolved" };
  if (status !== "PENDING_REVIEW") return undefined;
  const snoozed = row.snoozedUntil !== null && row.snoozedUntil.getTime() > now.getTime();
  return { row, payload, state: snoozed ? "snoozed" : "active" };
}

function toQueueItem(candidate: QueueCandidate): FinancialInsightQueueItem {
  const publicPayload = toPublicAiSuggestionPayload(candidate.payload, {
    includeScopedEntityIds: true,
  });
  if (publicPayload.suggestionKind !== "insight" || publicPayload.payloadVersion !== 2) {
    throw new Error("Unexpected insight payload projection.");
  }
  const { row } = candidate;
  return {
    id: row.id,
    state: candidate.state,
    severity: resolveFinancialInsightSeverity(candidate.payload),
    fingerprint: publicPayload.fingerprint,
    ...(publicPayload.confidence === undefined ? {} : { confidence: publicPayload.confidence }),
    ...(candidate.state === "snoozed" && row.snoozedUntil !== null
      ? { snoozedUntil: row.snoozedUntil.toISOString() }
      : {}),
    ...(candidate.state === "resolved" && row.reviewedAt !== null
      ? { resolvedAt: row.reviewedAt.toISOString() }
      : {}),
    proposal: publicPayload.proposal,
  };
}

function priorityKey(payload: InsightSuggestionPayloadV2) {
  return {
    insightKind: payload.insightKind,
    ...(payload.severity === undefined ? {} : { severity: payload.severity }),
    currency: payload.currency,
    periodStartOn: payload.periodStartOn,
    insightKey: payload.insightKey,
    dataFingerprint: payload.dataFingerprint,
  };
}

function readV2Insight(value: unknown): InsightSuggestionPayloadV2 | undefined {
  const read = readAiSuggestionPayload(value, "insight");
  if (read.state !== "current" || read.payload.suggestionKind !== "insight") return undefined;
  return read.payload.payloadVersion === 2 ? read.payload : undefined;
}

function invalidTransition(): FinancialInsightQueueError {
  return new FinancialInsightQueueError(
    "AI_REVIEW_INVALID_TRANSITION",
    "O insight já foi resolvido ou não está mais disponível.",
    409,
  );
}

function readBoundedInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new FinancialInsightQueueError(
      "FINANCIAL_INSIGHT_QUEUE_PAGINATION_INVALID",
      "Paginação da fila de insights inválida.",
      400,
    );
  }
  return value;
}
