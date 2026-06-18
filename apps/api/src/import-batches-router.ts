import {
  ImportFileError,
  TenantAuthorizationError,
  TenantError,
  type CsvImportMapping,
  type ImportSourceKind,
  type ImportStatus,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  createCsvImportBatchForContext,
  getImportBatchDetailForContext,
  listImportBatchesForContext,
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

const IMPORT_BATCH_BASE_PATH = "/api/import-batches";
const routes: ImportBatchRoute[] = [];

route("GET", IMPORT_BATCH_BASE_PATH, listImportBatchesHandler);
route("POST", `${IMPORT_BATCH_BASE_PATH}/csv`, createCsvImportBatchHandler);
route("GET", `${IMPORT_BATCH_BASE_PATH}/:importBatchId`, getImportBatchHandler);

export async function handleImportBatchesApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(IMPORT_BATCH_BASE_PATH)) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);

  if (!match) {
    return undefined;
  }

  try {
    const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
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
      body: response.body,
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
): { route: ImportBatchRoute; params: Record<string, string> } | undefined {
  for (const candidate of routes) {
    if (candidate.method !== method) {
      continue;
    }

    const result = candidate.pattern.exec(pathname);

    if (!result) {
      continue;
    }

    const params: Record<string, string> = {};

    candidate.paramNames.forEach((name, index) => {
      const value = result[index + 1];

      if (value !== undefined) {
        params[name] = value;
      }
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

async function createCsvImportBatchHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const result = await createCsvImportBatchForContext(context, {
    originalFileName: String(body.originalFileName ?? "importacao.csv"),
    content: typeof body.content === "string" ? body.content : "",
    ...(body.csvMapping !== undefined ? { csvMapping: readCsvMapping(body.csvMapping) } : {}),
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
    await getImportBatchDetailForContext(context, requireParam(match, "importBatchId")),
  );
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];

  if (!value) {
    throw new AuthError("AUTH_SESSION_REQUIRED", `Missing required path parameter: ${name}.", 400);
  }

  return value;
}

function readCsvMapping(value: unknown): CsvImportMapping {
  if (typeof value !== "object" || value === null) {
    throw new ImportFileError("IMPORT_CSV_HEADER_INVALID", "csvMapping precisa ser um objeto.");
  }

  const input = value as Record<string, unknown>;
  const mapping: CsvImportMapping = {};

  if (input.date !== undefined) mapping.date = String(input.date);
  if (input.description !== undefined) mapping.description = String(input.description);
  if (input.amount !== undefined) mapping.amount = String(input.amount);
  if (input.kind !== undefined) mapping.kind = String(input.kind);
  if (input.accountId !== undefined) mapping.accountId = String(input.accountId);
  if (input.categoryId !== undefined) mapping.categoryId = String(input.categoryId);

  return mapping;
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
  if (error instanceof ImportFileError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;

    return { code: error.code, statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  return error;
}
