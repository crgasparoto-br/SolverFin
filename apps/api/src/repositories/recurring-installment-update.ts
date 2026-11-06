import type { EntityId, TenantContext } from "@solverfin/domain";

import { query } from "../db.js";
import { updateRecurringAccountTransactionForContext } from "./recurring-account-transaction-edit.js";
import type {
  InstallmentEditBlockedReason,
  InstallmentHistoryItem,
  InstallmentUpdateResult,
  UpdateInstallmentPayload,
} from "./installments.js";

export function throwInstallmentEditBlocked(reason: InstallmentEditBlockedReason): never {
  throw Object.assign(new Error(`Parcela bloqueada para edicao: ${reason}.`), {
    code: "INSTALLMENT_EDIT_BLOCKED",
    statusCode: 409,
  });
}

// The caller holds the shared installment transaction. Lock the recurrence
// before checking its terminal status so a concurrent cancel cannot slip by.
export async function assertUncancelledRecurringInstallment(
  context: TenantContext,
  recurrenceId: EntityId,
): Promise<void> {
  const rows = await query<{ status: string }>(
    `select "status" from "Recurrence"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
      for update`,
    [recurrenceId, context.organizationId, context.financialProfileId],
  );
  if (rows.length !== 1 || rows[0]?.status === "CANCELLED") {
    throwInstallmentEditBlocked("recurrence_cancelled");
  }
}

// Recurrences have no finite final sequence. Dispatch to the canonical
// recurrence service outside the manual plan's shared transaction.
export async function updateRecurringInstallmentFutureScope(
  context: TenantContext,
  installmentId: EntityId,
  payload: UpdateInstallmentPayload,
  read: (context: TenantContext, installmentId: EntityId) => Promise<InstallmentHistoryItem>,
): Promise<InstallmentUpdateResult | undefined> {
  if (payload.scope !== "current_and_future") return undefined;
  const current = await read(context, installmentId);
  if (!current.recurrenceId) return undefined;
  const transactionId = current.transaction?.id;
  if (
    !current.amountEditable ||
    current.card ||
    current.invoice ||
    typeof transactionId !== "string" ||
    !transactionId.trim() ||
    payload.amountMinor === undefined ||
    payload.description !== undefined ||
    payload.note !== undefined ||
    payload.categoryId !== undefined ||
    current.recurrence?.status === "cancelled"
  ) {
    throwInstallmentEditBlocked(current.editBlockedReason ?? "installment_status_locked");
  }
  const updated = await updateRecurringAccountTransactionForContext(
    context,
    transactionId,
    { amountMinor: payload.amountMinor },
    { amountOnly: true },
  );
  return {
    installment: await read(context, installmentId),
    updatedCount: updated.updatedCount + 1,
    skippedCount: updated.skippedCount,
  };
}
