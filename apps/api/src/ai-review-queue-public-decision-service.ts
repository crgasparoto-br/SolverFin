import { createHash } from "node:crypto";

import type { AiSuggestion, EntityId, TenantContext } from "@solverfin/domain";
import { AiSuggestionPayloadError } from "@solverfin/domain/ai-suggestion-payloads";

import {
  approveAiReviewDecisionForContext as approveAiReviewDecision,
  editAiReviewDecisionForContext as editAiReviewDecision,
  rejectAiReviewDecisionForContext as rejectAiReviewDecision,
  type AiReviewDecisionInput,
  type AiReviewDecisionResult,
} from "./ai-review-queue-decision-service.js";
import { withSharedTransaction, type QueryExecutor } from "./db.js";
import { AiReviewQueueError, type PersistedAiSuggestion } from "./repositories/ai-review-queue.js";
import { getAiSuggestionPayloadForContext } from "./repositories/ai-suggestion-payloads.js";
import { getTransactionForContext } from "./repositories/transactions.js";

interface ApprovedSuggestionRow {
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
  approvalReplayKey: string | null;
}

const APPROVED_SUGGESTION_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
  "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt"`;

export async function approveAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  return withSharedTransaction(async (executeQuery) => {
    const replayKey = buildApprovalReplayKey(input);
    const existingReplay = await readApprovedReplay(
      executeQuery,
      context,
      suggestionId,
      input,
      replayKey,
    );
    if (existingReplay !== undefined) return existingReplay;

    await assertSuppliedExpectedFingerprint(context, suggestionId, input.expectedFingerprint);

    try {
      const result = await approveAiReviewDecision(context, suggestionId, input);
      if (isIdempotentResult(result)) {
        const concurrentReplay = await readApprovedReplay(
          executeQuery,
          context,
          suggestionId,
          input,
          replayKey,
        );
        if (concurrentReplay !== undefined) return concurrentReplay;
        throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
      }

      if (replayKey !== undefined) {
        await persistApprovalReplayKey(executeQuery, context, suggestionId, replayKey);
      }
      return result;
    } catch (error) {
      if (
        input.expectedFingerprint === undefined ||
        !(error instanceof AiReviewQueueError) ||
        error.code !== "AI_REVIEW_INVALID_TRANSITION"
      ) {
        throw error;
      }

      const replay = await readApprovedReplay(
        executeQuery,
        context,
        suggestionId,
        input,
        replayKey,
      );
      if (replay === undefined) throw error;
      return replay;
    }
  });
}

export async function editAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  await assertSuppliedExpectedFingerprint(context, suggestionId, input.expectedFingerprint);
  return editAiReviewDecision(context, suggestionId, input);
}

export async function rejectAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  await assertSuppliedExpectedFingerprint(context, suggestionId, input.expectedFingerprint);
  return rejectAiReviewDecision(context, suggestionId, input);
}

export type { AiReviewDecisionInput };

async function assertSuppliedExpectedFingerprint(
  context: TenantContext,
  suggestionId: EntityId,
  expectedFingerprint: string | undefined,
): Promise<void> {
  if (expectedFingerprint === undefined) return;

  const detail = await getAiSuggestionPayloadForContext(context, suggestionId);
  if (detail.payload.fingerprint !== expectedFingerprint) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
  }
}

async function readApprovedReplay(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput,
  replayKey: string | undefined,
): Promise<AiReviewDecisionResult | undefined> {
  const row = await readApprovedSuggestion(executeQuery, context, suggestionId);
  if (row === undefined) return undefined;

  if (replayKey === undefined) {
    return approveAiReviewDecision(context, suggestionId, input);
  }

  if (row.approvalReplayKey !== null) {
    if (row.approvalReplayKey !== replayKey) {
      throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
    }
    return returnPersistedApproval(context, row, input);
  }

  const detail = await getAiSuggestionPayloadForContext(context, suggestionId);
  if (
    detail.payload.fingerprint !== input.expectedFingerprint ||
    !payloadMatchesPersistedApproval(row.payload, input.payload)
  ) {
    throw new AiSuggestionPayloadError("AI_SUGGESTION_PAYLOAD_CONFLICT");
  }
  return returnPersistedApproval(context, row, input);
}

async function readApprovedSuggestion(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: EntityId,
): Promise<ApprovedSuggestionRow | undefined> {
  const rows = await executeQuery<ApprovedSuggestionRow>(
    `select ${APPROVED_SUGGESTION_COLUMNS},
       (
         select "redactedChanges"->>'approvalReplayKey'
           from "AuditLogEntry"
          where "organizationId" = $2 and "financialProfileId" = $3
            and "entityKind" = 'AI_SUGGESTION' and "entityId" = $1 and "action" = 'APPROVE'
          order by "occurredAt" desc, "id" desc limit 1
       ) as "approvalReplayKey"
       from "AiSuggestion"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "status" = 'APPROVED'`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  return rows[0];
}

async function returnPersistedApproval(
  context: TenantContext,
  row: ApprovedSuggestionRow,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  const kind = row.kind.toLowerCase();
  const isGeneralExtraction =
    kind === "transaction_extraction" &&
    row.provider?.startsWith("solverfin-import") !== true;
  if (!isGeneralExtraction) {
    return approveAiReviewDecision(context, row.id, input);
  }

  const suggestion = mapPersistedSuggestion(row);
  if (row.targetEntityId === null) {
    return { suggestion, idempotent: true };
  }

  const transaction = await getTransactionForContext(context, row.targetEntityId);
  return { suggestion, transaction, idempotent: true };
}

async function persistApprovalReplayKey(
  executeQuery: QueryExecutor,
  context: TenantContext,
  suggestionId: EntityId,
  replayKey: string,
): Promise<void> {
  const rows = await executeQuery<{ id: string }>(
    `update "AuditLogEntry"
        set "redactedChanges" = coalesce("redactedChanges", '{}'::jsonb)
          || jsonb_build_object('approvalReplayKey', $4::text)
      where "id" = (
        select "id" from "AuditLogEntry"
         where "organizationId" = $1 and "financialProfileId" = $2
           and "entityKind" = 'AI_SUGGESTION' and "entityId" = $3 and "action" = 'APPROVE'
         order by "occurredAt" desc, "id" desc limit 1
      )
      returning "id"`,
    [context.organizationId, context.financialProfileId, suggestionId, replayKey],
  );
  if (rows.length !== 1) {
    throw new Error("AI review approval replay key could not be persisted atomically.");
  }
}

function buildApprovalReplayKey(input: AiReviewDecisionInput): string | undefined {
  if (input.expectedFingerprint === undefined) return undefined;
  const request = stableJson({
    expectedFingerprint: input.expectedFingerprint,
    payload: input.payload ?? null,
    reason: input.reason ?? null,
  });
  return `sha256-${createHash("sha256").update(request).digest("hex")}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function payloadMatchesPersistedApproval(
  persistedPayload: unknown,
  requestedPayload: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (requestedPayload === undefined || Object.keys(requestedPayload).length === 0) {
    return true;
  }
  if (!isRecord(persistedPayload)) return false;
  return Object.entries(requestedPayload).every(([key, value]) => {
    const persistedKey = key === "destinationAccountId" ? "otherAccountId" : key;
    return stableJson(persistedPayload[persistedKey]) === stableJson(value);
  });
}

function isIdempotentResult(result: AiReviewDecisionResult): boolean {
  return "idempotent" in result && result.idempotent === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapPersistedSuggestion(row: ApprovedSuggestionRow): PersistedAiSuggestion {
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
