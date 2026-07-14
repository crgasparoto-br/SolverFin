import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { requireMasterUser } from "./admin-auth.js";
import { auth, requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  getFinancialIndexStatus,
  importCdiRates,
  listAccountRemunerationConfigurations,
  processAccountRemunerations,
  saveAccountRemunerationConfiguration,
  type ImportCdiRatesInput,
  type SaveAccountRemunerationConfigurationInput,
} from "./repositories/account-remuneration-v2.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const CONFIGURATION_BASE_PATH = "/api/account-remuneration/configurations";
const ADMIN_STATUS_PATH = "/api/admin/financial-indexes/status";
const ADMIN_IMPORT_PATH = "/api/admin/financial-indexes/cdi/import";
const ADMIN_PROCESS_PATH = "/api/admin/account-remunerations/process";

export async function handleAccountRemunerationApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!isAccountRemunerationPath(request.pathname)) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    if (request.pathname.startsWith("/api/admin/")) {
      return await handleAdminRequest(request);
    }

    return await handleTenantRequest(request);
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

async function handleTenantRequest(request: ApiRequest): Promise<ApiResponse | undefined> {
  const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
  const context = await resolveRequestTenantContext(
    user,
    request.query.get("profileId") ?? undefined,
  );

  if (request.method === "GET" && request.pathname === CONFIGURATION_BASE_PATH) {
    const configurations = await listAccountRemunerationConfigurations(context);
    return json(200, { configurations });
  }

  const configurationMatch = new RegExp(`^${CONFIGURATION_BASE_PATH}/([^/]+)$`).exec(
    request.pathname,
  );

  if (request.method === "PUT" && configurationMatch?.[1]) {
    const body = requireObjectBody(request.body);
    const configuration = await saveAccountRemunerationConfiguration(
      context,
      decodeURIComponent(configurationMatch[1]),
      parseConfigurationPayload(body),
    );

    return json(200, {
      configuration,
      operation: {
        status: "updated",
        message: configuration.enabled
          ? "Remuneração da conta ativada."
          : "Remuneração da conta desativada.",
      },
    });
  }

  return undefined;
}

async function handleAdminRequest(request: ApiRequest): Promise<ApiResponse | undefined> {
  const user = await requireAuthenticatedRequest(request.headers);
  requireMasterUser(user);

  if (request.method === "GET" && request.pathname === ADMIN_STATUS_PATH) {
    return json(200, { status: await getFinancialIndexStatus() });
  }

  if (request.method === "POST" && request.pathname === ADMIN_IMPORT_PATH) {
    const body = requireObjectBody(request.body);
    return json(200, await importCdiRates(parseImportPeriod(body)));
  }

  if (request.method === "POST" && request.pathname === ADMIN_PROCESS_PATH) {
    const body = requireObjectBody(request.body);
    const processedOn = readOptionalString(body.processedOn);
    return json(200, await processAccountRemunerations(processedOn));
  }

  return undefined;
}

function isAccountRemunerationPath(pathname: string): boolean {
  return (
    pathname.startsWith(CONFIGURATION_BASE_PATH) ||
    pathname === ADMIN_STATUS_PATH ||
    pathname === ADMIN_IMPORT_PATH ||
    pathname === ADMIN_PROCESS_PATH
  );
}

function parseConfigurationPayload(
  body: Record<string, unknown>,
): SaveAccountRemunerationConfigurationInput {
  const enabled = parseBoolean(body.enabled);
  const remunerationPercent = readOptionalNumber(body.remunerationPercent);
  const startsOn = readOptionalString(body.startsOn);
  const categoryId = readOptionalString(body.categoryId);

  return {
    enabled,
    ...(remunerationPercent !== undefined ? { remunerationPercent } : {}),
    ...(startsOn !== undefined ? { startsOn } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
  };
}

function parseImportPeriod(body: Record<string, unknown>): ImportCdiRatesInput {
  const startsOn = readOptionalString(body.startsOn);
  const endsOn = readOptionalString(body.endsOn);

  return {
    ...(startsOn !== undefined ? { startsOn } : {}),
    ...(endsOn !== undefined ? { endsOn } : {}),
  };
}

function parseBoolean(value: unknown): boolean {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;

  throw requestError("BOOLEAN_INVALID", "Informe se a remuneração está ativa.");
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw requestError("NUMBER_INVALID", "Informe um percentual numérico válido.");
  }

  return parsed;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw requestError("REQUEST_BODY_INVALID", "Envie um objeto JSON válido.");
  }

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

export const accountRemunerationPaths = {
  configurationBase: CONFIGURATION_BASE_PATH,
  adminStatus: ADMIN_STATUS_PATH,
  adminImport: ADMIN_IMPORT_PATH,
  adminProcess: ADMIN_PROCESS_PATH,
} as const;
