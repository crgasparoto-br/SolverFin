import type { EntityId, TenantContext } from "@solverfin/domain";
import { withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { InvoiceContractError } from "./card-invoice-contracts-core.js";

/** Remove only an eligible unlinked transaction and update its invoice atomically. */
export async function deleteSimpleCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<{ transactionId: EntityId; invoiceId: EntityId }> {
  let invoiceId: EntityId | undefined;
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{
      id: string;
      invoiceId: string;
      amountMinor: number;
      status: string;
      invoiceStatus: string;
      currency: string;
      invoiceCurrency: string;
      recurrenceId: string | null;
      kind: string;
      description: string;
    }>(
      `select t."id", t."invoiceId", t."amountMinor", t."status",
              t."currency", t."recurrenceId", t."kind", t."description",
              inv."status" as "invoiceStatus", inv."currency" as "invoiceCurrency"
         from "Transaction" t join "Invoice" inv on inv."id" = t."invoiceId"
          and inv."organizationId" = t."organizationId"
          and inv."financialProfileId" = t."financialProfileId"
        where t."id" = $1 and t."cardId" = $2 and
          t."organizationId" = $3 and t."financialProfileId" = $4
          and t."accountId" is null and (t."kind" = 'EXPENSE' or
            (t."kind" = 'INCOME' and t."description" like '%[estorno:%'))
        for update of t, inv`,
      [transactionId, cardId, context.organizationId, context.financialProfileId],
    );
    const source = rows[0];
    if (!source)
      throw new InvoiceContractError("CARD_PURCHASE_NOT_FOUND", "Lançamento não encontrado.", 404);
    if (source.invoiceStatus !== "OPEN" || source.status === "RECONCILED") {
      throw new InvoiceContractError(
        "CARD_PURCHASE_DELETE_LOCKED",
        "Não é possível excluir uma compra conciliada ou de fatura bloqueada.",
        409,
      );
    }
    const dependencies = await executeQuery<{ id: string }>(
      `select "id" from "Installment" where "transactionId" = $1
        and "organizationId" = $2 and "financialProfileId" = $3 limit 1`,
      [transactionId, context.organizationId, context.financialProfileId],
    );
    if (source.recurrenceId || dependencies.length) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_DELETE_RESTRICTED",
        "Parcelas e recorrências exigem exclusão específica. Use Estorno para compensar este lançamento.",
        409,
      );
    }
    if (source.currency !== source.invoiceCurrency) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_CURRENCY_MISMATCH",
        "Moeda divergente da fatura.",
        409,
      );
    }
    const now = new Date().toISOString();
    const invoice = await executeQuery<{ id: string }>(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
         "updatedAt" = $5
        where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
          and "status" = 'OPEN'
        returning "id"`,
      [
        source.invoiceId,
        context.organizationId,
        context.financialProfileId,
        source.kind === "INCOME" ? Number(source.amountMinor) : -Number(source.amountMinor),
        now,
      ],
    );
    if (invoice.length !== 1)
      throw new InvoiceContractError("CARD_PURCHASE_DELETE_LOCKED", "Fatura bloqueada.", 409);
    const deleted = await executeQuery<{ id: string }>(
      `delete from "Transaction" where "id" = $1 and "organizationId" = $2
         and "financialProfileId" = $3 returning "id"`,
      [transactionId, context.organizationId, context.financialProfileId],
    );
    if (deleted.length !== 1)
      throw new InvoiceContractError(
        "CARD_PURCHASE_DELETE_FAILED",
        "Não foi possível excluir.",
        409,
      );
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "soft_delete",
      entityKind: "transaction",
      entityId: transactionId,
      redactedChanges: { purchase: "removed" },
    });
    invoiceId = source.invoiceId;
  });
  if (!invoiceId)
    throw new InvoiceContractError("CARD_PURCHASE_DELETE_FAILED", "Não foi possível excluir.", 409);
  return { transactionId, invoiceId };
}
