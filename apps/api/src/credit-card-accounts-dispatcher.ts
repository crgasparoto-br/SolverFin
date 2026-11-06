import {
  TenantAuthorizationError,
  TenantError,
  type TenantContext,
  type TransactionKind,
  type TransactionStatus,
} from "@solverfin/domain";

import { AuthError } from "./auth.js";
import { auth } from "./auth-service.js";
import { handleCreditCardAccountsApiRequest as handleBaseCreditCardAccountsApiRequest } from "./credit-card-accounts-router.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { listInstallmentsForContext } from "./repositories/installments.js";
import { getRecurrenceForContext } from "./repositories/recurrences.js";
import { updateRecurringAccountTransactionForContext } from "./repositories/recurring-account-transaction-edit.js";
import { updateRecurringCardPurchaseForContext } from "./repositories/recurring-card-purchase-edit.js";
import { getTransactionForContext, updateTransactionForContext } from "./repositories/transactions.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const RECURRING_PURCHASE_PATH = /^\/api\/credit-card-accounts\/([^/]+)\/purchases\/([^/]+)$/;
const CURRENT_ONLY_PURCHASE_PATH =
  /^\/api\/credit-card-accounts\/([^/]+)\/purchases\/([^/]+)\/current-only$/;
const RECURRING_TRANSACTION_PATH = /^\/api\/transactions\/([^/]+)$/;
const CURRENT_ONLY_TRANSACTION_PATH = /^\/api\/transactions\/([^/]+)\/current-only$/;

export async function handleCreditCardAccountsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  const body = readObjectBody(request.body);
  const currentOnlyPurchaseMatch = CURRENT_ONLY_PURCHASE_PATH.exec(request.pathname);
  const currentOnlyTransactionMatch = CURRENT_ONLY_TRANSACTION_PATH.exec(request.pathname);
  const purchaseMatch = RECURRING_PURCHASE_PATH.exec(request.pathname);
  const transactionMatch = RECURRING_TRANSACTION_PATH.exec(request.pathname);
  const isCurrentOnlyCardEdit =
    request.method === "PATCH" && currentOnlyPurchaseMatch !== null && body !== undefined;
  const isCurrentOnlyAccountEdit =
    request.method === "PATCH" && currentOnlyTransactionMatch !== null && body !== undefined;
  const isExpandedCardEdit =
    request.method === "PATCH" &&
    purchaseMatch !== null &&
    body?.editScope === "current_and_future";
  const isExpandedAccountEdit =
    request.method === "PATCH" && transactionMatch !== null && body?.applyToFuturePlanned === true;

  if (isCurrentOnlyCardEdit && currentOnlyPurchaseMatch && body) {
    return handleBaseCreditCardAccountsApiRequest({
      ...request,
      pathname: `/api/credit-card-accounts/${currentOnlyPurchaseMatch[1]}/purchases/${currentOnlyPurchaseMatch[2]}`,
      body: omitEditScope(body),
    });
  }

  if (!isCurrentOnlyAccountEdit && !isExpandedCardEdit && !isExpandedAccountEdit) {
    return handleBaseCreditCardAccountsApiRequest(request);
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const context = await resolveContext(request);

    if (isCurrentOnlyAccountEdit && currentOnlyTransactionMatch && body) {
      const transactionId = decodeURIComponent(currentOnlyTransactionMatch[1] ?? "");
      await assertCurrentOnlyRecurringAccountEdit(context, transactionId, body);
      const transaction = await updateTransactionForContext(
        context,
        transactionId,
        {
          ...(body.kind !== undefined ? { kind: String(body.kind) as TransactionKind } : {}),
          ...(body.status !== undefined
            ? { status: String(body.status) as TransactionStatus }
            : {}),
          ...(body.amountMinor !== undefined ? { amountMinor: Number(body.amountMinor) } : {}),
          ...(body.occurredOn !== undefined ? { occurredOn: String(body.occurredOn) } : {}),
          ...(body.plannedOn !== undefined ? { plannedOn: String(body.plannedOn) } : {}),
          ...(body.effectiveOn !== undefined
            ? { effectiveOn: readOptionalString(body.effectiveOn) }
            : {}),
          ...(body.description !== undefined ? { description: String(body.description) } : {}),
          ...(body.note !== undefined ? { note: readOptionalString(body.note) } : {}),
          ...(body.accountId !== undefined ? { accountId: String(body.accountId) } : {}),
          ...(body.destinationAccountId !== undefined
            ? { destinationAccountId: String(body.destinationAccountId) }
            : {}),
          ...(body.categoryId !== undefined ? { categoryId: String(body.categoryId) } : {}),
          ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
        },
      );

      return json(200, { transaction, editScope: "current_only" });
    }

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

/**
 * Only an eligible account recurrence may bypass the generic installment edit
 * guard for a single occurrence. Status changes keep their status-only route.
 */
async function assertCurrentOnlyRecurringAccountEdit(
  context: TenantContext,
  transactionId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const blocked = (): never => {
    throw Object.assign(
      new Error("Desconcilie a ocorrência recorrente antes de editar; outras parcelas exigem manutenção própria."),
      { code: "RECURRING_ACCOUNT_CURRENT_ONLY_EDIT_BLOCKED", statusCode: 409 },
    );
  };
  const transaction = await getTransactionForContext(context, transactionId);
  const recurrenceId = transaction.recurrenceId;
  if (!recurrenceId) return blocked();
  if (
    transaction.cardId ||
    transaction.invoiceId ||
    transaction.accountRemuneration ||
    !["planned", "posted"].includes(transaction.status) ||
    body.applyToFuturePlanned === true ||
    (body.editScope !== undefined && body.editScope !== "current_only") ||
    (body.status !== undefined && body.status !== transaction.status)
  ) blocked();

  const recurrence = await getRecurrenceForContext(context, recurrenceId);
  if (!recurrence.accountId || recurrence.cardId || recurrence.status === "cancelled") blocked();

  if (transaction.installmentId) {
    const [installment] = await listInstallmentsForContext(context, {
      installmentId: transaction.installmentId,
    });
    if (
      !installment ||
      installment.recurrenceId !== recurrenceId ||
      !["planned", "posted"].includes(installment.status) ||
      installment.invoice ||
      installment.card ||
      installment.cardInstrument
    ) blocked();
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

function omitEditScope(body: Record<string, unknown>): Record<string, unknown> {
  const currentOnlyBody = { ...body };
  delete currentOnlyBody.editScope;
  delete currentOnlyBody.applyToFuturePlanned;
  return currentOnlyBody;
}

function readOptionalString(value: unknown): string | null {
  return value === null || value === "" ? null : String(value);
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
