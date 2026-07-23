import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { auth } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  cloneTransactionGroupForContext,
  cloneTransactionGroupMemberForContext,
  setTransactionGroupStatusForContext,
  updateTransactionGroupMemberForContext,
  voidTransactionGroupForContext,
  voidTransactionGroupMemberForContext,
} from "./repositories/transaction-group-actions.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const BASE_PATH = "/api/transaction-groups";

export async function handleTransactionGroupActionsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const route = matchActionRoute(request.method, request.pathname);
  if (!route) return undefined;
  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );
    const body = requireObjectBody(request.body);

    if (route.action === "status") {
      const status = String(body.status ?? "");
      if (status !== "posted" && status !== "reconciled") {
        throw requestError(
          "TRANSACTION_GROUP_STATUS_INVALID",
          "Escolha conciliar ou desconciliar os lançamentos.",
        );
      }
      const group = await setTransactionGroupStatusForContext(context, route.groupId, status);
      return json(200, { group });
    }

    if (route.action === "clone_group") {
      const transactions = await cloneTransactionGroupForContext(context, route.groupId);
      return json(201, { transactions });
    }

    if (route.action === "void_group") {
      const result = await voidTransactionGroupForContext(context, route.groupId);
      return json(200, result);
    }

    if (!("memberId" in route)) return undefined;

    if (route.action === "update_member") {
      const memberDate = readMemberDate(body);
      const group = await updateTransactionGroupMemberForContext(
        context,
        route.groupId,
        route.memberId,
        {
          ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
          ...(memberDate !== undefined ? { date: memberDate } : {}),
          ...(body.description !== undefined ? { description: String(body.description) } : {}),
          ...(body.categoryId !== undefined
            ? { categoryId: readNullableString(body.categoryId) }
            : {}),
        },
      );
      return json(200, { group });
    }

    if (route.action === "clone_member") {
      const transaction = await cloneTransactionGroupMemberForContext(
        context,
        route.groupId,
        route.memberId,
      );
      return json(201, { transaction });
    }

    if (route.action === "void_member") {
      const result = await voidTransactionGroupMemberForContext(
        context,
        route.groupId,
        route.memberId,
      );
      return json(200, result);
    }

    return undefined;
  } catch (error) {
    const response = buildApiErrorResponse({ error: mapDomainError(error), correlationId });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

type ActionRoute =
  | { action: "status" | "clone_group" | "void_group"; groupId: string }
  | {
      action: "update_member" | "clone_member" | "void_member";
      groupId: string;
      memberId: string;
    };

function matchActionRoute(method: string, pathname: string): ActionRoute | undefined {
  const statusMatch = new RegExp(`^${BASE_PATH}/([^/]+)/status$`).exec(pathname);
  if (method === "PATCH" && statusMatch?.[1]) {
    return { action: "status", groupId: decodeURIComponent(statusMatch[1]) };
  }

  const groupActionMatch = new RegExp(`^${BASE_PATH}/([^/]+)/(clone|void)$`).exec(pathname);
  if (method === "POST" && groupActionMatch?.[1] && groupActionMatch[2]) {
    return {
      action: groupActionMatch[2] === "clone" ? "clone_group" : "void_group",
      groupId: decodeURIComponent(groupActionMatch[1]),
    };
  }

  const memberMatch = new RegExp(`^${BASE_PATH}/([^/]+)/members/([^/]+)$`).exec(pathname);
  if (method === "PATCH" && memberMatch?.[1] && memberMatch[2]) {
    return {
      action: "update_member",
      groupId: decodeURIComponent(memberMatch[1]),
      memberId: decodeURIComponent(memberMatch[2]),
    };
  }

  const memberActionMatch = new RegExp(`^${BASE_PATH}/([^/]+)/members/([^/]+)/(clone|void)$`).exec(
    pathname,
  );
  if (method === "POST" && memberActionMatch?.[1] && memberActionMatch[2] && memberActionMatch[3]) {
    return {
      action: memberActionMatch[3] === "clone" ? "clone_member" : "void_member",
      groupId: decodeURIComponent(memberActionMatch[1]),
      memberId: decodeURIComponent(memberActionMatch[2]),
    };
  }

  return undefined;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return {};
  return body as Record<string, unknown>;
}

function readMemberDate(body: Record<string, unknown>): string | undefined {
  const value = body.date ?? body.effectiveOn ?? body.plannedOn;
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
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

function requestError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
