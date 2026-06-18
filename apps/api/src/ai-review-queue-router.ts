import {
  TenantAuthorizationError,
  TenantError,
  TransactionError,
  type AiSuggestion,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  AiReviewQueueError,
  approveAiReviewSuggestionForContext,
  editAiReviewSuggestionForContext,
  listAiReviewQueueForContext,
  rejectAiReviewSuggestionForContext,
  type AiSuggestedTransactionDraft,
} from "./repositories/ai-review-queue.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type AiReviewQueueHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface AiReviewQueueRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: AiReviewQueueHandler;
}

const BASE_PATH = "/api/ai-review-queue";
const ALLOWED_TRANSACTION_KINDS = new Set(["income", "expense", "transfer"]);
const routes: AiReviewQueueRoute[] = [];

route("GET", BASE_PATH, listAiReviewQueueHandler);
route("POST", `${BASE_PATH}/:suggestionId/approve`, approveAiReviewSuggestionHandler);
route("POST", `${BASE_PATH}/:suggestionId/edit`, editAiReviewSuggestionHandler);
route("POST", `${BASE_PATH}/:suggestionId/reject`, rejectAiReviewSuggestionHandler);

export async function handleAiReviewQueueApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) {
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

async function listAiReviewQueueHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const kind = request.query.get("kind") as AiSuggestion["kind"] | null;
  const status = request.query.get("status") as AiSuggestion["status"] | "all" | null;
  const includeLowConfidence = request.query.get("includeLowConfidence") === "true";

  return json(200, {
    suggestions: await listAiReviewQueueForContext(context, {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      includeLowConfidence,
    }),
  });
}

async function approveAiReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);
  const payloadOverride = readPayload(body.payloadOverride);

  return json(
    200,
    await approveAiReviewSuggestionForContext(
      context,
      requireParam(match, "suggestionId"),
      payloadOverride,
    ),
  );
}

async function editAiReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const payload = readPayload(body.payload);

  if (payload === undefined) {
    throw new AiReviewQueueError(
      "AI_REVIEW_EDIT_PAYLOAD_REQUIRED",
      "Edicao de sugestao precisa informar os campos revisados.",
    );
  }

  return json(
    200,
    await editAiReviewSuggestionForContext(
      context,
      requireParam(match, "suggestionId"),
      payload,
      body.reason === undefined ? undefined : String(body.reason),
    ),
  );
}

async function rejectAiReviewSuggestionHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = optionalObjectBody(request.body);

  return json(
    200,
    await rejectAiReviewSuggestionForContext(
      context,
      requireParam(match, "suggestionId"),
      body.reason === undefined ? undefined : String(body.reason),
    ),
  );
}

function optionalObjectBody(body: unknown): Record<string, unknown> {
  if (body === undefined) {
    return {};
  }

  return requireObjectBody(body);
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new AuthError("AUTH_INVALID_CREDENTIALS", "Request body must be a JSON object.", 400);
  }

  return body as Record<string, unknown>;
}

function readPayload(value: unknown): Partial<AiSuggestedTransactionDraft> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    throw new AiReviewQueueError(
      "AI_REVIEW_PAYLOAD_INVALID",
      "Payload de revisao precisa ser um objeto.",
    );
  }

  const input = value as Record<string, unknown>;
  const payload: Partial<AiSuggestedTransactionDraft> = {};

  if (input.kind !== undefined) payload.kind = readTransactionKind(input.kind);
  if (input.amountMinor !== undefined) payload.amountMinor = readAmountMinor(input.amountMinor);
  if (input.occurredOn !== undefined) payload.occurredOn = String(input.occurredOn);
  if (input.accountId !== undefined) payload.accountId = String(input.accountId);
  if (input.description !== undefined) payload.description = String(input.description);
  if (input.currency !== undefined) payload.currency = String(input.currency);
  if (input.categoryId !== undefined) payload.categoryId = String(input.categoryId);
  if (input.destinationAccountId !== undefined)
    payload.destinationAccountId = String(input.destinationAccountId);

  return payload;
}

function readTransactionKind(value: unknown): AiSuggestedTransactionDraft["kind"] {
  const kind = String(value);

  if (!ALLOWED_TRANSACTION_KINDS.has(kind)) {
    throw new AiReviewQueueError(
      "AI_REVIEW_KIND_INVALID",
      "Tipo de lancamento informado na revisao nao e valido.",
    );
  }

  return kind as AiSuggestedTransactionDraft["kind"];
}

function readAmountMinor(value: unknown): number {
  const amountMinor = Number(value);

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new AiReviewQueueError(
      "AI_REVIEW_AMOUNT_INVALID",
      "Valor informado na revisao precisa ser um inteiro positivo em centavos.",
    );
  }

  return amountMinor;
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
  if (error instanceof AiReviewQueueError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof TransactionError) {
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
