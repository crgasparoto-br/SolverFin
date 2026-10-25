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
