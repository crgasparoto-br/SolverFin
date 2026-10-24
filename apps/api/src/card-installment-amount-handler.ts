import type { TenantContext } from "@solverfin/domain";
import type { ApiRequest, ApiResponse } from "./router.js";
import { json, requireObjectBody, requireParam } from "./router.js";
import { adjustInvoiceInstallmentAmountForContext } from "./repositories/card-invoice-contracts.js";

export async function adjustInvoiceInstallmentAmountHandler(
  request: ApiRequest,
  context: TenantContext,
  match: Readonly<Record<string, string>>,
): Promise<ApiResponse> {
  const body = requireObjectBody(request.body);
  if (
    Object.keys(body).some((key) => !["amountMinor", "scope"].includes(key)) ||
    !Number.isSafeInteger(body.amountMinor) ||
    Number(body.amountMinor) <= 0 ||
    !["current", "current_and_future"].includes(String(body.scope))
  ) {
    return json(400, {
      error: {
        code: "CARD_INSTALLMENT_AMOUNT_INVALID",
        message: "Informe valor positivo em centavos e escopo válido.",
      },
    });
  }
  const result = await adjustInvoiceInstallmentAmountForContext(
    context,
    requireParam(match, "invoiceId"),
    requireParam(match, "installmentId"),
    Number(body.amountMinor),
    body.scope as "current" | "current_and_future",
  );
  return json(200, result);
}

