import type { EntityId, TenantContext } from "@solverfin/domain";

import type { QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { toDateOnly } from "./repository-date-utils.js";
import type {
  SelectedTransactionRow,
  FutureTransactionRow,
  RecurringAccountTransactionEditPayload,
  RecurringAccountTransactionEditResult,
} from "./recurring-account-transaction-edit.js";

interface LockedInstallmentRow {
  status: string;
  invoiceId: string | null;
  cardId: string | null;
  cardInstrumentId: string | null;
}

/**
 * A value-only installment edit must not use the full recurring-transaction
 * update: that path intentionally propagates metadata and recalculates dates.
 * Keep selection, ordering, row locking and audit in this canonical service.
 */
export async function updateRecurringInstallmentAmountOnly(
  executeQuery: QueryExecutor,
  context: TenantContext,
  selected: SelectedTransactionRow,
  payload: RecurringAccountTransactionEditPayload,
  findFutureForUpdate: (
    query: QueryExecutor, context: TenantContext, recurrenceId: EntityId,
    transactionId: EntityId, sequenceNumber: number | null, plannedOn: string,
  ) => Promise<FutureTransactionRow[]>,
  buildSkipped: (
    row: FutureTransactionRow, reason: "transaction_not_planned" | "transaction_voided",
  ) => RecurringAccountTransactionEditResult["skipped"][number],
): Promise<RecurringAccountTransactionEditResult> {
  const blocked = (): never => {
    throw Object.assign(new Error("A parcela ou a recorrencia nao permite ajuste de valor."), {
      code: "INSTALLMENT_EDIT_BLOCKED", statusCode: 409,
    });
  };

  const amountMinor = payload.amountMinor;
  const installmentId = selected.installmentId;
  if (Object.keys(payload).length !== 1 || amountMinor === undefined) return blocked();
  if (
    selected.recurrenceStatus === "CANCELLED" ||
    selected.transactionCardId !== null ||
    selected.transactionInvoiceId !== null ||
    installmentId === null ||
    !["PLANNED", "POSTED"].includes(selected.status)
  ) return blocked();

  // A linked installment can be reconciled, cancelled or invoiced after the
  // endpoint's optimistic eligibility check. Recheck while holding its lock.
  const installment = await lockInstallmentForAmount(executeQuery, context, installmentId);
  if (
    !installment ||
    installment.status !== selected.status ||
    installment.invoiceId !== null ||
    installment.cardId !== null ||
    installment.cardInstrumentId !== null
  ) blocked();

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw Object.assign(new Error("Valor da parcela invalido."), {
      code: "INSTALLMENT_PAYLOAD_INVALID", statusCode: 400,
    });
  }
  const futureRows = await findFutureForUpdate(
    executeQuery,
    context,
    selected.recurrenceId!,
    selected.id,
    selected.sequenceNumber,
    toDateOnly(selected.plannedOn),
  );
  const eligible: FutureTransactionRow[] = [];
  const skipped: RecurringAccountTransactionEditResult["skipped"] = [];

  for (const row of futureRows) {
    if (row.voidedAt !== null || row.status === "VOIDED") {
      skipped.push(buildSkipped(row, "transaction_voided"));
      continue;
    }
    if (row.status !== "PLANNED" || row.transactionInvoiceId !== null) {
      skipped.push(buildSkipped(row, "transaction_not_planned"));
      continue;
    }
    if (row.installmentId !== null) {
      const linked = await lockInstallmentForAmount(executeQuery, context, row.installmentId);
      if (
        !linked ||
        linked.status !== "PLANNED" ||
        linked.invoiceId !== null ||
        linked.cardId !== null ||
        linked.cardInstrumentId !== null
      ) {
        skipped.push(buildSkipped(row, "transaction_not_planned"));
        continue;
      }
    }
    eligible.push(row);
  }

  const now = new Date().toISOString();
  const saveAmount = async (transactionId: EntityId, installmentId: EntityId | null) => {
    await executeQuery(
      `update "Transaction"
          set "amountMinor" = $4, "updatedAt" = $5, "updatedByUserId" = $6
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [transactionId, context.organizationId, context.financialProfileId, amountMinor, now, context.userId],
    );
    if (installmentId !== null) {
      await executeQuery(
        `update "Installment" set "amountMinor" = $4, "updatedAt" = $5
          where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
        [installmentId, context.organizationId, context.financialProfileId, amountMinor, now],
      );
    }
  };

  await saveAmount(selected.id, installmentId);
  await executeQuery(
    `update "Recurrence" set "amountMinor" = $4, "updatedAt" = $5, "updatedByUserId" = $6
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [selected.recurrenceId, context.organizationId, context.financialProfileId, amountMinor, now, context.userId],
  );
  for (const row of eligible) await saveAmount(row.id, row.installmentId);

  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action: "update",
    entityKind: "transaction",
    entityId: selected.id,
    redactedChanges: {
      recurringEditScope: "changed",
      selectedOccurrence: "changed",
      ...(eligible.length ? { futureOccurrences: "changed" as const } : {}),
    },
  });
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action: "update",
    entityKind: "recurrence",
    entityId: selected.recurrenceId!,
    redactedChanges: {
      amount: "changed",
      ...(eligible.length ? { futureOccurrences: "changed" as const } : {}),
    },
  });

  return {
    transactionUpdated: true,
    transaction: {
      id: selected.id,
      recurrenceId: selected.recurrenceId!,
      installmentId,
      plannedOn: toDateOnly(selected.plannedOn),
      ...(selected.effectiveOn ? { effectiveOn: toDateOnly(selected.effectiveOn) } : {}),
      amountMinor,
      description: selected.description,
    },
    recurrence: { id: selected.recurrenceId!, startOn: toDateOnly(selected.recurrenceStartOn!) },
    updatedCount: eligible.length,
    skippedCount: skipped.length,
    skipped,
  };
}

async function lockInstallmentForAmount(
  executeQuery: QueryExecutor,
  context: TenantContext,
  installmentId: EntityId,
): Promise<LockedInstallmentRow | undefined> {
  const rows = await executeQuery<LockedInstallmentRow>(
    `select "status", "invoiceId", "cardId", "cardInstrumentId" from "Installment"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
      for update`,
    [installmentId, context.organizationId, context.financialProfileId],
  );
  return rows[0];
}
