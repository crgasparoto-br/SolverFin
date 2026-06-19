import {
  ImportFileError,
  TenantAuthorizationError,
  TenantError,
  type AiSuggestion,
  type ImportTransactionSuggestion,
  type TenantContext,
  type TransactionKind,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { query, withTransaction } from "./db.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
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
  kind: string;
  status: string;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  confidence: string | number;
  explanation: string;
  provider: string | null;
  model: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ImportBatchRow {
  id: string;
}

const routes: DeduplicationRoute[] = [];
const AI_SUGGESTION_SELECT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "sourceEntityId", "targetEntityId", "confidence", "explanation", "provider", "model", "reviewedByUserId",
  "reviewedAt", "createdAt", "updatedAt"`;

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
  ) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);
  const match = findRoute(request.method, request.pathname);

  if (!match) {
    return undefined;
  }

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

async function listReviewSuggestionsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const kind = request.query.get("kind") as "deduplication" | "reconciliation" | null;
  const status = request.query.get("status") as AiSuggestion["status"] | "all" | null;
  const sourceEntityId = request.query.get("sourceEntityId") ?? undefined;

  return json(200, {
    suggestions: await listDeterministicReviewSuggestionsForContext(context, {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(sourceEntityId ? { sourceEntityId } : {}),
    }),
  });
}

async function detectImportBatchDuplicatesHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const importBatchId = requireParam(match, "importBatchId");
  await assertImportBatchExists(context, importBatchId);

  const existing = await listDeterministicReviewSuggestionsForContext(context, {
    sourceEntityId: importBatchId,
  });

  if (existing.length > 0) {
    return json(200, {
      deduplicationSuggestions: existing.filter((suggestion) => suggestion.kind === "deduplication"),
      reconciliationSuggestions: existing.filter(
        (suggestion) => suggestion.kind === "reconciliation",
      ),
      duplicateScan: true,
    });
  }

  const importSuggestions = await listImportTransactionSuggestionsForBatch(context, importBatchId);
  const now = new Date().toISOString();
  const result = await withTransaction((executeQuery) =>
    createDeterministicImportReviewSuggestionsForContext(
      context,
      importBatchId,
      importSuggestions,
      now,
      executeQuery,
    ),
  );

  return json(201, result);
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

async function assertImportBatchExists(
  context: TenantContext,
  importBatchId: string,
): Promise<void> {
  const rows = await query<ImportBatchRow>(
    `select "id" from "ImportBatch"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [importBatchId, context.organizationId, context.financialProfileId],
  );

  if (rows.length === 0) {
    throw new TenantAuthorizationError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Lote de importacao nao encontrado no perfil financeiro ativo.",
      404,
    );
  }
}

async function listImportTransactionSuggestionsForBatch(
  context: TenantContext,
  importBatchId: string,
): Promise<ImportTransactionSuggestion[]> {
  const rows = await query<AiSuggestionRow>(
    `select ${AI_SUGGESTION_SELECT_COLUMNS} from "AiSuggestion"
     where "organizationId" = $1 and "financialProfileId" = $2 and "sourceEntityId" = $3
       and "kind" = 'TRANSACTION_EXTRACTION'
     order by "createdAt" asc`,
    [context.organizationId, context.financialProfileId, importBatchId],
  );

  return rows.map((row) => parseImportSuggestion(row, context));
}

function parseImportSuggestion(
  row: AiSuggestionRow,
  context: TenantContext,
): ImportTransactionSuggestion {
  const match = /^CSV linha (\d+): ([0-9-]+); ([a-z_]+); (\d+) centavos; (.*)\. Revise antes de criar o lancamento final\.$/.exec(
    row.explanation,
  );

  if (match === null) {
    throw new ImportFileError(
      "IMPORT_CSV_HEADER_INVALID",
      "Sugestao de importacao nao contem dados suficientes para deduplicacao deterministica.",
    );
  }

  const details = parseDescriptionDetails(match[5] ?? "");

  return {
    id: row.id,
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    status: "pending_review",
    sourceKind: "csv",
    sourceHash: row.id,
    sourceRowNumber: Number(match[1]),
    occurredOn: match[2] ?? "",
    description: details.description,
    kind: (match[3] ?? "expense") as TransactionKind,
    amountMinor: Number(match[4]),
    currency: "BRL",
    ...(details.accountId !== undefined ? { accountId: details.accountId } : {}),
    ...(details.categoryId !== undefined
      ? { categoryId: details.categoryId }
      : {}),
  };
}

function parseDescriptionDetails(value: string): {
  description: string;
  accountId?: string;
  categoryId?: string;
} {
  const parts = value.split("; ");
  const description = parts[0]?.trim() ?? "";
  const accountPart = parts.find((part) => part.startsWith("conta "));
  const categoryPart = parts.find((part) => part.startsWith("categoria "));

  return {
    description,
    ...(accountPart !== undefined ? { accountId: accountPart.slice("conta ".length) } : {}),
    ...(categoryPart !== undefined
      ? { categoryId: categoryPart.slice("categoria ".length) }
      : {}),
  };
}

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];

  if (!value) {
    throw new AuthError("AUTH_SESSION_REQUIRED", "Missing required path parameter.", 400);
  }

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
  if (error instanceof ImportFileError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof DeterministicReviewSuggestionError) {
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
