import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { auth } from "./auth-service.js";
import { query } from "./db.js";
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
import { handleTransactionBulkActionsApiRequest } from "./transaction-bulk-actions-router.js";

const BASE_PATH = "/api/transaction-groups";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface GroupMemberScopeRow {
  id: string;
  installmentId: string | null;
}

export async function handleTransactionGroupActionsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const bulkResult = await handleTransactionBulkActionsApiRequest(request);
  if (bulkResult) return bulkResult;

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

    if (route.action === "create_group") {
      await assertCreateGroupHasNoCanonicalInstallments(context, body);
      return undefined;
    }

    await assertExistingGroupHasNoCanonicalInstallments(context, route.groupId);

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
      const group = await updateTransactionGroupMemberForContext(
        context,
        route.groupId,
        route.memberId,
        readMutableMemberInput(body),
      );
      return json(200, { group });
    }

    if (route.action === "clone_member") {
      const transaction = await cloneTransactionGroupMemberForContext(
        context,
        route.groupId,
        route.memberId,
        readMutableMemberInput(body),
      );
      return json(201, { transaction });
    }

    if (route.action === "void_member") {
      const result = await voidTransactionGroupMemberForContext(context, route.groupId, route.memberId);
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
  | { action: "create_group" }
  | { action: "status" | "clone_group" | "void_group"; groupId: string }
  | {
      action: "update_member" | "clone_member" | "void_member";
      groupId: string;
      memberId: string;
    };

function matchActionRoute(method: string, pathname: string): ActionRoute | undefined {
  if (method === "POST" && pathname === BASE_PATH) {
    return { action: "create_group" };
  }

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

async function assertCreateGroupHasNoCanonicalInstallments(
  context: { organizationId: string; financialProfileId: string },
  body: Record<string, unknown>,
): Promise<void> {
  if (!Array.isArray(body.memberIds) || body.memberIds.some((item) => typeof item !== "string")) {
    return;
  }

  const memberIds = [...new Set(body.memberIds.map(String))];
  if (memberIds.length < 2 || memberIds.some((memberId) => !UUID_PATTERN.test(memberId))) return;

  const rows = await query<GroupMemberScopeRow>(
    `select "id", "installmentId"
       from "Transaction"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "id" = any($3::uuid[])`,
    [context.organizationId, context.financialProfileId, memberIds],
  );

  if (rows.length !== memberIds.length) return;
  if (rows.some((row) => row.installmentId !== null)) throwCanonicalInstallmentGroupBlocked();
}

async function assertExistingGroupHasNoCanonicalInstallments(
  context: { organizationId: string; financialProfileId: string },
  groupId: string,
): Promise<void> {
  if (!UUID_PATTERN.test(groupId)) return;

  const rows = await query<GroupMemberScopeRow>(
    `select "id", "installmentId"
       from "Transaction"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "transactionGroupId" = $3`,
    [context.organizationId, context.financialProfileId, groupId],
  );

  if (rows.some((row) => row.installmentId !== null)) throwCanonicalInstallmentGroupBlocked();
}

function throwCanonicalInstallmentGroupBlocked(): never {
  throw requestError(
    "TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE",
    "Parcelas canônicas não podem participar de agrupamentos. Desagrupe para manter a parcela.",
    409,
  );
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) return {};
  return body as Record<string, unknown>;
}

function readMutableMemberInput(body: Record<string, unknown>) {
  const date = readOptionalString(body.date);
  const plannedOn = readOptionalString(body.plannedOn);
  const effectiveOn = readNullableString(body.effectiveOn);
  return {
    ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
    ...(date !== undefined ? { date } : {}),
    ...(plannedOn !== undefined ? { plannedOn } : {}),
    ...(effectiveOn !== undefined ? { effectiveOn } : {}),
    ...(body.description !== undefined ? { description: String(body.description) } : {}),
    ...(body.categoryId !== undefined ? { categoryId: readNullableString(body.categoryId) } : {}),
  };
}

function readOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
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
