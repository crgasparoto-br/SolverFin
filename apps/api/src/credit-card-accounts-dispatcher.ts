import { TenantAuthorizationError, TenantError, type TenantContext } from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { handleCreditCardAccountsApiRequest as handleBaseCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { updateRecurringAccountTransactionForContext } from "./repositories/recurring-account-transaction-edit.js";
import { updateRecurringCardPurchaseForContext } from "./repositories/recurring-card-purchase-edit.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const RECURRING_PURCHASE_PATH = /^\/api\/credit-card-accounts\/([^/]+)\/purchases\/([^/]+)$/;
const RECURRING_TRANSACTION_PATH = /^\/api\/transactions\/([^/]+)$/;

export async function handleCreditCardAccountsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const body = readObjectBody(request.body);
  const purchaseMatch = RECURRING_PURCHASE_PATH.exec(request.pathname);
  const transactionMatch = RECURRING_TRANSACTION_PATH.exec(request.pathname);
  const isExpandedCardEdit =
    request.method === "PATCH" &&
    purchaseMatch !== null &&
    body?.editScope === "current_and_future";
  const isExpandedAccountEdit =
    request.method === "PATCH" && transactionMatch !== null && body?.applyToFuturePlanned === true;

  if (!isExpandedCardEdit && !isExpandedAccountEdit) {
    return handleBaseCreditCardAccountsApiRequest(request);
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const context = await resolveContext(request);

    if (isExpandedAccountEdit && transactionMatch) {
      const result = await updateRecurringAccountTransactionForContext(
        context,
        decodeURIComponent(transactionMatch[1] ?? ""),
        {
          ...(body?.kind !== undefined ? { kind: String(body.kind) } : {}),
          ...(body?.status !== undefined ? { status: String(body.status) } : {}),
          ...(body?.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
          ...(body?.occurredOn !== undefined ? { occurredOn: String(body.occurredOn) } : {}),
          ...(body?.plannedOn !== undefined ? { plannedOn: String(body.plannedOn) } : {}),
          ...(body?.effectiveOn !== undefined
            ? { effectiveOn: readOptionalString(body.effectiveOn) }
            : {}),
          ...(body?.description !== undefined ? { description: String(body.description) } : {}),
          ...(body?.note !== undefined ? { note: readOptionalString(body.note) } : {}),
          ...(body?.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
          ...(body?.destinationAccountId !== undefined
            ? { destinationAccountId: String(body.destinationAccountId) }
            : {}),
          ...(body?.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
          ...(body?.currency !== undefined ? { currency: String(body.currency) } : {}),
        },
      );

      return json(200, result);
    }

    if (!purchaseMatch || !body) {
      return handleBaseCreditCardAccountsApiRequest(request);
    }

    const cardId = decodeURIComponent(purchaseMatch[1] ?? "");
    const transactionId = decodeURIComponent(purchaseMatch[2] ?? "");
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

    return json(200, result);
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });

    return json(response.statusCode, response.body);
  }
}

async function resolveContext(request: ApiRequest): Promise<TenantContext> {
  const user = auth.requireAuthenticatedRequest(buildAuthHeaders(request.headers.authorization));

  return resolveRequestTenantContext(user, request.query.get("profileId") ?? undefined);
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

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
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
