import type { CategoryLearningStatus } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { applyIntelligentCategorizationForContext } from "./intelligent-categorization-service.js";
import {
  CategoryLearningRepositoryError,
  ignoreCategoryLearningForContext,
  listCategoryLearningForContext,
  recordCategoryCorrectionFromSuggestionForContext,
  revertCategoryLearningForContext,
} from "./repositories/category-learning.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const BASE_PATH = "/api/category-learning";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleCategoryLearningApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) return undefined;

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );

    if (request.method === "GET" && request.pathname === BASE_PATH) {
      return json(200, {
        entries: await listCategoryLearningForContext(
          context,
          readStatus(request.query.get("status")),
        ),
      });
    }

    if (request.method === "POST" && request.pathname === `${BASE_PATH}/apply`) {
      return json(
        200,
        await applyIntelligentCategorizationForContext(context, {
          correlationId,
        }),
      );
    }

    if (request.method === "POST" && request.pathname === `${BASE_PATH}/corrections`) {
      const body = requireObjectBody(request.body);
      return json(
        201,
        await recordCategoryCorrectionFromSuggestionForContext(
          context,
          requireUuid(body, "suggestionId"),
          requireUuid(body, "categoryId"),
          correlationId,
        ),
      );
    }

    const actionMatch = /^\/api\/category-learning\/([^/]+)\/(ignore|revert)$/.exec(
      request.pathname,
    );
    if (request.method === "POST" && actionMatch) {
      const entryId = requireUuidValue(actionMatch[1] ?? "", "entryId");
      const action = actionMatch[2];
      return json(
        200,
        action === "ignore"
          ? await ignoreCategoryLearningForContext(context, entryId, correlationId)
          : await revertCategoryLearningForContext(context, entryId, correlationId),
      );
    }

    return undefined;
  } catch (error) {
    const response = buildApiErrorResponse({ error, correlationId });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

function readStatus(value: string | null): CategoryLearningStatus | "all" {
  if (value === null || value === "" || value === "all") return "all";
  if (value === "active" || value === "ignored" || value === "reverted") {
    return value;
  }
  throw new CategoryLearningRepositoryError(
    "CATEGORY_LEARNING_STATUS_INVALID",
    "Status de aprendizado invalido.",
  );
}

function requireObjectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CategoryLearningRepositoryError(
      "CATEGORY_LEARNING_BODY_REQUIRED",
      "Informe os dados da correcao.",
    );
  }
  return value as Record<string, unknown>;
}

function requireUuid(body: Record<string, unknown>, field: string): string {
  return requireUuidValue(String(body[field] ?? ""), field);
}

function requireUuidValue(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new CategoryLearningRepositoryError(
      "CATEGORY_LEARNING_ID_INVALID",
      `${field} precisa ser um identificador valido.`,
    );
  }
  return value;
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
