import { requireAuthenticatedRequest } from "./auth-service.js";
import { withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { handleAiReviewQueueApiRequest } from "./ai-review-queue-router.js";
import { recordCategoryCorrectionFromSuggestionForContext } from "./repositories/category-learning.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const APPROVE_PATH = /^\/api\/ai-review-queue\/([0-9a-f-]+)\/approve$/i;

export async function handleCategorizationAwareAiReviewQueueApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith("/api/ai-review-queue")) return undefined;

  const match = request.method === "POST" ? APPROVE_PATH.exec(request.pathname) : null;
  const categoryId = readOverrideCategoryId(request.body);
  if (match === null || categoryId === undefined) {
    return handleAiReviewQueueApiRequest(request);
  }

  const suggestionId = match[1];
  if (suggestionId === undefined) return handleAiReviewQueueApiRequest(request);
  const correlationId = resolveCorrelationId(request.headers);

  try {
    return await withSharedTransaction(async () => {
      const response = await handleAiReviewQueueApiRequest(request);
      if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        return response;
      }
      if (!isLearningEligibleApproval(response)) {
        return response;
      }

      const user = await requireAuthenticatedRequest(
        buildAuthHeaders(request.headers.authorization),
      );
      const context = await resolveRequestTenantContext(
        user,
        request.query.get("profileId") ?? undefined,
      );
      await recordCategoryCorrectionFromSuggestionForContext(
        context,
        suggestionId,
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

function isLearningEligibleApproval(response: ApiResponse): boolean {
  if (typeof response.body !== "object" || response.body === null || Array.isArray(response.body)) {
    return false;
  }
  const suggestion = (response.body as Record<string, unknown>).suggestion;
  if (typeof suggestion !== "object" || suggestion === null || Array.isArray(suggestion)) {
    return false;
  }
  const item = suggestion as Record<string, unknown>;
  if (item.kind !== "transaction_extraction") return false;
  const provider = typeof item.provider === "string" ? item.provider : "";
  return !provider.startsWith("solverfin-import");
}

function readOverrideCategoryId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const payloadOverride = (body as Record<string, unknown>).payloadOverride;
  if (
    typeof payloadOverride !== "object" ||
    payloadOverride === null ||
    Array.isArray(payloadOverride)
  ) {
    return undefined;
  }
  const categoryId = (payloadOverride as Record<string, unknown>).categoryId;
  return typeof categoryId === "string" && categoryId.trim().length > 0
    ? categoryId.trim()
    : undefined;
}

function buildAuthHeaders(authorization: string | undefined): Record<string, string> {
  return authorization === undefined ? {} : { authorization };
}
