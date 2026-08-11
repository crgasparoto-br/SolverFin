import { handleVersionedAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { ensureFinancialInsightsForContext } from "./financial-insight-scan.js";
import { tryHandleGeneralizedDeterministicDecisionForContext } from "./generalized-deterministic-review-decision.js";
import { scanPendingDeterministicReviewSuggestionsForContext } from "./generalized-deterministic-review-scan.js";
import { getAiSuggestionPayloadForContext } from "./repositories/ai-suggestion-payloads.js";
import { recordCategoryCorrectionFromSuggestionForContext } from "./repositories/category-learning.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const REVIEW_QUEUE_PATH = "/api/ai-review-queue";
const REVIEW_ACTION_PATH = /^\/api\/ai-review-queue\/([0-9a-f-]+)\/(approve|edit)$/i;
const DETERMINISTIC_ACTION_PATH = /^\/api\/ai-review-queue\/([0-9a-f-]+)\/(approve|reject)$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleCategorizationAwareAiReviewQueueApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(REVIEW_QUEUE_PATH)) return undefined;
  const correlationId = resolveCorrelationId(request.headers);

  try {
    if (request.method === "GET" && request.pathname === REVIEW_QUEUE_PATH) {
      const context = await resolveContext(request);
      await scanPendingDeterministicReviewSuggestionsForContext(context);
      try {
        await ensureFinancialInsightsForContext(context);
      } catch (error) {
        process.stderr.write(
          `[financial-insight-queue-diagnostic] scanner_failed ${error instanceof Error ? error.message : String(error)}\n`,
        );
        throw error;
      }
      const response = await handleVersionedAiReviewQueueApiRequest(request);
      if (response !== undefined && isRecord(response.body)) {
        const suggestions = Array.isArray(response.body.suggestions) ? response.body.suggestions : [];
        process.stderr.write(
          `[financial-insight-queue-diagnostic] ${JSON.stringify({
            statusCode: response.statusCode,
            count: suggestions.length,
            hasLearning: suggestions.some(
              (item) => isRecord(item) && item.provider === "solverfin-learning",
            ),
            hasExtraction: suggestions.some(
              (item) => isRecord(item) && item.kind === "transaction_extraction",
            ),
          })}\n`,
        );
      }
      return response;
    }

    const deterministicMatch =
      request.method === "POST" ? DETERMINISTIC_ACTION_PATH.exec(request.pathname) : null;
    if (deterministicMatch !== null) {
      const suggestionId = deterministicMatch[1];
      const action = deterministicMatch[2]?.toLowerCase();
      if (
        suggestionId !== undefined &&
        UUID_PATTERN.test(suggestionId) &&
        (action === "approve" || action === "reject")
      ) {
        const context = await resolveContext(request);
        const body = isRecord(request.body) ? request.body : {};
        const expectedFingerprint = readNonEmptyString(body.expectedFingerprint);
        const reason = readNonEmptyString(body.reason);
        const deterministic = await tryHandleGeneralizedDeterministicDecisionForContext(
          context,
          suggestionId,
          action,
          {
            ...(expectedFingerprint === undefined ? {} : { expectedFingerprint }),
            ...(reason === undefined ? {} : { reason }),
            correlationId,
          },
        );
        if (deterministic !== undefined) return json(200, deterministic);
      }
    }

    const match = request.method === "POST" ? REVIEW_ACTION_PATH.exec(request.pathname) : null;
    const categoryId = readCorrectionCategoryId(request.body, match?.[2]);
    if (match === null || categoryId === undefined) {
      return handleVersionedAiReviewQueueApiRequest(request);
    }

    const suggestionId = match[1];
    if (suggestionId === undefined) {
      return handleVersionedAiReviewQueueApiRequest(request);
    }
    const context = await resolveContext(request);

    return await withSharedTransaction(async () => {
      const before = await getAiSuggestionPayloadForContext(context, suggestionId);
      const learningSourceId = resolveLearningSourceId(before.payload, suggestionId, categoryId);
      const response = await handleVersionedAiReviewQueueApiRequest(request);
      if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        return response;
      }
      if (learningSourceId === undefined) return response;
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

async function resolveContext(request: ApiRequest) {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  return resolveRequestTenantContext(user, request.query.get("profileId") ?? undefined);
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

  if (suggestionKind !== "categorization" || proposal === undefined) {
    return undefined;
  }
  const currentCategoryId = readNonEmptyString(proposal.proposedCategoryId);
  if (currentCategoryId === categoryId) return undefined;

  const sourceSuggestionId = readNonEmptyString(proposal.sourceSuggestionId);
  if (sourceSuggestionId !== undefined) return sourceSuggestionId;

  const target = isRecord(payload.target) ? payload.target : undefined;
  return target?.entityKind === "import_suggestion"
    ? readNonEmptyString(proposal.targetEntityId)
    : undefined;
}

function readCorrectionCategoryId(body: unknown, action: string | undefined): string | undefined {
  if (!isRecord(body)) return undefined;
  if (action === "approve") {
    const payloadOverride = isRecord(body.payloadOverride) ? body.payloadOverride : undefined;
    return (
      readNonEmptyString(payloadOverride?.categoryId) ??
      readNonEmptyString(payloadOverride?.proposedCategoryId)
    );
  }
  if (action === "edit") {
    const payload = isRecord(body.payload) ? body.payload : undefined;
    return (
      readNonEmptyString(payload?.categoryId) ?? readNonEmptyString(payload?.proposedCategoryId)
    );
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

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
