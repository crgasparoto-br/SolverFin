import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  executeTransactionBulkActionForContext,
  type TransactionBulkAction,
} from "./repositories/transaction-bulk-actions.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const BULK_ACTION_PATH = "/api/transactions/bulk-actions";

export async function handleTransactionBulkActionsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (request.method !== "POST" || request.pathname !== BULK_ACTION_PATH) return undefined;
  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );
    const body = requireObjectBody(request.body);
    const action = readAction(body.action);
    const transactionIds = readIds(body.transactionIds, "lançamentos");
    const groupIds = readIds(body.groupIds, "agrupamentos");
    const result = await executeTransactionBulkActionForContext(context, {
      action,
      transactionIds,
      groupIds,
    });
    return json(200, result);
  } catch (error) {
    const response = buildApiErrorResponse({ error: mapDomainError(error), correlationId });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

function readAction(value: unknown): TransactionBulkAction {
  if (value === "reconcile" || value === "unreconcile" || value === "void") return value;
  throw requestError(
    "TRANSACTION_BULK_ACTION_INVALID",
    "Escolha excluir, marcar como conciliado ou desmarcar conciliado.",
  );
}

function readIds(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw requestError("TRANSACTION_BULK_SELECTION_INVALID", `A seleção de ${label} é inválida.`);
  }
  return value;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return {};
  return body as Record<string, unknown>;
}

function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;
    return { code: error.code, statusCode, message: error.message };
  }
  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }
  return error;
}

function requestError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
