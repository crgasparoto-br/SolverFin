import { TenantAuthorizationError, TenantError, type InstallmentStatus } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  listInstallmentsForContext,
  type ListInstallmentsFilters,
} from "./repositories/installments.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

interface InstallmentsRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: InstallmentsHandler;
}

type InstallmentsHandler = (request: ApiRequest) => Promise<ApiResponse>;

const BASE_PATH = "/api/installments";
const routes: InstallmentsRoute[] = [];

route("GET", BASE_PATH, listInstallmentsHandler);

export async function handleInstallmentsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);

  if (!match) {
    return undefined;
  }

  try {
    return await match.route.handler(request);
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });

    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

function route(method: string, path: string, handler: InstallmentsHandler): void {
  const paramNames: string[] = [];
  const patternSource = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));

        return "([^/]+)";
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  routes.push({
    method,
    pattern: new RegExp(`^${patternSource}$`),
    paramNames,
    handler,
  });
}

function findRoute(
  method: string,
  pathname: string,
): { route: InstallmentsRoute; params: Record<string, string> } | undefined {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const result = candidate.pattern.exec(pathname);
    if (!result) continue;
    const params: Record<string, string> = {};
    candidate.paramNames.forEach((name, index) => {
      const value = result[index + 1];
      if (value !== undefined) params[name] = value;
    });
    return { route: candidate, params };
  }

  return undefined;
}

async function listInstallmentsHandler(request: ApiRequest): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const filters = readInstallmentFilters(request);

  return json(200, {
    installments: await listInstallmentsForContext(context, filters),
  });
}

async function resolveContext(request: ApiRequest) {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));

  return resolveRequestTenantContext(user, request.query.get("profileId") ?? undefined);
}

function readInstallmentFilters(request: ApiRequest): ListInstallmentsFilters {
  return {
    ...(request.query.get("transactionId")
      ? { transactionId: String(request.query.get("transactionId")) }
      : {}),
    ...(request.query.get("recurrenceId")
      ? { recurrenceId: String(request.query.get("recurrenceId")) }
      : {}),
    ...(request.query.get("cardId") ? { cardId: String(request.query.get("cardId")) } : {}),
    ...(request.query.get("cardInstrumentId")
      ? { cardInstrumentId: String(request.query.get("cardInstrumentId")) }
      : {}),
    ...(request.query.get("invoiceId")
      ? { invoiceId: String(request.query.get("invoiceId")) }
      : {}),
    ...(request.query.get("categoryId")
      ? { categoryId: String(request.query.get("categoryId")) }
      : {}),
    ...(request.query.get("dueFrom") ? { dueFrom: String(request.query.get("dueFrom")) } : {}),
    ...(request.query.get("dueTo") ? { dueTo: String(request.query.get("dueTo")) } : {}),
    ...(request.query.get("status")
      ? { status: request.query.get("status") as InstallmentStatus | "all" }
      : {}),
  };
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
