import type { EntityId, TenantContext } from "@solverfin/domain";
import type { QueryExecutor } from "../db.js";

export interface PurchaseInstallmentEditState {
  id: string;
  status: string;
  invoiceStatus: string;
}

/** Read the entire shared purchase series, locking invoices and occurrences at write time. */
export function loadPurchaseInstallmentEditStates(
  executeQuery: QueryExecutor,
  context: TenantContext,
  transactionId: EntityId,
  lock = false,
): Promise<PurchaseInstallmentEditState[]> {
  return executeQuery<PurchaseInstallmentEditState>(
    `select i."id", i."status", inv."status" as "invoiceStatus"
       from "Installment" i
       join "Invoice" inv on inv."id" = i."invoiceId"
         and inv."organizationId" = i."organizationId"
         and inv."financialProfileId" = i."financialProfileId"
      where i."transactionId" = $1
        and i."organizationId" = $2 and i."financialProfileId" = $3
      order by i."id"${lock ? " for update of i, inv" : ""}`,
    [transactionId, context.organizationId, context.financialProfileId],
  );
}

export function purchaseInstallmentEditViolation(
  rows: readonly PurchaseInstallmentEditState[],
): { code: string; message: string } | null {
  if (rows.some((row) => !["PLANNED", "POSTED"].includes(row.status))) {
    return {
      code: "CARD_INSTALLMENT_RECONCILED_LOCKED",
      message: "Compras com parcelas conciliadas ou bloqueadas nao podem ter metadados alterados.",
    };
  }
  if (rows.some((row) => row.invoiceStatus !== "OPEN")) {
    return {
      code: "CARD_PURCHASE_INVOICE_LOCKED",
      message: "Compras parceladas com fatura fechada, paga ou cancelada nao podem ser editadas.",
    };
  }
  return null;
}

/** Shared pre-write invariant for both recurring purchase edit scopes. */
export interface RecurringPurchaseGuardState {
  status: string;
  currency: string;
  invoiceCurrency: string;
  recurrenceCurrency: string;
  installmentId: string | null;
  installmentStatus: string | null;
  installmentCurrency: string | null;
}

export function recurringSelectedEditViolation(
  state: RecurringPurchaseGuardState,
  statusOnly = false,
): { code: string; message: string } | null {
  if (
    !statusOnly &&
    (["RECONCILED", "VOIDED", "CANCELLED"].includes(state.status) ||
      (state.installmentStatus !== null &&
        ["RECONCILED", "CANCELLED"].includes(state.installmentStatus)))
  ) {
    return {
      code: "CARD_PURCHASE_RECONCILED_LOCKED",
      message: "Ocorrencias recorrentes conciliadas ou canceladas nao podem ser editadas.",
    };
  }
  if (
    state.currency !== state.invoiceCurrency ||
    state.currency !== state.recurrenceCurrency ||
    (state.installmentId !== null && state.installmentCurrency !== state.currency)
  ) {
    return {
      code: "CARD_PURCHASE_CURRENCY_MISMATCH",
      message: "Moedas divergentes entre compra, recorrencia, parcela e fatura.",
    };
  }
  return null;
}

export function recurringFutureCurrencyMismatch(
  row: {
    transactionCurrency: string | null;
    invoiceCurrency: string | null;
    installmentId: string | null;
    installmentCurrency: string | null;
  },
  currency: string,
): boolean {
  return (
    row.transactionCurrency !== currency ||
    row.invoiceCurrency !== currency ||
    (row.installmentId !== null && row.installmentCurrency !== currency)
  );
}

/** Resolve the current-only path through the same state guard as future edits. */
export async function checkRecurringEdit(
  executeQuery: QueryExecutor,
  context: TenantContext,
  purchase: {
    status: string;
    currency: string;
    recurrenceId: string | null;
    installmentId: string | null;
    invoiceId: string | null;
  },
  invoiceCurrency: string,
  payload: { status?: string },
): Promise<{ code: string; message: string } | null> {
  if (purchase.recurrenceId === null) return null;
  const statusOnly =
    payload.status !== undefined && Object.keys(payload).every((key) => key === "status");

  const rows = await executeQuery<{
    recurrenceCurrency: string;
    installmentId: string | null;
    installmentStatus: string | null;
    installmentCurrency: string | null;
    installmentInvoiceId: string | null;
  }>(
    `select r."currency" as "recurrenceCurrency",
            i."id" as "installmentId", i."status" as "installmentStatus",
            i."currency" as "installmentCurrency", i."invoiceId" as "installmentInvoiceId"
       from "Recurrence" r
       left join "Installment" i on i."id" = $4
         and i."organizationId" = r."organizationId"
         and i."financialProfileId" = r."financialProfileId"
      where r."id" = $1 and r."organizationId" = $2
        and r."financialProfileId" = $3`,
    [
      purchase.recurrenceId,
      context.organizationId,
      context.financialProfileId,
      purchase.installmentId,
    ],
  );
  const linked = rows[0];
  if (
    linked === undefined ||
    (purchase.installmentId !== null &&
      (linked.installmentId !== purchase.installmentId ||
        (linked.installmentInvoiceId !== null &&
          linked.installmentInvoiceId !== purchase.invoiceId)))
  ) {
    return {
      code: "CARD_PURCHASE_INVOICE_INVALID",
      message: "Parcela recorrente nao pertence a fatura informada.",
    };
  }
  return recurringSelectedEditViolation(
    {
      status: purchase.status,
      currency: purchase.currency,
      invoiceCurrency,
      recurrenceCurrency: linked.recurrenceCurrency,
      installmentId: purchase.installmentId,
      installmentStatus: linked.installmentStatus,
      installmentCurrency: linked.installmentCurrency,
    },
    statusOnly,
  );
}
