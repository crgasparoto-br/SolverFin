import { readAiSuggestionPayload } from "@solverfin/domain/ai-suggestion-payloads";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { query, withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { handleImportBatchesApiRequest } from "./import-batches-router.js";
import { recordCategoryCorrectionFromSuggestionForContext } from "./repositories/category-learning.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const CORRECTION_PATH = /^\/api\/import-batches\/[^/]+\/suggestions\/([0-9a-f-]+)$/i;

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
      const user = await requireAuthenticatedRequest(
        buildAuthHeaders(request.headers.authorization),
      );
      const context = await resolveRequestTenantContext(
        user,
        request.query.get("profileId") ?? undefined,
      );
      const previousCategoryId = await readCurrentCategoryIdForUpdate(
        context.organizationId,
        context.financialProfileId,
        suggestionId,
      );

      const response = await handleImportBatchesApiRequest(request);
      if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
        return response;
      }

      if (previousCategoryId !== categoryId) {
        await recordCategoryCorrectionFromSuggestionForContext(
          context,
          suggestionId,
          categoryId,
          correlationId,
        );
      }
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

async function readCurrentCategoryIdForUpdate(
  organizationId: string,
  financialProfileId: string,
  suggestionId: string,
): Promise<string | undefined> {
  const rows = await query<{ payload: unknown }>(
    `select "payload" from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION'
     for update`,
    [suggestionId, organizationId, financialProfileId],
  );
  const rawPayload = rows[0]?.payload;
  if (rawPayload === undefined) return undefined;

  const result = readAiSuggestionPayload(rawPayload, "transaction_extraction");
  if (result.state !== "current" || result.payload.suggestionKind !== "transaction_extraction") {
    return undefined;
  }
  return result.payload.categoryId;
}

function readCorrectedCategoryId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const categoryId = (body as Record<string, unknown>).categoryId;
  return typeof categoryId === "string" && categoryId.trim().length > 0
    ? categoryId.trim()
    : undefined;
}

function buildAuthHeaders(authorization: string | undefined): Record<string, string> {
  return authorization === undefined ? {} : { authorization };
}
