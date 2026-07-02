import { financialInstitutionCatalog } from "@solverfin/domain";

import { requireMasterUser } from "./admin-auth.js";
import { type AuthRequestHeaders } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  getUploadedInstitutionLogo,
  uploadInstitutionLogo,
  type LogoStorageAdapter,
} from "./institution-logo-upload.js";
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
  logoObjectKey?: string;
  logoUploadedAt?: string;
  logoStatus: "local_asset" | "r2_asset" | "fallback";
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

let logoStorageAdapterOverride: LogoStorageAdapter | undefined;

export function setLogoStorageAdapterForTests(adapter: LogoStorageAdapter | undefined): void {
  logoStorageAdapterOverride = adapter;
}

export async function handleAdminInstitutionsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith("/api/admin/institutions")) {
    return undefined;
  }

  const uploadMatch = /^\/api\/admin\/institutions\/([^/]+)\/logo$/.exec(request.pathname);
  const handler = uploadMatch
    ? uploadInstitutionLogoHandler(uploadMatch[1] ?? "")
    : adminInstitutionRoutes.get(`${request.method} ${request.pathname}`);

  if (!handler || (uploadMatch && request.method !== "POST")) {
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
  const institutions = financialInstitutionCatalog.map((institution) => {
    const uploadedLogo = getUploadedInstitutionLogo(institution.key);
    const logoAssetPath = uploadedLogo?.publicUrl ?? institution.logoAssetPath;

    return {
      key: institution.key,
      label: institution.label,
      description: institution.description,
      fallbackLabel: institution.fallbackLabel,
      status: institution.status,
      financialInstitutionCode: institution.financialInstitutionCode,
      ...(institution.bankCode !== undefined ? { bankCode: institution.bankCode } : {}),
      ...(institution.ispb !== undefined ? { ispb: institution.ispb } : {}),
      ...(logoAssetPath !== undefined ? { logoAssetPath } : {}),
      ...(uploadedLogo !== undefined ? { logoObjectKey: uploadedLogo.objectKey } : {}),
      ...(uploadedLogo !== undefined ? { logoUploadedAt: uploadedLogo.uploadedAt } : {}),
      logoStatus: uploadedLogo ? "r2_asset" : institution.logoAssetPath ? "local_asset" : "fallback",
    };
  });

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

function uploadInstitutionLogoHandler(
  institutionKey: string,
): (request: ApiRequest) => Promise<ApiResponse> {
  return async (request) => {
    const body = requireObjectBody(request.body);
    const logo = await uploadInstitutionLogo(
      {
        institutionKey: decodeURIComponent(institutionKey),
        fileName: String(body.fileName ?? ""),
        mimeType: String(body.mimeType ?? ""),
        contentBase64: String(body.contentBase64 ?? ""),
      },
      logoStorageAdapterOverride,
    );

    return json(200, {
      logo,
      ...buildAdminInstitutionsPayload(logo.uploadedAt),
      operation: {
        status: "uploaded",
        message: "Logomarca enviada com sucesso.",
      },
    });
  };
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    return {};
  }

  return body as Record<string, unknown>;
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
