import {
  TenantAuthorizationError,
  TenantError,
  TransactionError,
  type AiSuggestion,
  type TenantContext,
} from "@solverfin/domain";
import { AiSuggestionPayloadError } from "@solverfin/domain/ai-suggestion-payloads";

import {
  AiSuggestionPayloadApiError,
  mapAiSuggestionPayloadPersistenceError,
} from "./ai-suggestion-payload-contract.js";
import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import {
  approveAiReviewDecisionForContext,
  editAiReviewDecisionForContext,
  rejectAiReviewDecisionForContext,
  type AiReviewDecisionInput,
} from "./ai-review-queue-public-decision-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  AiReviewQueueError,
  listAiReviewQueueForContext,
  type AiReviewQueueItem,
} from "./repositories/ai-review-queue.js";
import {
  AiSuggestionPayloadRepositoryError,
  getAiSuggestionPayloadForContext,
} from "./repositories/ai-suggestion-payloads.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type AiReviewQueueHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
  correlationId: string,
) => Promise<ApiResponse>;

interface AiReviewQueueRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: AiReviewQueueHandler;
}

interface PublicAiReviewQueueItem {
  id: string;
  kind: AiReviewQueueItem["kind"];
  status: AiReviewQueueItem["status"];
  origin: AiReviewQueueItem["origin"];
  confidence: number;
  risk: AiReviewQueueItem["risk"];
  explanation: string;
  maskedSummary: string;
  proposedTransaction?: AiReviewQueueItem["proposedTransaction"];
  provider?: string;
  createdAt: string;
  reviewedAt?: string;
}

const BASE_PATH = "/api/ai-review-queue";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const routes: AiReviewQueueRoute[] = [];

route("GET", BASE_PATH, listAiReviewQueueHandler);
route("GET", `${BASE_PATH}/:suggestionId/payload`, getAiSuggestionPayloadHandler);
route("POST", `${BASE_PATH}/:suggestionId/approve`, approveAiReviewSuggestionHandler);
route("POST", `${BASE_PATH}/:suggestionId/edit`, editAiReviewSuggestionHandler);
route("POST", `${BASE_PATH}/:suggestionId/reject`, rejectAiReviewSuggestionHandler);

export async function handleAiReviewQueueApiRequest(
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
    return await match.route.handler(request, context, match.params, correlationId);
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

function route(method: string, path: string, handler: AiReviewQueueHandler): void {
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
): { route: AiReviewQueueRoute; params: Record<string, string> } | undefined {
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

async function listAiReviewQueueHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const kind = request.query.get("kind") as AiSuggestion["kind"] | null;
  const status = request.query.get("status") as AiSuggestion["status"] | "all" | null;
  const includeLowConfidence = request.query.get("includeLowConfidence") === "true";
  const suggestions = await listAiReviewQueueForContext(context, {
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    includeLowConfidence,
  });

  return json(200, { suggestions: suggestions.map(toPublicQueueItem) });
}

function toPublicQueueItem(item: AiReviewQueueItem): PublicAiReviewQueueItem {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    origin: item.origin,
    confidence: item.confidence,
    risk: item.risk,
    explanation: item.explanation,
    maskedSummary: item.maskedSummary,
    ...(item.proposedTransaction === undefined
      ? {}
      : { proposedTransaction: item.proposedTransaction }),
    ...(item.provider === undefined ? {} : { provider: item.provider }),
    createdAt: item.createdAt,
    ...(item.reviewedAt === undefined ? {} : { reviewedAt: item.reviewedAt }),
  };
}

async function getAiSuggestionPayloadHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, await getAiSuggestionPayloadForContext(context, requireSuggestionId(match)));
}

async function approveAiReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
  correlationId: string,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  return json(
    200,
    await approveAiReviewDecisionForContext(
      context,
      requireSuggestionId(match),
      readDecisionInput(body, correlationId, "payloadOverride"),
    ),
  );
}

async function editAiReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
  correlationId: string,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  return json(
    200,
    await editAiReviewDecisionForContext(
      context,
      requireSuggestionId(match),
      readDecisionInput(body, correlationId, "payload", true),
    ),
  );
}

async function rejectAiReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
  correlationId: string,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  return json(
    200,
    await rejectAiReviewDecisionForContext(
      context,
      requireSuggestionId(match),
      readDecisionInput(body, correlationId),
    ),
  );
}

function readDecisionInput(
  body: Record<string, unknown>,
  correlationId: string,
  payloadField?: "payload" | "payloadOverride",
  payloadRequired = false,
): AiReviewDecisionInput {
  const payload = payloadField === undefined ? undefined : readOptionalObject(body[payloadField]);
  if (payloadRequired && payload === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_EDIT_PAYLOAD_REQUIRED",
      "Edicao de sugestao precisa informar os campos revisados.",
    );
  }
  const expectedFingerprint = readOptionalString(body.expectedFingerprint, "expectedFingerprint");
  if (expectedFingerprint === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED",
      "Informe a versao observada da sugestao antes de concluir a decisao.",
      428,
    );
  }
  const reason = readOptionalString(body.reason, "reason");
  return {
    ...(payload === undefined ? {} : { payload }),
    expectedFingerprint,
    ...(reason === undefined ? {} : { reason }),
    correlationId,
  };
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

function readOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AiReviewQueueError(
      "AI_REVIEW_PAYLOAD_INVALID",
      "Payload de revisao precisa ser um objeto.",
    );
  }
  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) {
    throw new AiReviewQueueError(
      "AI_REVIEW_REQUEST_INVALID",
      `O campo ${field} informado na revisao nao e valido.`,
      400,
    );
  }
  return value.trim();
}

function requireSuggestionId(match: Readonly<Record<string, string>>): string {
  const value = match.suggestionId;
  if (!value || !UUID_PATTERN.test(value)) {
    throw new AiReviewQueueError(
      "AI_REVIEW_SUGGESTION_ID_INVALID",
      "Identificador da sugestao nao e valido.",
      400,
    );
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
  if (isDatabasePayloadContractError(error) || error instanceof AiSuggestionPayloadError) {
    const mapped = mapAiSuggestionPayloadPersistenceError(error);
    return {
      code: mapped.code,
      statusCode: mapped.statusCode,
      message: mapped.message,
    };
  }
  if (error instanceof AiSuggestionPayloadApiError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof AiSuggestionPayloadRepositoryError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof AiReviewQueueError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof TransactionError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;
    return { code: error.code, statusCode, message: error.message };
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

function isDatabasePayloadContractError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P0001"
  );
}
