import {
  TenantAuthorizationError,
  TenantError,
  type BankMessageInboxOrigin,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  createBankMessageInboxForContext,
  discardBankMessageInboxForContext,
  listBankMessageInboxForContext,
  mapBankMessageInboxError,
} from "./repositories/bank-message-inbox.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

type BankMessageInboxHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface BankMessageInboxRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: BankMessageInboxHandler;
}

const BASE_PATH = "/api/bank-message-inbox";
const routes: BankMessageInboxRoute[] = [];

route("GET", BASE_PATH, listBankMessageInboxHandler);
route("POST", BASE_PATH, createBankMessageInboxHandler);
route("POST", `${BASE_PATH}/:messageId/discard`, discardBankMessageInboxHandler);

export async function handleBankMessageInboxApiRequest(
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

function route(method: string, path: string, handler: BankMessageInboxHandler): void {
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
): { route: BankMessageInboxRoute; params: Record<string, string> } | undefined {
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

async function listBankMessageInboxHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const status = request.query.get("status");

  return json(200, {
    messages: await listBankMessageInboxForContext(context, {
      ...(status ? { status } : {}),
    }),
  });
}

async function createBankMessageInboxHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const origin = readOrigin(body.origin);
  const consentAccepted =
    body.consentAccepted === true ||
    body.consentAccepted === "true" ||
    body.consentAccepted === "on";

  return json(201, {
    message: await createBankMessageInboxForContext(context, {
      origin,
      text: typeof body.text === "string" ? body.text : "",
      consentAccepted,
      ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
      ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
    }),
  });
}

async function discardBankMessageInboxHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    message: await discardBankMessageInboxForContext(context, requireParam(match, "messageId")),
  });
}

function readOrigin(value: unknown): BankMessageInboxOrigin {
  if (value === "shared") {
    return "shared";
  }

  return "pasted";
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
  const mappedInboxError = mapBankMessageInboxError(error);

  if (mappedInboxError !== error) {
    return mappedInboxError;
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
