import {
  ImportFileError,
  TenantAuthorizationError,
  TenantError,
  type CsvDelimiter,
  type CsvImportMapping,
  type ImportSourceKind,
  type ImportStatus,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  approveConsistentImportSuggestionForContext,
  approveConsistentSelectedImportSuggestionsForContext,
  createConsistentCsvImportBatchForContext,
  getConsistentImportBatchDetailForContext,
} from "./import-review-service.js";
import {
  ImportReviewError,
  discardImportBatchForContext,
  listImportBatchesForContext,
  previewCsvImportForContext,
  rejectImportSuggestionForContext,
  updateImportSuggestionForContext,
  type ImportSuggestionUpdatePayload,
} from "./repositories/imports.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type ImportBatchHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface ImportBatchRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: ImportBatchHandler;
}

const BASE_PATH = "/api/import-batches";
const routes: ImportBatchRoute[] = [];

route("GET", BASE_PATH, listImportBatchesHandler);
route("POST", `${BASE_PATH}/csv/preview`, previewCsvImportBatchHandler);
route("POST", `${BASE_PATH}/csv`, createCsvImportBatchHandler);
route("GET", `${BASE_PATH}/:importBatchId`, getImportBatchHandler);
route(
  "PATCH",
  `${BASE_PATH}/:importBatchId/suggestions/:suggestionId`,
  updateImportSuggestionHandler,
);
route(
  "POST",
  `${BASE_PATH}/:importBatchId/suggestions/:suggestionId/approve`,
  approveImportSuggestionHandler,
);
route(
  "POST",
  `${BASE_PATH}/:importBatchId/suggestions/:suggestionId/reject`,
  rejectImportSuggestionHandler,
);
route("POST", `${BASE_PATH}/:importBatchId/approve-selected`, approveSelectedHandler);
route("POST", `${BASE_PATH}/:importBatchId/discard`, discardImportBatchHandler);

export async function handleImportBatchesApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) return undefined;

  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);
  if (!match) return undefined;

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );
    return await match.route.handler(request, context, match.params);
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body:
        error instanceof ImportReviewError && error.details !== undefined
          ? { ...response.body, details: error.details }
          : response.body,
    };
  }
}

function route(method: string, path: string, handler: ImportBatchHandler): void {
  const paramNames: string[] = [];
  const patternSource = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment;
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
): { route: ImportBatchRoute; params: Record<string, string> } | undefined {
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

async function listImportBatchesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as ImportStatus | "all" | null;
  const sourceKind = request.query.get("sourceKind") as ImportSourceKind | null;
  return json(200, {
    importBatches: await listImportBatchesForContext(context, {
      ...(status ? { status } : {}),
      ...(sourceKind ? { sourceKind } : {}),
    }),
  });
}

async function previewCsvImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  if (body.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }
  return json(
    200,
    await previewCsvImportForContext(context, {
      originalFileName: requireString(body, "originalFileName"),
      content: requireString(body, "content"),
      accountId: requireString(body, "accountId"),
      consentAccepted: true,
      ...(readCsvMapping(body.csvMapping) === undefined
        ? {}
        : { csvMapping: readCsvMapping(body.csvMapping) as CsvImportMapping }),
      ...(readCsvDelimiter(body.csvDelimiter) === undefined
        ? {}
        : {
            csvDelimiter: readCsvDelimiter(body.csvDelimiter) as CsvDelimiter,
          }),
    }),
  );
}

async function createCsvImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  if (body.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }
  const result = await createConsistentCsvImportBatchForContext(context, {
    originalFileName: requireString(body, "originalFileName"),
    content: requireString(body, "content"),
    accountId: requireString(body, "accountId"),
    consentAccepted: true,
    ...(readCsvMapping(body.csvMapping) === undefined
      ? {}
      : { csvMapping: readCsvMapping(body.csvMapping) as CsvImportMapping }),
    ...(readCsvDelimiter(body.csvDelimiter) === undefined
      ? {}
      : { csvDelimiter: readCsvDelimiter(body.csvDelimiter) as CsvDelimiter }),
  });
  return json(result.duplicateBatch ? 200 : 201, result);
}

async function getImportBatchHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(
    200,
    await getConsistentImportBatchDetailForContext(context, requireParam(match, "importBatchId")),
  );
}

async function updateImportSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  return json(
    200,
    await updateImportSuggestionForContext(
      context,
      requireParam(match, "importBatchId"),
      requireParam(match, "suggestionId"),
      readSuggestionUpdate(body),
    ),
  );
}

async function approveImportSuggestionHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(
    200,
    await approveConsistentImportSuggestionForContext(
      context,
      requireParam(match, "importBatchId"),
      requireParam(match, "suggestionId"),
    ),
  );
}

async function rejectImportSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  return json(
    200,
    await rejectImportSuggestionForContext(
      context,
      requireParam(match, "importBatchId"),
      requireParam(match, "suggestionId"),
      body.reason === undefined ? undefined : String(body.reason),
    ),
  );
}

async function approveSelectedHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  if (!Array.isArray(body.suggestionIds)) {
    throw new ImportReviewError(
      "IMPORT_REVIEW_SELECTION_REQUIRED",
      "Informe as linhas selecionadas para confirmar.",
    );
  }
  return json(
    200,
    await approveConsistentSelectedImportSuggestionsForContext(
      context,
      requireParam(match, "importBatchId"),
      body.suggestionIds.map((value) => String(value)),
    ),
  );
}

async function discardImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  return json(
    200,
    await discardImportBatchForContext(
      context,
      requireParam(match, "importBatchId"),
      body.reason === undefined ? undefined : String(body.reason),
    ),
  );
}

function readSuggestionUpdate(body: Record<string, unknown>): ImportSuggestionUpdatePayload {
  const payload: ImportSuggestionUpdatePayload = {};
  if (body.occurredOn !== undefined) payload.occurredOn = requireString(body, "occurredOn");
  if (body.kind !== undefined) {
    const kind = String(body.kind);
    if (kind !== "income" && kind !== "expense") {
      throw new ImportReviewError("IMPORT_KIND_INVALID", "Tipo deve ser receita ou despesa.");
    }
    payload.kind = kind;
  }
  if (body.amountMinor !== undefined) {
    const value = Number(body.amountMinor);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ImportReviewError(
        "IMPORT_AMOUNT_INVALID",
        "Valor precisa ser um inteiro positivo em centavos.",
      );
    }
    payload.amountMinor = value;
  }
  if (body.description !== undefined) payload.description = requireString(body, "description");
  if (body.accountId !== undefined) payload.accountId = requireString(body, "accountId");
  if (body.categoryId === null) payload.categoryId = null;
  else if (body.categoryId !== undefined) payload.categoryId = requireString(body, "categoryId");
  if (Object.keys(payload).length === 0) {
    throw new ImportReviewError(
      "IMPORT_UPDATE_REQUIRED",
      "Informe ao menos um campo para corrigir a linha.",
    );
  }
  return payload;
}

function readCsvMapping(value: unknown): CsvImportMapping | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ImportReviewError(
      "IMPORT_CSV_MAPPING_INVALID",
      "Mapeamento CSV precisa ser um objeto.",
    );
  }
  const input = value as Record<string, unknown>;
  const mapping: CsvImportMapping = {};
  for (const key of ["date", "description", "amount", "kind", "externalId"] as const) {
    if (input[key] !== undefined) mapping[key] = String(input[key]);
  }
  return mapping;
}

function readCsvDelimiter(value: unknown): CsvDelimiter | undefined {
  if (value === undefined) return undefined;
  if (value !== "," && value !== ";") {
    throw new ImportReviewError(
      "IMPORT_CSV_DELIMITER_INVALID",
      "Separador CSV deve ser virgula ou ponto e virgula.",
    );
  }
  return value;
}

function optionalObjectBody(body: unknown): Record<string, unknown> {
  return body === undefined ? {} : requireObjectBody(body);
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Request body must be a JSON object.", 400);
  }
  return body as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ImportReviewError(
      "IMPORT_FIELD_REQUIRED",
      `Campo ${key} e obrigatorio para continuar.`,
    );
  }
  return value.trim();
}

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];
  if (!value) throw new AuthError("AUTH_SESSION_REQUIRED", "Missing required path parameter.", 400);
  return value;
}

function buildAuthHeaders(authorization: string | undefined): {
  authorization?: string;
} {
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
  if (error instanceof ImportFileError || error instanceof ImportReviewError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
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
