import { createAiProviderFromEnvironment, type AiConsentState } from "@solverfin/ai";
import { TenantAuthorizationError, TenantError, type TenantContext } from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  FinancialAssistantRepositoryError,
  cancelFinancialAssistantConversation,
  clearFinancialAssistantConversation,
  getFinancialAssistantConversationForContext,
  startFinancialAssistantConversation,
  type FinancialAssistantConversationView,
} from "./financial-assistant-repository.js";
import {
  FinancialAssistantServiceError,
  sendFinancialAssistantMessage,
} from "./financial-assistant-service.js";
import { resolveAiProcessingConsentForContext } from "./repositories/ai-consent.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type FinancialAssistantHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface FinancialAssistantRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: FinancialAssistantHandler;
}

const BASE_PATH = "/api/financial-assistant";
const routes: FinancialAssistantRoute[] = [];

route("GET", BASE_PATH, getConversationHandler);
route("POST", `${BASE_PATH}/conversations`, startConversationHandler);
route("POST", `${BASE_PATH}/conversations/:conversationId/messages`, sendMessageHandler);
route("POST", `${BASE_PATH}/conversations/:conversationId/cancel`, cancelConversationHandler);
route("POST", `${BASE_PATH}/conversations/:conversationId/clear`, clearConversationHandler);

export async function handleFinancialAssistantApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) return undefined;
  const match = findRoute(request.method, request.pathname);
  if (!match) return undefined;
  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers));
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

async function getConversationHandler(
  _request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const conversation = await getFinancialAssistantConversationForContext(context);
  return json(200, { conversation: conversation ? presentConversation(conversation) : null });
}

async function startConversationHandler(
  _request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  return json(201, {
    conversation: presentConversation(await startFinancialAssistantConversation(context)),
  });
}

async function sendMessageHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const question = typeof body.question === "string" ? body.question : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string"
      ? body.idempotencyKey
      : request.headers["idempotency-key"] ?? "";
  const correlationId = resolveCorrelationId(request.headers);
  return json(200, {
    conversation: presentConversation(await sendFinancialAssistantMessage({
      context,
      conversationId: requireParam(match, "conversationId"),
      question,
      idempotencyKey,
      runtime: {
        selectProvider: () => createAiProviderFromEnvironment(process.env),
        resolveConsent: buildAuthoritativeFinancialAssistantConsentResolver(request, context),
        correlationId,
      },
    })),
  });
}

async function cancelConversationHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    conversation: presentConversation(
      await cancelFinancialAssistantConversation(context, requireParam(match, "conversationId")),
    ),
  });
}

async function clearConversationHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  await clearFinancialAssistantConversation(context, requireParam(match, "conversationId"));
  return json(200, { cleared: true });
}

export interface FinancialAssistantConsentResolverDependencies {
  authenticate: typeof requireAuthenticatedRequest;
  resolveContext: typeof resolveRequestTenantContext;
  resolveConsent: typeof resolveAiProcessingConsentForContext;
}

export function buildAuthoritativeFinancialAssistantConsentResolver(
  request: ApiRequest,
  expectedContext: TenantContext,
  dependencies: Partial<FinancialAssistantConsentResolverDependencies> = {},
): () => Promise<AiConsentState> {
  const authenticate = dependencies.authenticate ?? requireAuthenticatedRequest;
  const resolveContext = dependencies.resolveContext ?? resolveRequestTenantContext;
  const resolveConsent = dependencies.resolveConsent ?? resolveAiProcessingConsentForContext;
  return async () => {
    const user = await authenticate(buildAuthHeaders(request.headers));
    const currentContext = await resolveContext(user, request.query.get("profileId") ?? undefined);
    if (
      currentContext.userId !== expectedContext.userId ||
      currentContext.organizationId !== expectedContext.organizationId ||
      currentContext.financialProfileId !== expectedContext.financialProfileId
    ) {
      return "revoked";
    }
    return resolveConsent(expectedContext);
  };
}

function route(method: string, path: string, handler: FinancialAssistantHandler): void {
  const paramNames: string[] = [];
  const patternSource = path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      paramNames.push(segment.slice(1));
      return "([^/]+)";
    })
    .join("/");
  routes.push({ method, pattern: new RegExp(`^${patternSource}$`), paramNames, handler });
}

function findRoute(
  method: string,
  pathname: string,
): { route: FinancialAssistantRoute; params: Record<string, string> } | undefined {
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

function requireParam(match: Readonly<Record<string, string>>, name: string): string {
  const value = match[name];
  if (!value) throw new AuthError("AUTH_SESSION_REQUIRED", "Missing required path parameter.", 400);
  return value;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new FinancialAssistantServiceError(
      "ASSISTANT_BODY_INVALID",
      "Request body must be a JSON object.",
      400,
    );
  }
  return body as Record<string, unknown>;
}

function buildAuthHeaders(headers: Readonly<Record<string, string | undefined>>): {
  authorization?: string;
  cookie?: string;
} {
  return {
    ...(headers.authorization === undefined ? {} : { authorization: headers.authorization }),
    ...(headers.cookie === undefined ? {} : { cookie: headers.cookie }),
  };
}

export function presentFinancialAssistantConversation(
  view: FinancialAssistantConversationView,
) {
  return presentConversation(view);
}

function presentConversation(view: FinancialAssistantConversationView) {
  return {
    id: view.conversation.id,
    status: view.conversation.status,
    currency: view.conversation.currency,
    expiresAt: view.conversation.expiresAt.toISOString(),
    turns: view.turns.map((turn) => ({
      sequence: turn.sequence,
      status: turn.status,
      question: turn.normalizedQuestion,
      intent: turn.intent,
      filters: presentFilters(turn.filters),
      response: turn.safeResponse,
      createdAt: turn.createdAt.toISOString(),
      answeredAt: turn.answeredAt?.toISOString() ?? null,
    })),
  };
}

function presentFilters(filters: Readonly<Record<string, unknown>>) {
  return {
    ...(typeof filters.currency === "string" ? { currency: filters.currency } : {}),
    ...(typeof filters.periodStartOn === "string" ? { periodStartOn: filters.periodStartOn } : {}),
    ...(typeof filters.periodEndOn === "string" ? { periodEndOn: filters.periodEndOn } : {}),
    ...(typeof filters.categoryName === "string" ? { categoryName: filters.categoryName } : {}),
  };
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof FinancialAssistantRepositoryError || error instanceof FinancialAssistantServiceError) {
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
