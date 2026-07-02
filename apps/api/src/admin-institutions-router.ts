import { financialInstitutionCatalog } from "@solverfin/domain";

import { requireMasterUser } from "./admin-auth.js";
import { type AuthRequestHeaders } from "./auth.js";
import { auth, requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiRequest, ApiResponse } from "./router.js";

interface AdminInstitutionView {
  key: string;
  label: string;
  description: string;
  fallbackLabel: string;
  status: string;
  financialInstitutionCode: string;
  bankCode?: string;
  ispb?: string;
  logoAssetPath?: string;
  logoStatus: "local_asset" | "fallback";
}

interface AdminInstitutionsSummary {
  total: number;
  active: number;
  withLogo: number;
  usingFallback: number;
  updatedAt: string | null;
}

const adminInstitutionRoutes = new Map<string, (request: ApiRequest) => Promise<ApiResponse>>([
  ["GET /api/admin/institutions", listAdminInstitutionsHandler],
  ["POST /api/admin/institutions/refresh", refreshAdminInstitutionsHandler],
]);

export async function handleAdminInstitutionsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith("/api/admin/institutions")) {
    return undefined;
  }

  const handler = adminInstitutionRoutes.get(`${request.method} ${request.pathname}`);

  if (!handler) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    requireMasterUser(user);

    return await handler(request);
  } catch (error) {
    const response = buildApiErrorResponse({ error, correlationId });

    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

export function buildAdminInstitutionsPayload(updatedAt: string | null = null): {
  institutions: AdminInstitutionView[];
  summary: AdminInstitutionsSummary;
} {
  const institutions = financialInstitutionCatalog.map((institution) => ({
    key: institution.key,
    label: institution.label,
    description: institution.description,
    fallbackLabel: institution.fallbackLabel,
    status: institution.status,
    financialInstitutionCode: institution.financialInstitutionCode,
    ...(institution.bankCode !== undefined ? { bankCode: institution.bankCode } : {}),
    ...(institution.ispb !== undefined ? { ispb: institution.ispb } : {}),
    ...(institution.logoAssetPath !== undefined ? { logoAssetPath: institution.logoAssetPath } : {}),
    logoStatus: institution.logoAssetPath ? "local_asset" : "fallback",
  }));

  return {
    institutions,
    summary: {
      total: institutions.length,
      active: institutions.filter((institution) => institution.status === "active").length,
      withLogo: institutions.filter((institution) => institution.logoAssetPath).length,
      usingFallback: institutions.filter((institution) => !institution.logoAssetPath).length,
      updatedAt,
    },
  };
}

function listAdminInstitutionsHandler(): Promise<ApiResponse> {
  return Promise.resolve(json(200, buildAdminInstitutionsPayload()));
}

function refreshAdminInstitutionsHandler(): Promise<ApiResponse> {
  return Promise.resolve(
    json(200, {
      ...buildAdminInstitutionsPayload(new Date().toISOString()),
      operation: {
        status: "already_up_to_date",
        message: "Catalogo global atualizado de forma idempotente.",
      },
    }),
  );
}

function buildAuthHeaders(authorization: string | undefined): AuthRequestHeaders {
  return authorization === undefined ? {} : { authorization };
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

export function rememberAdminTestSession(sessionId: string, userId: string): void {
  auth.rememberSession({
    id: sessionId,
    userId,
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    expiresAt: new Date("2026-07-02T01:00:00.000Z"),
  });
}
