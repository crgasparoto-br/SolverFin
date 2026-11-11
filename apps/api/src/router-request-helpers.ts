import { TenantAuthorizationError, TenantError } from "@solverfin/domain";
import { AuthError } from "./auth.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import type { PurchaseReconciliationFilter } from "./repositories/card-invoice-contracts.js";

export function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
}

export function readCardPurchaseFilters(request: ApiRequest) {
  const reconciliation = readReconciliationFilter(request.query.get("reconciliation"));

  return {
    ...(request.query.get("invoiceId")
      ? { invoiceId: String(request.query.get("invoiceId")) }
      : {}),
    ...(request.query.get("cardId") ? { cardId: String(request.query.get("cardId")) } : {}),
    ...(request.query.get("occurredFrom")
      ? { occurredFrom: String(request.query.get("occurredFrom")) }
      : {}),
    ...(request.query.get("occurredTo")
      ? { occurredTo: String(request.query.get("occurredTo")) }
      : {}),
    ...(reconciliation ? { reconciliation } : {}),
    ...(request.query.get("search") ? { search: String(request.query.get("search")) } : {}),
  };
}

function readReconciliationFilter(value: string | null): PurchaseReconciliationFilter | undefined {
  if (value === "all" || value === "reconciled" || value === "unreconciled") {
    return value;
  }

  return undefined;
}

export function readOptionalDate(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  const text = String(value);

  return text.trim() ? text : null;
}

export function readOptionalText(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  const text = String(value).trim();

  return text ? text : null;
}

export function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

export function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];

  if (!value) {
    throw new AuthError("AUTH_SESSION_REQUIRED", `Missing required path parameter: ${name}.`, 400);
  }

  return value;
}

export function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

export function mapDomainError(error: unknown): unknown {
  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;

    return { code: error.code, statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  return error;
}
