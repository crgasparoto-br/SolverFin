import { requireAuthenticatedRequest } from "./auth-service.js";
import { withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { getAiSuggestionPayloadForContext } from "./repositories/ai-suggestion-payloads.js";
import { recordCategoryCorrectionFromSuggestionForContext } from "./repositories/category-learning.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const REVIEW_ACTION_PATH = /^\/api\/ai-review-queue\/([0-9a-f-]+)\/(approve|edit)$/i;

export async function handleCategorizationAwareAiReviewQueueApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith("/api/ai-review-queue")) return undefined;

  const match = request.method === "POST" ? REVIEW_ACTION_PATH.exec(request.pathname) : null;
  const categoryId = readCorrectionCategoryId(request.body, match?.[2]);
  if (match === null || categoryId === undefined) {
    return handleAiReviewQueueApiRequest(request);
  }

  const suggestionId = match[1];
  if (suggestionId === undefined) return handleAiReviewQueueApiRequest(request);
  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );

    return await withSharedTransaction(async () => {
      const before = await getAiSuggestionPayloadForContext(context, suggestionId);
      const learningSourceId = resolveLearningSourceId(before.payload, suggestionId, categoryId);
      const response = await handleAiReviewQueueApiRequest(request);
      if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        return response;
      }
      if (learningSourceId === undefined) {
        return response;
      }

      await recordCategoryCorrectionFromSuggestionForContext(
        context,
        learningSourceId,
        categoryId,
        correlationId,
      );
      return response;
    });
  } catch (error) {
    const response = buildApiErrorResponse({ error, correlationId });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

function resolveLearningSourceId(
  payload: unknown,
  suggestionId: string,
  categoryId: string,
): string | undefined {
  if (!isRecord(payload)) return undefined;
  const suggestionKind = payload.suggestionKind;
  const proposal = isRecord(payload.proposal) ? payload.proposal : undefined;

  if (suggestionKind === "transaction_extraction") {
    const currentCategoryId = readNonEmptyString(proposal?.categoryId);
    return currentCategoryId === categoryId ? undefined : suggestionId;
  }

  if (suggestionKind !== "categorization" || proposal === undefined) return undefined;
  const currentCategoryId = readNonEmptyString(proposal.proposedCategoryId);
  if (currentCategoryId === categoryId) return undefined;

  const sourceSuggestionId = readNonEmptyString(proposal.sourceSuggestionId);
  if (sourceSuggestionId !== undefined) return sourceSuggestionId;

  const target = isRecord(payload.target) ? payload.target : undefined;
  return target?.entityKind === "import_suggestion"
    ? readNonEmptyString(target.entityId)
    : undefined;
}

function readCorrectionCategoryId(body: unknown, action: string | undefined): string | undefined {
  if (!isRecord(body)) return undefined;

  if (action === "approve") {
    const payloadOverride = isRecord(body.payloadOverride) ? body.payloadOverride : undefined;
    return readNonEmptyString(payloadOverride?.categoryId) ??
      readNonEmptyString(payloadOverride?.proposedCategoryId);
  }

  if (action === "edit") {
    const payload = isRecord(body.payload) ? body.payload : undefined;
    return readNonEmptyString(payload?.categoryId) ?? readNonEmptyString(payload?.proposedCategoryId);
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildAuthHeaders(authorization: string | undefined): Record<string, string> {
  return authorization === undefined ? {} : { authorization };
}
