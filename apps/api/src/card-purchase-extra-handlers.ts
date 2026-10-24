import type { TenantContext } from "@solverfin/domain";
import type { ApiRequest, ApiResponse } from "./router.js";
import { json, requireObjectBody, requireParam } from "./credit-card-accounts-router.js";
import { InvoiceContractError, deleteSimpleCardPurchaseForContext, reverseCardPurchaseForContext, updateCardReversalForContext } from "./repositories/card-invoice-contracts.js";

export async function deleteCardPurchaseHandler(
  _request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const result = await deleteSimpleCardPurchaseForContext(
    context,
    requireParam(match, "cardId"),
    requireParam(match, "transactionId"),
  );
  return json(200, { deleted: result });
}

export async function updateCardReversalHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const result = await updateCardReversalForContext(
    context,
    requireParam(match, "cardId"),
    requireParam(match, "reversalId"),
    {
      description: String(body.description ?? ""),
      occurredOn: String(body.occurredOn ?? ""),
      amountMinor: Number(body.amountMinor),
      ...(body.cardInstrumentId ? { cardInstrumentId: String(body.cardInstrumentId) } : {}),
    },
  );
  return json(200, { reversal: result });
}

export async function reverseCardPurchaseHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  const invoiceId = String(body.invoiceId ?? "");
  if (!invoiceId)
    throw new InvoiceContractError(
      "CARD_REVERSAL_INVOICE_REQUIRED",
      "Informe a fatura do lançamento.",
      400,
    );
  try {
    const result = await reverseCardPurchaseForContext(
      context,
      requireParam(match, "cardId"),
      requireParam(match, "transactionId"),
      invoiceId,
      body.installmentId ? String(body.installmentId) : undefined,
    );
    return json(201, { reversal: result });
  } catch (error) {
    if (error instanceof InvoiceContractError) throw error;
    // Reveal only SQLSTATE, never SQL text, parameters, or personal financial data.
    const sqlstate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    throw new InvoiceContractError(
      "CARD_REVERSAL_PERSISTENCE_ERROR",
      "Falha ao registrar estorno (código técnico: " +
        sqlstate +
        "). Nenhum crédito foi gravado. Informe este código ao suporte.",
      409,
    );
  }
}

