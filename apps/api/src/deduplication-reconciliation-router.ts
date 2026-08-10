import {
  TenantAuthorizationError,
  TenantError,
  type AiSuggestion,
  type TenantContext,
} from "@solverfin/domain";
import {
  readAiSuggestionPayload,
} from "@solverfin/domain/ai-suggestion-payloads";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { query, withSharedTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  tryHandleGeneralizedDeterministicDecisionForContext,
} from "./generalized-deterministic-review-decision.js";
import {
  scanPendingDeterministicReviewSuggestionsForContext,
} from "./generalized-deterministic-review-scan.js";
import { refreshImportBatchStatusForContext } from "./repositories/imports.js";
import {
  DeterministicReviewSuggestionError,
  approveDeterministicReviewSuggestionForContext,
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

interface DeterministicSuggestionPayloadRow {
  kind: string;
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
route(
  "POST",
  "/api/review-suggestions/:suggestionId/approve",
  approveReviewSuggestionHandler,
);
route(
  "POST",
  "/api/review-suggestions/:suggestionId/reject",
  rejectReviewSuggestionHandler,
);

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
    const user = await requireAuthenticatedRequest(
      buildAuthHeaders(request.headers.authorization),
    );
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

function route(
  method: string,
  path: string,
  handler: DeduplicationHandler,
): void {
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
  const kind = request.query.get("kind") as
    | "deduplication"
    | "reconciliation"
    | null;
  const status = request.query.get("status") as
    | AiSuggestion["status"]
    | "all"
    | null;
  const sourceEntityId = request.query.get("sourceEntityId") ?? undefined;
  const sourceSuggestionId =
    request.query.get("sourceSuggestionId") ?? undefined;
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
  await scanPendingDeterministicReviewSuggestionsForContext(context, {
    sourceEntityId: importBatchId,
  });
  await withSharedTransaction(async (executeQuery) =>
    refreshImportBatchStatusForContext(context, importBatchId, executeQuery),
  );
  const suggestions = await listDeterministicReviewSuggestionsForContext(
    context,
    {
      sourceEntityId: importBatchId,
      status: "pending_review",
    },
  );
  return json(200, {
    deduplicationSuggestions: suggestions.filter(
      (item) => item.kind === "deduplication",
    ),
    reconciliationSuggestions: suggestions.filter(
      (item) => item.kind === "reconciliation",
    ),
    duplicateScan: true,
  });
}

async function approveReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const suggestionId = requireParam(match, "suggestionId");
  const expectedFingerprint = await readCurrentDeterministicFingerprint(
    context,
    suggestionId,
  );
  if (expectedFingerprint !== undefined) {
    const result = await tryHandleGeneralizedDeterministicDecisionForContext(
      context,
      suggestionId,
      "approve",
      {
        expectedFingerprint,
        correlationId: resolveCorrelationId(request.headers),
      },
    );
    if (result !== undefined) return json(200, result);
  }
  return json(
    200,
    await approveDeterministicReviewSuggestionForContext(context, suggestionId),
  );
}

async function rejectReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const suggestionId = requireParam(match, "suggestionId");
  const body =
    typeof request.body === "object" && request.body !== null
      ? request.body
      : {};
  const reasonValue = (body as { reason?: unknown }).reason;
  const reason = reasonValue === undefined ? undefined : String(reasonValue);
  const expectedFingerprint = await readCurrentDeterministicFingerprint(
    context,
    suggestionId,
  );
  if (expectedFingerprint !== undefined) {
    const result = await tryHandleGeneralizedDeterministicDecisionForContext(
      context,
      suggestionId,
      "reject",
      {
        expectedFingerprint,
        ...(reason === undefined ? {} : { reason }),
        correlationId: resolveCorrelationId(request.headers),
      },
    );
    if (result !== undefined) return json(200, result);
  }
  return json(
    200,
    await rejectDeterministicReviewSuggestionForContext(
      context,
      suggestionId,
      reason,
    ),
  );
}

async function readCurrentDeterministicFingerprint(
  context: TenantContext,
  suggestionId: string,
): Promise<string | undefined> {
  const rows = await query<DeterministicSuggestionPayloadRow>(
    `select "kind", "payload" from "AiSuggestion"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
       and "kind" in ('DEDUPLICATION', 'RECONCILIATION')`,
    [suggestionId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const kind = row.kind.toLowerCase();
  if (kind !== "deduplication" && kind !== "reconciliation") return undefined;
  const read = readAiSuggestionPayload(row.payload, kind);
  return read.state === "current" ? read.payload.fingerprint : undefined;
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

function requireParam(
  match: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = match[name];
  if (!value)
    throw new AuthError(
      "AUTH_SESSION_REQUIRED",
      "Missing required path parameter.",
      400,
    );
  return value;
}

function buildAuthHeaders(
  authorization: string | undefined,
): { authorization?: string } {
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
  if (error instanceof DeterministicReviewSuggestionError) {
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
