import { requireAuthenticatedRequest } from "./auth-service.js";
import { withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { recordCategoryCorrectionFromSuggestionForContext } from "./repositories/category-learning.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const CORRECTION_PATH =
  /^\/api\/import-batches\/[^/]+\/suggestions\/([0-9a-f-]+)$/i;

export async function handleCategorizationAwareImportBatchesApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith("/api/import-batches")) return undefined;

  const match = request.method === "PATCH" ? CORRECTION_PATH.exec(request.pathname) : null;
  const categoryId = readCorrectedCategoryId(request.body);
  if (match === null || categoryId === undefined) {
    return handleImportBatchesApiRequest(request);
  }

  const suggestionId = match[1];
  if (suggestionId === undefined) return handleImportBatchesApiRequest(request);
  const correlationId = resolveCorrelationId(request.headers);

  try {
    return await withSharedTransaction(async () => {
      const response = await handleImportBatchesApiRequest(request);
      if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        return response;
      }

      const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
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

function readCorrectedCategoryId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const categoryId = (body as Record<string, unknown>).categoryId;
  return typeof categoryId === "string" && categoryId.trim().length > 0
    ? categoryId.trim()
    : undefined;
}

function buildAuthHeaders(authorization: string | undefined): Record<string, string> {
  return authorization === undefined ? {} : { authorization };
}
