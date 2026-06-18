import {
  TenantAuthorizationError,
  TenantError,
  type PayableReceivableKind,
  type PayableReceivableStatus,
  type TenantContext,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  cancelPayableReceivableForContext,
  createPayableReceivableForContext,
  getPayableReceivableForContext,
  listPayableReceivablesForContext,
  settlePayableReceivableForContext,
  updatePayableReceivableForContext,
} from "./repositories/payables-receivables.js";
import { resolveRequestTenantContext } from "./tenant-context.js";
import type { ApiRequest, ApiResponse } from "./router.js";

type PayableReceivableHandler = (
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
) => Promise<ApiResponse>;

interface PayableReceivableRoute {
  method: string;
  pattern: RegExp;
  paramNames: readonly string[];
  handler: PayableReceivableHandler;
}

const PAYABLE_RECEIVABLE_BASE_PATH = "/api/payables-receivables";
const routes: PayableReceivableRoute[] = [];

route("GET", PAYABLE_RECEIVABLE_BASE_PATH, listPayableReceivablesHandler);
route("POST", PAYABLE_RECEIVABLE_BASE_PATH, createPayableReceivableHandler);
route("GET", `${PAYABLE_RECEIVABLE_BASE_PATH}/:payableReceivableId`, getPayableReceivableHandler);
route("PATCH", `${PAYABLE_RECEIVABLE_BASE_PATH}/:payableReceivableId`, updatePayableReceivableHandler);
route("POST", `${PAYABLE_RECEIVABLE_BASE_PATH}/:payableReceivableId/settle`, settlePayableReceivableHandler);
route("POST", `${PAYABLE_RECEIVABLE_BASE_PATH}/:payableReceivableId/cancel`, cancelPayableReceivableHandler);

export async function handlePayablesReceivablesApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(PAYABLE_RECEIVABLE_BASE_PATH)) {
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

function route(method: string, path: string, handler: PayableReceivableHandler): void {
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
): { route: PayableReceivableRoute; params: Record<string, string> } | undefined {
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

async function listPayableReceivablesHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const kind = request.query.get("kind") as PayableReceivableKind | null;
  const status = request.query.get("status") as PayableReceivableStatus | "all" | null;
  const accountId = request.query.get("accountId");
  const categoryId = request.query.get("categoryId");
  const dueFrom = request.query.get("dueFrom");
  const dueTo = request.query.get("dueTo");

  return json(200, {
    payablesReceivables: await listPayableReceivablesForContext(context, {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(dueFrom ? { dueFrom } : {}),
      ...(dueTo ? { dueTo } : {}),
    }),
  });
}

async function createPayableReceivableHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const payableReceivable = await createPayableReceivableForContext(context, {
    kind: body.kind as PayableReceivableKind,
    amountMinor: Number(body.amountMinor),
    dueOn: String(body.dueOn ?? ""),
    description: String(body.description ?? ""),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
    ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
  });

  return json(201, { payableReceivable });
}

async function getPayableReceivableHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    payableReceivable: await getPayableReceivableForContext(
      context,
      requireParam(match, "payableReceivableId"),
    ),
  });
}

async function updatePayableReceivableHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const payableReceivable = await updatePayableReceivableForContext(
    context,
    requireParam(match, "payableReceivableId"),
    {
      ...(body.kind !== undefined ? { kind: body.kind as PayableReceivableKind } : {}),
      ...(body.status !== undefined ? { status: body.status as PayableReceivableStatus } : {}),
      ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
      ...(body.dueOn !== undefined ? { dueOn: String(body.dueOn) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
      ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
      ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
    },
  );

  return json(200, { payableReceivable });
}

async function settlePayableReceivableHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const result = await settlePayableReceivableForContext(
    context,
    requireParam(match, "payableReceivableId"),
    {
      settledOn: String(body.settledOn ?? ""),
      ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
      ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
      ...(body.existingTransactionId !== undefined
        ? { existingTransactionId: String(body.existingTransactionId) }
        : {}),
    },
  );

  return json(200, result);
}

async function cancelPayableReceivableHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  return json(200, {
    payableReceivable: await cancelPayableReceivableForContext(
      context,
      requireParam(match, "payableReceivableId"),
    ),
  });
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
