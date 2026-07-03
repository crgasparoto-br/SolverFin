import {
  TenantAuthorizationError,
  TenantError,
  type AutomationRuleActions,
  type AutomationRuleConditions,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  AutomationRuleRepositoryError,
  applyAutomationRulesForContext,
  archiveAutomationRuleForContext,
  createAutomationRuleForContext,
  listAutomationRulesForContext,
  updateAutomationRuleForContext,
} from "./repositories/automation-rules.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

interface AutomationRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: AutomationHandler;
}

type AutomationHandler = (
  request: ApiRequest,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

type AutomationActionStatus = NonNullable<AutomationRuleActions["status"]>;

const BASE_PATH = "/api/automation-rules";
const routes: AutomationRoute[] = [];
const ALLOWED_ACTION_STATUSES: readonly AutomationActionStatus[] = [
  "planned",
  "posted",
  "reconciled",
  "suggested",
  "voided",
  "pending_review",
  "duplicate",
];

route("GET", BASE_PATH, listAutomationRulesHandler);
route("POST", BASE_PATH, createAutomationRuleHandler);
route("PATCH", `${BASE_PATH}/:ruleId`, updateAutomationRuleHandler);
route("POST", `${BASE_PATH}/:ruleId/archive`, archiveAutomationRuleHandler);
route("POST", `${BASE_PATH}/apply`, applyAutomationRulesHandler);

export async function handleAutomationRulesApiRequest(
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
    return await match.route.handler(request, match.params);
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

function route(method: string, path: string, handler: AutomationHandler): void {
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

  routes.push({ method, pattern: new RegExp(`^${patternSource}$`), paramNames, handler });
}

function findRoute(
  method: string,
  pathname: string,
): { route: AutomationRoute; params: Record<string, string> } | undefined {
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

async function listAutomationRulesHandler(request: ApiRequest): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const status = request.query.get("status") as "active" | "inactive" | "all" | null;

  return json(200, {
    rules: await listAutomationRulesForContext(context, status ?? "all"),
  });
}

async function createAutomationRuleHandler(request: ApiRequest): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const body = requireObjectBody(request.body);
  const priority = toOptionalNumber(body.priority);

  return json(201, {
    rule: await createAutomationRuleForContext(context, {
      name: String(body.name ?? ""),
      ...(priority !== undefined ? { priority } : {}),
      conditions: parseConditions(body),
      actions: parseActions(body),
      ...(body.explanation !== undefined ? { explanation: String(body.explanation) } : {}),
    }),
  });
}

async function updateAutomationRuleHandler(
  request: ApiRequest,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const context = await resolveContext(request);
  const body = requireObjectBody(request.body);
  const priority = toOptionalNumber(body.priority);

  return json(200, {
    rule: await updateAutomationRuleForContext(context, requireParam(match, "ruleId"), {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.priority !== undefined && priority !== undefined ? { priority } : {}),
      ...(hasConditionPayload(body) ? { conditions: parseConditions(body) } : {}),
      ...(hasActionPayload(body) ? { actions: parseActions(body) } : {}),
      ...(body.status !== undefined ? { status: parseStatus(body.status) } : {}),
      ...(body.explanation !== undefined ? { explanation: String(body.explanation) } : {}),
    }),
  });
}

async function archiveAutomationRuleHandler(
  request: ApiRequest,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const context = await resolveContext(request);

  return json(200, {
    rule: await archiveAutomationRuleForContext(context, requireParam(match, "ruleId")),
  });
}

async function applyAutomationRulesHandler(request: ApiRequest): Promise<ApiResponse> {
  const context = await resolveContext(request);

  return json(200, await applyAutomationRulesForContext(context));
}

async function resolveContext(request: ApiRequest) {
  const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));

  return resolveRequestTenantContext(user, request.query.get("profileId") ?? undefined);
}

function parseConditions(body: Readonly<Record<string, unknown>>): AutomationRuleConditions {
  const conditions: AutomationRuleConditions = {};
  const equalsMinor = toOptionalMinor(body.amountEqualsMinor ?? body.amountEquals);
  const minMinor = toOptionalMinor(body.amountMinMinor ?? body.amountMin);
  const maxMinor = toOptionalMinor(body.amountMaxMinor ?? body.amountMax);
  const amount: NonNullable<AutomationRuleConditions["amount"]> = {};

  if (body.descriptionIncludes !== undefined) {
    conditions.descriptionIncludes = String(body.descriptionIncludes);
  }

  if (body.merchantIncludes !== undefined) {
    conditions.merchantIncludes = String(body.merchantIncludes);
  }

  if (equalsMinor !== undefined) {
    amount.equalsMinor = equalsMinor;
  }

  if (minMinor !== undefined) {
    amount.minMinor = minMinor;
  }

  if (maxMinor !== undefined) {
    amount.maxMinor = maxMinor;
  }

  if (Object.keys(amount).length > 0) {
    conditions.amount = amount;
  }

  if (body.conditionAccountId !== undefined) {
    conditions.accountId = String(body.conditionAccountId);
  }

  if (body.conditionCardId !== undefined) {
    conditions.cardId = String(body.conditionCardId);
  }

  if (body.kind !== undefined) {
    conditions.kind = parseKind(body.kind);
  }

  return conditions;
}

function parseActions(body: Readonly<Record<string, unknown>>): AutomationRuleActions {
  const actions: AutomationRuleActions = {};

  if (body.actionCategoryId !== undefined) {
    actions.categoryId = String(body.actionCategoryId);
  }

  if (body.actionAccountId !== undefined) {
    actions.accountId = String(body.actionAccountId);
  }

  if (body.actionCardId !== undefined) {
    actions.cardId = String(body.actionCardId);
  }

  if (body.actionStatus !== undefined) {
    actions.status = parseActionStatus(body.actionStatus);
  }

  return actions;
}

function hasConditionPayload(body: Readonly<Record<string, unknown>>): boolean {
  return [
    "descriptionIncludes",
    "merchantIncludes",
    "amountEqualsMinor",
    "amountEquals",
    "amountMinMinor",
    "amountMin",
    "amountMaxMinor",
    "amountMax",
    "conditionAccountId",
    "conditionCardId",
    "kind",
  ].some((key) => body[key] !== undefined);
}

function hasActionPayload(body: Readonly<Record<string, unknown>>): boolean {
  return ["actionCategoryId", "actionAccountId", "actionCardId", "actionStatus"].some(
    (key) => body[key] !== undefined,
  );
}

function parseKind(value: unknown): "income" | "expense" | "transfer" {
  if (value === "income" || value === "expense" || value === "transfer") return value;
  throw new AutomationRuleRepositoryError(
    "AUTOMATION_RULE_KIND_INVALID",
    "Tipo de lancamento invalido.",
  );
}

function parseActionStatus(value: unknown): AutomationActionStatus {
  if (ALLOWED_ACTION_STATUSES.includes(value as AutomationActionStatus)) {
    return value as AutomationActionStatus;
  }

  throw new AutomationRuleRepositoryError(
    "AUTOMATION_RULE_ACTION_STATUS_INVALID",
    "Status sugerido pela regra invalido.",
  );
}

function parseStatus(value: unknown): "active" | "inactive" {
  if (value === "active" || value === "inactive") return value;
  throw new AutomationRuleRepositoryError(
    "AUTOMATION_RULE_STATUS_INVALID",
    "Status de regra invalido.",
  );
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalMinor(value: unknown): number | undefined {
  const parsed = toOptionalNumber(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new AutomationRuleRepositoryError(
      "AUTOMATION_RULE_BODY_REQUIRED",
      "Request body must be a JSON object.",
    );
  }

  return body as Record<string, unknown>;
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
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8" }, body };
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof AutomationRuleRepositoryError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;
    return { code: error.code, statusCode, message: error.message };
  }

  return error;
}
