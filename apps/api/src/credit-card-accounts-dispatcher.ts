import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import {
  handleCreditCardAccountsApiRequest as handleBaseCreditCardAccountsApiRequest,
} from "./credit-card-accounts-router.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { updateRecurringCardPurchaseForContext } from "./repositories/recurring-card-purchase-edit.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const RECURRING_PURCHASE_PATH =
  /^\/api\/credit-card-accounts\/([^/]+)\/purchases\/([^/]+)$/;

export async function handleCreditCardAccountsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const match = RECURRING_PURCHASE_PATH.exec(request.pathname);
  const body = readObjectBody(request.body);

  if (
    request.method !== "PATCH" ||
    !match ||
    body?.editScope !== "current_and_future"
  ) {
    return handleBaseCreditCardAccountsApiRequest(request);
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );
    const cardId = decodeURIComponent(match[1] ?? "");
    const transactionId = decodeURIComponent(match[2] ?? "");
    const result = await updateRecurringCardPurchaseForContext(context, cardId, transactionId, {
      ...(body.invoiceId !== undefined ? { invoiceId: String(body.invoiceId) } : {}),
      ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
      ...(body.occurredOn !== undefined ? { occurredOn: String(body.occurredOn) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.categoryId !== undefined ? { categoryId: readOptionalString(body.categoryId) } : {}),
      ...(body.cardInstrumentId !== undefined
        ? { cardInstrumentId: String(body.cardInstrumentId) }
        : {}),
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: result,
    };
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

function readObjectBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }

  return body as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | null {
  return value === null ? null : String(value);
}

function buildAuthHeaders(authorization: string | undefined): { authorization?: string } {
  return authorization === undefined ? {} : { authorization };
}

function mapDomainError(error: unknown): unknown {
  if (
    error instanceof AuthError ||
    error instanceof TenantAuthorizationError ||
    error instanceof TenantError
  ) {
    return error;
  }

  return error;
}
