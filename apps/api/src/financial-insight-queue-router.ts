import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  FinancialInsightQueueError,
  listFinancialInsightQueueForContext,
  parseFinancialInsightQueueFilters,
  parseFinancialInsightSnoozeDays,
  resolveFinancialInsightForContext,
  snoozeFinancialInsightForContext,
} from "./financial-insight-queue.js";
import { ensureFinancialInsightsForContext } from "./financial-insight-scan.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const QUEUE_PATH = "/api/financial-insights";
const ACTION_PATH =
  /^\/api\/financial-insights\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(resolve|snooze)$/i;

/**
 * `GET /api/financial-insights?state=active|snoozed|resolved&limit=&offset=`
 * `POST /api/financial-insights/:id/resolve` `{ expectedFingerprint }`
 * `POST /api/financial-insights/:id/snooze` `{ expectedFingerprint, durationDays: 1 | 7 | 30 }`
 */
export async function handleFinancialInsightQueueApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (request.pathname !== QUEUE_PATH && !request.pathname.startsWith(`${QUEUE_PATH}/`)) {
    return undefined;
  }
  const correlationId = resolveCorrelationId(request.headers);

  try {
    if (request.method === "GET" && request.pathname === QUEUE_PATH) {
      const filters = parseFinancialInsightQueueFilters(request.query);
      const context = await resolveContext(request);
      // Refresh deterministic snapshots first so every surface reads the same current set.
      await ensureFinancialInsightsForContext(context);
      return json(200, await listFinancialInsightQueueForContext(context, filters));
    }

    const match = request.method === "POST" ? ACTION_PATH.exec(request.pathname) : null;
    if (match === null) return undefined;
    const suggestionId = match[1] as string;
    const action = (match[2] as string).toLowerCase();
    const body = isRecord(request.body) ? request.body : {};
    const expectedFingerprint = readNonEmptyString(body.expectedFingerprint);
    if (expectedFingerprint === undefined) {
      throw new FinancialInsightQueueError(
        "AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED",
        "Atualize a fila antes de decidir sobre este insight.",
        428,
      );
    }
    const durationDays =
      action === "snooze" ? parseFinancialInsightSnoozeDays(body.durationDays) : undefined;
    const context = await resolveContext(request);

    if (action === "resolve") {
      return json(200, {
        insight: await resolveFinancialInsightForContext(context, suggestionId, {
          expectedFingerprint,
          correlationId,
        }),
      });
    }
    return json(200, {
      insight: await snoozeFinancialInsightForContext(context, suggestionId, {
        expectedFingerprint,
        durationDays: durationDays as NonNullable<typeof durationDays>,
        correlationId,
      }),
    });
  } catch (error) {
    const response = buildApiErrorResponse({ error, correlationId });
    return {
      statusCode: response.statusCode,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: response.body,
    };
  }
}

async function resolveContext(request: ApiRequest) {
  const authorization = request.headers.authorization;
  const user = await requireAuthenticatedRequest(
    authorization === undefined ? {} : { authorization },
  );
  return resolveRequestTenantContext(user, request.query.get("profileId") ?? undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}
