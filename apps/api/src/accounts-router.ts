import {
  TenantAuthorizationError,
  TenantError,
  type AccountKind,
  type AccountStatus,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  archiveAccountForContext,
  createAccountForContext,
  getAccountForContext,
  listAccountsForContext,
  updateAccountForContext,
} from "./repositories/accounts.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type AccountHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface AccountRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: AccountHandler;
}

const ACCOUNTS_BASE_PATH = "/api/accounts";
const routes: AccountRoute[] = [];

route("GET", ACCOUNTS_BASE_PATH, listAccountsHandler);
route("POST", ACCOUNTS_BASE_PATH, createAccountHandler);
route("GET", `${ACCOUNTS_BASE_PATH}/:accountId`, getAccountHandler);
route("PATCH", `${ACCOUNTS_BASE_PATH}/:accountId`, updateAccountHandler);
route("POST", `${ACCOUNTS_BASE_PATH}/:accountId/archive`, archiveAccountHandler);

export async function handleAccountsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(ACCOUNTS_BASE_PATH)) {
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

function route(method: string, path: string, handler: AccountHandler): void {
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
): { route: AccountRoute; params: Record<string, string> } | undefined {
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

async function listAccountsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status") as AccountStatus | "all" | null;
  const accounts = await listAccountsForContext(context, status ? { status } : {});

  return json(200, { accounts });
}

async function createAccountHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const account = await createAccountForContext(context, {
    name: String(body.name ?? ""),
    kind: body.kind as AccountKind,
    ...(body.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: Number(body.openingBalanceMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
  });

  return json(201, { account });
}

async function getAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const account = await getAccountForContext(context, requireParam(match, "accountId"));

  return json(200, { account });
}

async function updateAccountHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const account = await updateAccountForContext(context, requireParam(match, "accountId"), {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.kind !== undefined ? { kind: body.kind as AccountKind } : {}),
    ...(body.status !== undefined ? { status: body.status as AccountStatus } : {}),
    ...(body.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: Number(body.openingBalanceMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.maskedIdentifier !== undefined
      ? { maskedIdentifier: String(body.maskedIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
  });

  return json(200, { account });
}

async function archiveAccountHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const account = await archiveAccountForContext(context, requireParam(match, "accountId"));

  return json(200, { account });
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
    throw new AuthError("AUTH_SESSION_REQUIRED", `Missing required path parameter: ${name}.`, 400);
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
  if (error instanceof TenantError) {
    const statusCode = error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403;

    return { code: error.code, statusCode, message: error.message };
  }

  if (error instanceof TenantAuthorizationError) {
    return { code: error.code, statusCode: error.statusCode, message: error.message };
  }

  return error;
}
