import { financialInstitutionCatalog } from "@solverfin/domain";

import { requireMasterUser } from "./admin-auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  InstitutionLogoUploadError,
  uploadInstitutionLogo,
  type LogoStorageAdapter,
} from "./institution-logo-upload.js";
import {
  findFinancialInstitution,
  listFinancialInstitutions,
  persistFinancialInstitutionLogo,
  refreshFinancialInstitutionsFromDefaults,
  toDefaultInstitutionRecord,
  updateFinancialInstitutionStatus,
  type FinancialInstitutionRecord,
  type FinancialInstitutionStatus,
  type ListFinancialInstitutionsFilters,
  type ListFinancialInstitutionsResult,
} from "./repositories/financial-institutions.js";
import type { ApiRequest, ApiResponse } from "./router.js";

interface AdminInstitutionsSummary {
  total: number;
  active: number;
  withLogo: number;
  usingFallback: number;
  updatedAt: string | null;
}

interface AdminInstitutionsPagination {
  page: number;
  pageSize: number;
  total: number;
}

interface AdminInstitutionRepository {
  list(filters?: ListFinancialInstitutionsFilters): Promise<ListFinancialInstitutionsResult>;
  refresh(): Promise<number>;
  find(institutionKey: string): Promise<FinancialInstitutionRecord | undefined>;
  updateStatus(
    institutionKey: string,
    status: FinancialInstitutionStatus,
  ): Promise<FinancialInstitutionRecord | undefined>;
  persistLogo(
    institutionKey: string,
    logo: Parameters<typeof persistFinancialInstitutionLogo>[1],
  ): Promise<void>;
}

const defaultRepository: AdminInstitutionRepository = {
  list: listFinancialInstitutions,
  refresh: refreshFinancialInstitutionsFromDefaults,
  find: findFinancialInstitution,
  updateStatus: updateFinancialInstitutionStatus,
  persistLogo: persistFinancialInstitutionLogo,
};

const adminInstitutionRoutes = new Map<string, (request: ApiRequest) => Promise<ApiResponse>>([
  ["GET /api/admin/institutions", listAdminInstitutionsHandler],
  ["POST /api/admin/institutions/refresh", refreshAdminInstitutionsHandler],
]);

let logoStorageAdapterOverride: LogoStorageAdapter | undefined;
let repositoryOverride: AdminInstitutionRepository | undefined;

export function setLogoStorageAdapterForTests(adapter: LogoStorageAdapter | undefined): void {
  logoStorageAdapterOverride = adapter;
}

export function setAdminInstitutionRepositoryForTests(
  repository: AdminInstitutionRepository | undefined,
): void {
  repositoryOverride = repository;
}

export async function handleAdminInstitutionsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith("/api/admin/institutions")) {
    return undefined;
  }

  const uploadMatch = /^\/api\/admin\/institutions\/([^/]+)\/logo$/.exec(request.pathname);
  const statusMatch = /^\/api\/admin\/institutions\/([^/]+)\/status$/.exec(request.pathname);
  const handler = uploadMatch
    ? uploadInstitutionLogoHandler(uploadMatch[1] ?? "")
    : statusMatch
      ? updateInstitutionStatusHandler(statusMatch[1] ?? "")
      : adminInstitutionRoutes.get(`${request.method} ${request.pathname}`);

  if (
    !handler ||
    (uploadMatch && request.method !== "POST") ||
    (statusMatch && request.method !== "PATCH")
  ) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest(request.headers);
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

export function buildAdminInstitutionsPayload(
  institutions: FinancialInstitutionRecord[] = financialInstitutionCatalog.map(
    toDefaultInstitutionRecord,
  ),
  updatedAt: string | null = null,
  pagination?: AdminInstitutionsPagination,
): {
  institutions: FinancialInstitutionRecord[];
  summary: AdminInstitutionsSummary;
  pagination?: AdminInstitutionsPagination;
} {
  const payload = {
    institutions,
    summary: {
      total: pagination?.total ?? institutions.length,
      active: institutions.filter((institution) => institution.status === "active").length,
      withLogo: institutions.filter((institution) => institution.logoStatus !== "fallback").length,
      usingFallback: institutions.filter((institution) => institution.logoStatus === "fallback").length,
      updatedAt,
    },
    ...(pagination ? { pagination } : {}),
  };

  return payload;
}

async function listAdminInstitutionsHandler(request: ApiRequest): Promise<ApiResponse> {
  const filters = parseInstitutionFilters(request.query);
  const result = await repository().list(filters);

  return json(
    200,
    buildAdminInstitutionsPayload(result.institutions, null, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    }),
  );
}

async function refreshAdminInstitutionsHandler(request: ApiRequest): Promise<ApiResponse> {
  const refreshed = await repository().refresh();
  const result = await repository().list(parseInstitutionFilters(request.query));
  const updatedAt = new Date().toISOString();

  return json(200, {
    ...buildAdminInstitutionsPayload(result.institutions, updatedAt, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    }),
    operation: {
      status: "already_up_to_date",
      message: `Catálogo global sincronizado com ${refreshed} instituições padrão.`,
    },
  });
}

function uploadInstitutionLogoHandler(
  institutionKey: string,
): (request: ApiRequest) => Promise<ApiResponse> {
  return async (request) => {
    const decodedInstitutionKey = decodeURIComponent(institutionKey);
    const institution = await requireExistingInstitution(decodedInstitutionKey);

    if (institution.status !== "active") {
      throw new InstitutionLogoUploadError(
        "INSTITUTION_LOGO_INACTIVE_INSTITUTION",
        "Instituição financeira inativa não pode receber logomarca.",
        400,
      );
    }

    const body = requireObjectBody(request.body);
    const logo = await uploadInstitutionLogo(
      {
        institutionKey: decodedInstitutionKey,
        fileName: String(body.fileName ?? ""),
        mimeType: String(body.mimeType ?? ""),
        contentBase64: String(body.contentBase64 ?? ""),
      },
      logoStorageAdapterOverride,
      { key: institution.key, status: institution.status },
    );

    await repository().persistLogo(decodedInstitutionKey, logo);

    const result = await repository().list(parseInstitutionFilters(request.query));

    return json(200, {
      logo,
      ...buildAdminInstitutionsPayload(result.institutions, logo.uploadedAt, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
      operation: {
        status: "uploaded",
        message: "Logomarca enviada com sucesso.",
      },
    });
  };
}

function updateInstitutionStatusHandler(
  institutionKey: string,
): (request: ApiRequest) => Promise<ApiResponse> {
  return async (request) => {
    const status = parseStatusPayload(request.body);
    const updated = await repository().updateStatus(decodeURIComponent(institutionKey), status);

    if (!updated) {
      throw new InstitutionLogoUploadError(
        "INSTITUTION_LOGO_UNKNOWN_INSTITUTION",
        "Instituição financeira não encontrada no catálogo global.",
        404,
      );
    }

    const result = await repository().list(parseInstitutionFilters(request.query));

    return json(200, {
      institution: updated,
      ...buildAdminInstitutionsPayload(result.institutions, new Date().toISOString(), {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
      operation: {
        status: "updated",
        message: updated.status === "active" ? "Instituição ativada." : "Instituição desativada.",
      },
    });
  };
}

function parseInstitutionFilters(query: URLSearchParams): ListFinancialInstitutionsFilters {
  return {
    ...(readQuery(query, "q") ? { q: readQuery(query, "q") } : {}),
    status: parseStatusFilter(query.get("status")),
    logoStatus: parseLogoStatusFilter(query.get("logoStatus")),
    ...(readQuery(query, "bankCode") ? { bankCode: readQuery(query, "bankCode") } : {}),
    ...(readQuery(query, "ispb") ? { ispb: readQuery(query, "ispb") } : {}),
    ...(readQuery(query, "institutionType")
      ? { institutionType: readQuery(query, "institutionType") }
      : {}),
    ...(parseMissingFilter(query.get("missing"))
      ? { missing: parseMissingFilter(query.get("missing")) }
      : {}),
    ...(parsePositiveInteger(query.get("page"))
      ? { page: parsePositiveInteger(query.get("page")) }
      : {}),
    ...(parsePositiveInteger(query.get("pageSize"))
      ? { pageSize: parsePositiveInteger(query.get("pageSize")) }
      : {}),
    sort: parseSort(query.get("sort")),
    order: query.get("order") === "desc" ? "desc" : "asc",
  };
}

function parseStatusFilter(value: string | null): "active" | "inactive" | "all" {
  return value === "active" || value === "inactive" ? value : "all";
}

function parseLogoStatusFilter(
  value: string | null,
): "local_asset" | "r2_asset" | "fallback" | "all" {
  return value === "local_asset" || value === "r2_asset" || value === "fallback" ? value : "all";
}

function parseMissingFilter(value: string | null): "bankCode" | "ispb" | "logo" | undefined {
  if (value === "bankCode" || value === "ispb" || value === "logo") {
    return value;
  }

  return undefined;
}

function parseSort(value: string | null): ListFinancialInstitutionsFilters["sort"] {
  if (
    value === "label" ||
    value === "key" ||
    value === "bankCode" ||
    value === "ispb" ||
    value === "status" ||
    value === "updatedAt"
  ) {
    return value;
  }

  return "label";
}

function parsePositiveInteger(value: string | null): number | undefined {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseStatusPayload(body: unknown): FinancialInstitutionStatus {
  const status = String(requireObjectBody(body).status ?? "").trim().toUpperCase();

  if (status === "ACTIVE") return "active";
  if (status === "INACTIVE") return "inactive";

  throw new InstitutionLogoUploadError(
    "ADMIN_INSTITUTION_INVALID_STATUS",
    "Informe status ACTIVE ou INACTIVE.",
    400,
  );
}

async function requireExistingInstitution(
  institutionKey: string,
): Promise<FinancialInstitutionRecord> {
  const institution = await repository().find(institutionKey);

  if (!institution) {
    throw new InstitutionLogoUploadError(
      "INSTITUTION_LOGO_UNKNOWN_INSTITUTION",
      "Instituição financeira não encontrada no catálogo global.",
      404,
    );
  }

  return institution;
}

function readQuery(query: URLSearchParams, key: string): string | undefined {
  const value = query.get(key)?.trim();

  return value || undefined;
}

function repository(): AdminInstitutionRepository {
  return repositoryOverride ?? defaultRepository;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    return {};
  }

  return body as Record<string, unknown>;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
