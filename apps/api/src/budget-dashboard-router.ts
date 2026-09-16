import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { summarizeBudgetDashboardForContext } from "./repositories/budget-dashboard.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const BUDGET_DASHBOARD_PATH = "/api/budgets/dashboard";

export async function handleBudgetDashboardApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (request.pathname !== BUDGET_DASHBOARD_PATH || request.method !== "GET") {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest({
      authorization: request.headers.authorization,
    });
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );
    const periodStartOn = request.query.get("periodStartOn") ?? "";
    const periodEndOn = request.query.get("periodEndOn") ?? "";
    const currency = request.query.get("currency") ?? undefined;
    const usage = await summarizeBudgetDashboardForContext(
      context,
      periodStartOn,
      periodEndOn,
      currency,
    );

    return json(200, { usage });
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });
    return json(response.statusCode, response.body);
  }
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof TenantError) {
    return {
      code: error.code,
      statusCode: error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403,
      message: error.message,
    };
  }
  if (error instanceof TenantAuthorizationError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  return error;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
