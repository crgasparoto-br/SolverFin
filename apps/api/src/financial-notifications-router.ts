import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  FinancialNotificationError,
  countUnreadFinancialNotificationsForContext,
  getFinancialNotificationNavigationForContext,
  listFinancialNotificationPreferencesForContext,
  listFinancialNotificationsForContext,
  parseNotificationChannel,
  parseNotificationEventType,
  parseNotificationPageFilters,
  setFinancialNotificationPreferenceForContext,
  setFinancialNotificationReadStateForContext,
} from "./financial-notifications.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const BASE = "/api/notifications";
const ITEM_ACTION = /^\/api\/notifications\/([0-9a-f-]{36})\/(read|navigation)$/i;

/** Authenticated, recipient-scoped read and preference API. No public event-publish route. */
export async function handleFinancialNotificationsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (request.pathname !== BASE && !request.pathname.startsWith(BASE + "/")) {
    return undefined;
  }
  const correlationId = resolveCorrelationId(request.headers);
  try {
    const authorization = request.headers.authorization;
    const user = await requireAuthenticatedRequest(
      authorization === undefined ? {} : { authorization },
    );
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );

    if (request.method === "GET" && request.pathname === BASE) {
      return json(200, await listFinancialNotificationsForContext(
        context,
        parseNotificationPageFilters(request.query),
      ));
    }
    if (request.method === "GET" && request.pathname === BASE + "/unread-count") {
      return json(200, { unreadCount: await countUnreadFinancialNotificationsForContext(context) });
    }
    if (request.pathname === BASE + "/preferences") {
      if (request.method === "GET") {
        return json(200, { preferences: await listFinancialNotificationPreferencesForContext(context) });
      }
      if (request.method === "PUT") {
        const body = requireFields(request.body, ["type", "channel", "enabled"]);
        return json(200, {
          preference: await setFinancialNotificationPreferenceForContext(
            context,
            {
              type: parseNotificationEventType(body.type),
              channel: parseNotificationChannel(body.channel),
              enabled: requireBoolean(body.enabled),
            },
            correlationId,
          ),
        });
      }
      return undefined;
    }
    const action = ITEM_ACTION.exec(request.pathname);
    if (action) {
      const id = action[1] as string;
      if (request.method === "GET" && action[2] === "navigation") {
        return json(200, await getFinancialNotificationNavigationForContext(context, id));
      }
      if (request.method === "PATCH" && action[2] === "read") {
        const body = requireFields(request.body, ["read"]);
        return json(200, {
          notification: await setFinancialNotificationReadStateForContext(
            context,
            id,
            requireBoolean(body.read),
            correlationId,
          ),
        });
      }
    }
    return undefined;
  } catch (error) {
    const response = buildApiErrorResponse({ error, correlationId });
    return json(response.statusCode, response.body);
  }
}

function requireFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new FinancialNotificationError(
      "NOTIFICATION_PAYLOAD_INVALID",
      "Campos de notificação inválidos.",
      400,
    );
  }
  return value as Record<string, unknown>;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new FinancialNotificationError(
      "NOTIFICATION_PAYLOAD_INVALID",
      "Informe um valor booleano.",
      400,
    );
  }
  return value;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
