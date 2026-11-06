import type { Transaction, TransactionStatus } from "@solverfin/domain";
import type { QueryExecutor } from "../db.js";
import { InvoiceContractError } from "./card-invoice-contracts-core.js";

/** A status-only reconcile must keep concurrent installment edits intact. */
export function isCanonicalInstallmentReconciliation(
  currentStatus: TransactionStatus,
  payload: { status?: TransactionStatus },
): boolean {
  const keys = Object.keys(payload);
  if (keys.length !== 1 || payload.status === undefined) return false;
  if (payload.status === "reconciled") {
    return currentStatus === "planned" || currentStatus === "posted";
  }
  return payload.status === "posted" && currentStatus === "reconciled";
}

/** Invoice-linked credits must use the reversal endpoint, which updates invoice totals atomically. */
export function assertGenericCardEditAllowed(transaction: Transaction | undefined): void {
  if (transaction?.cardId && transaction.invoiceId && transaction.kind === "income") {
    throw new InvoiceContractError(
      "CARD_REVERSAL_EDIT_ROUTE_REQUIRED",
      "Edite o estorno pela ação específica do cartão.",
      409,
    );
  }
}

/** Reject stale generic writes and bypasses of invoice-specific financial contracts. */
export async function updateActiveGenericTransaction(
  executeQuery: QueryExecutor,
  transactionParams: readonly unknown[],
  expectedUpdatedAt: string | undefined,
  statusOnlyReconciliation = false,
): Promise<void> {
  const params = statusOnlyReconciliation
    ? transactionParams
    : [...transactionParams, expectedUpdatedAt ?? null];
  const updated = await executeQuery<{ id: string }>(
    statusOnlyReconciliation ? buildReconciliationStatusSql() : buildUpdateTransactionSql(),
    params,
  );
  if (updated.length !== 1) {
    throw new InvoiceContractError(
      "TRANSACTION_CONCURRENT_CHANGE",
      "O lançamento foi alterado ou anulado durante a operação.",
      409,
    );
  }
}

/** Update only reconciliation fields after the row lock releases, never stale category/amount data. */
function buildReconciliationStatusSql(): string {
  return `update "Transaction" set
      "status" = $9, "effectiveOn" = $17, "reconciledAt" = $20,
      "updatedAt" = $23, "updatedByUserId" = $25
    where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
      and "status" <> 'VOIDED' and "cardId" is null and "invoiceId" is null
      and (
        ($9 = 'RECONCILED' and "status" in ('PLANNED', 'POSTED'))
        or ($9 = 'POSTED' and "status" = 'RECONCILED')
      )
    returning "id"`;
}

function buildUpdateTransactionSql(): string {
  return `update "Transaction" set
      "accountId" = $4, "destinationAccountId" = $5, "categoryId" = $6, "transferGroupId" = $7,
      "kind" = $8, "status" = $9, "source" = $10, "amountMinor" = $11, "currency" = $12,
      "destinationAmountMinor" = $13, "destinationCurrency" = $14,
      "occurredOn" = $15, "plannedOn" = $16, "effectiveOn" = $17, "description" = $18,
      "note" = $19, "reconciledAt" = $20, "voidedAt" = $21, "createdAt" = $22, "updatedAt" = $23,
      "createdByUserId" = $24, "updatedByUserId" = $25
    where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
      and "status" <> 'VOIDED' and "cardId" is null and "invoiceId" is null
      and "updatedAt" = $26 returning "id"`;
}
