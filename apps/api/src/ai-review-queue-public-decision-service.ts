import type { AiSuggestion, EntityId, TenantContext } from "@solverfin/domain";

import {
  approveAiReviewDecisionForContext as approveAiReviewDecision,
  editAiReviewDecisionForContext,
  rejectAiReviewDecisionForContext,
  type AiReviewDecisionInput,
  type AiReviewDecisionResult,
} from "./ai-review-queue-decision-service.js";
import { query } from "./db.js";
import {
  AiReviewQueueError,
  type PersistedAiSuggestion,
} from "./repositories/ai-review-queue.js";
import { getTransactionForContext } from "./repositories/transactions.js";

interface ApprovedExtractionRow {
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

const APPROVED_EXTRACTION_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "payload", "provider", "model",
  "reviewedByUserId", "reviewedAt", "createdAt", "updatedAt"`;

export async function approveAiReviewDecisionForContext(
  context: TenantContext,
  suggestionId: EntityId,
  input: AiReviewDecisionInput,
): Promise<AiReviewDecisionResult> {
  try {
    return await approveAiReviewDecision(context, suggestionId, input);
  } catch (error) {
    if (!(error instanceof AiReviewQueueError) || error.code !== "AI_REVIEW_INVALID_TRANSITION") {
      throw error;
    }

    const replay = await readApprovedExtractionReplay(context, suggestionId);
    if (replay === undefined) throw error;
    return replay;
  }
}

export { editAiReviewDecisionForContext, rejectAiReviewDecisionForContext };
export type { AiReviewDecisionInput };

async function readApprovedExtractionReplay(
  context: TenantContext,
  suggestionId: EntityId,
): Promise<AiReviewDecisionResult | undefined> {
  const rows = await query<ApprovedExtractionRow>(
    `select ${APPROVED_EXTRACTION_COLUMNS} from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION' and "status" = 'APPROVED'`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;

  const suggestion = mapPersistedSuggestion(row);
  if (row.targetEntityId === null) {
    return { suggestion, idempotent: true };
  }

  const transaction = await getTransactionForContext(context, row.targetEntityId);
  return { suggestion, transaction, idempotent: true };
}

function mapPersistedSuggestion(row: ApprovedExtractionRow): PersistedAiSuggestion {
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
