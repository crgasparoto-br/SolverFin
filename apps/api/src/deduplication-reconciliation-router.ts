import {
  ImportFileError,
  TenantAuthorizationError,
  TenantError,
  deriveImportLineDirection,
  parseTransactionExtractionPayload,
  type AiSuggestion,
  type ImportTransactionSuggestion,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { query, withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import { refreshImportBatchStatusForContext } from "./repositories/imports.js";
import {
  DeterministicReviewSuggestionError,
  approveDeterministicReviewSuggestionForContext,
  createDeterministicImportReviewSuggestionsForContext,
  listDeterministicReviewSuggestionsForContext,
  rejectDeterministicReviewSuggestionForContext,
} from "./repositories/review-suggestions.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type DeduplicationHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface DeduplicationRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: DeduplicationHandler;
}

interface AiSuggestionRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  status: string;
  payload: unknown;
}

interface ImportBatchRow {
  id: string;
  status: string;
}

const routes: DeduplicationRoute[] = [];

route("GET", "/api/review-suggestions", listReviewSuggestionsHandler);
route(
  "POST",
  "/api/import-batches/:importBatchId/detect-duplicates",
  detectImportBatchDuplicatesHandler,
);
route("POST", "/api/review-suggestions/:suggestionId/approve", approveReviewSuggestionHandler);
route("POST", "/api/review-suggestions/:suggestionId/reject", rejectReviewSuggestionHandler);

export async function handleDeduplicationReconciliationApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (
    !request.pathname.startsWith("/api/review-suggestions") &&
    !request.pathname.includes("/detect-duplicates")
  )
    return undefined;

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
    const response = buildApiErrorResponse({ error: mapDomainError(error), correlationId });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

function route(method: string, path: string, handler: DeduplicationHandler): void {
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
  routes.push({ method, pattern: new RegExp(`^${patternSource}$`), paramNames, handler });
}

function findRoute(
  method: string,
  pathname: string,
): { route: DeduplicationRoute; params: Record<string, string> } | undefined {
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

async function listReviewSuggestionsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const kind = request.query.get("kind") as "deduplication" | "reconciliation" | null;
  const status = request.query.get("status") as AiSuggestion["status"] | "all" | null;
  const sourceEntityId = request.query.get("sourceEntityId") ?? undefined;
  const sourceSuggestionId = request.query.get("sourceSuggestionId") ?? undefined;
  return json(200, {
    suggestions: await listDeterministicReviewSuggestionsForContext(context, {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(sourceEntityId ? { sourceEntityId } : {}),
      ...(sourceSuggestionId ? { sourceSuggestionId } : {}),
    }),
  });
}

async function detectImportBatchDuplicatesHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const importBatchId = requireParam(match, "importBatchId");
  await assertImportBatchReviewable(context, importBatchId);
  const importSuggestions = await listImportTransactionSuggestionsForBatch(context, importBatchId);
  const result = await withSharedTransaction(async (executeQuery) => {
    const created = await createDeterministicImportReviewSuggestionsForContext(
      context,
      importBatchId,
      importSuggestions,
      new Date().toISOString(),
      executeQuery,
    );
    await refreshImportBatchStatusForContext(context, importBatchId, executeQuery);
    return created;
  });
  return json(200, { ...result, duplicateScan: true });
}

async function approveReviewSuggestionHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(
    200,
    await approveDeterministicReviewSuggestionForContext(
      context,
      requireParam(match, "suggestionId"),
    ),
  );
}

async function rejectReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = typeof request.body === "object" && request.body !== null ? request.body : {};
  const reason = (body as { reason?: unknown }).reason;
  return json(
    200,
    await rejectDeterministicReviewSuggestionForContext(
      context,
      requireParam(match, "suggestionId"),
      reason === undefined ? undefined : String(reason),
    ),
  );
}

async function assertImportBatchReviewable(
  context: TenantContext,
  importBatchId: string,
): Promise<void> {
  const rows = await query<ImportBatchRow>(
    `select "id", "status" from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );
  if (rows[0] === undefined) {
    throw new TenantAuthorizationError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Lote de importacao nao encontrado no perfil financeiro ativo.",
      404,
    );
  }
  if (rows[0].status !== "REVIEWING") {
    throw new DeterministicReviewSuggestionError(
      "IMPORT_BATCH_READ_ONLY",
      "Somente lotes em revisao podem executar uma nova analise deterministica.",
      409,
    );
  }
}

async function listImportTransactionSuggestionsForBatch(
  context: TenantContext,
  importBatchId: string,
): Promise<ImportTransactionSuggestion[]> {
  const rows = await query<AiSuggestionRow>(
    `select "id", "organizationId", "financialProfileId", "status", "payload" from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION' and "status" = 'PENDING_REVIEW'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId, importBatchId],
  );
  return rows.map((row) => {
    const payload = parseTransactionExtractionPayload(row.payload);
    if (payload === undefined) {
      throw new ImportFileError(
        "IMPORT_CSV_STRUCTURE_INVALID",
        "Linha de importacao nao contem payload estruturado para deduplicacao.",
      );
    }
    const direction = deriveImportLineDirection(payload);
    if (direction === undefined) {
      throw new ImportFileError(
        "IMPORT_CSV_STRUCTURE_INVALID",
        "Linha de importacao nao possui direcao estruturada para deduplicacao.",
      );
    }
    const transferAccounts =
      payload.kind === "transfer" &&
      payload.payloadVersion === 2 &&
      payload.accountId !== undefined &&
      payload.otherAccountId !== undefined
        ? { accountId: payload.accountId, otherAccountId: payload.otherAccountId }
        : undefined;
    if (payload.kind === "transfer" && transferAccounts === undefined) {
      throw new ImportFileError(
        "IMPORT_CSV_STRUCTURE_INVALID",
        "Transferencia importada nao possui as duas contas estruturadas.",
      );
    }
    return {
      id: row.id,
      payloadVersion: payload.payloadVersion,
      organizationId: row.organizationId,
      financialProfileId: row.financialProfileId,
      status: "pending_review",
      sourceKind: "csv",
      sourceHash: payload.sourceHash,
      sourceRowNumber: payload.sourceRowNumber,
      occurredOn: payload.occurredOn,
      description: payload.description,
      kind: payload.kind,
      direction,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      ...(transferAccounts ??
        (payload.accountId === undefined ? {} : { accountId: payload.accountId })),
      ...(payload.categoryId === undefined ? {} : { categoryId: payload.categoryId }),
      ...(payload.externalId === undefined ? {} : { externalId: payload.externalId }),
    };
  });
}

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];
  if (!value) throw new AuthError("AUTH_SESSION_REQUIRED", "Missing required path parameter.", 400);
  return value;
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
  if (error instanceof ImportFileError || error instanceof DeterministicReviewSuggestionError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }
  if (error instanceof TenantError) {
    return {
      code: error.code,
      statusCode: error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403,
      message: error.message,
    };
  }
  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }
  return error;
}
