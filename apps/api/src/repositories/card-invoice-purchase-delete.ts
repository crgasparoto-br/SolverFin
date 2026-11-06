import type { EntityId, TenantContext } from "@solverfin/domain";
import { withTransaction, type QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { InvoiceContractError } from "./card-invoice-contracts-core.js";

/** Logically void an eligible unlinked transaction and adjust its invoice atomically. */
export async function deleteSimpleCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<{ transactionId: EntityId; invoiceId: EntityId }> {
  return withTransaction((executeQuery) =>
    voidSimpleCardPurchaseInTransaction(executeQuery, context, cardId, transactionId),
  );
}

/** Share the locked financial mutation between individual and batch routes. */
export async function voidSimpleCardPurchaseInTransaction(
  executeQuery: QueryExecutor,
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
): Promise<{ transactionId: EntityId; invoiceId: EntityId }> {
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
        and t."accountId" is null and t."transactionGroupId" is null
        and t."status" <> 'VOIDED'
        and (t."kind" = 'EXPENSE' or
          (t."kind" = 'INCOME' and t."description" like '%[estorno:%'))
      for update of t, inv`,
    [transactionId, cardId, context.organizationId, context.financialProfileId],
  );
  const source = rows[0];
  if (!source)
    throw new InvoiceContractError("CARD_PURCHASE_NOT_FOUND", "Lançamento não encontrado.", 404);
  if (source.invoiceStatus !== "OPEN" || ["RECONCILED", "VOIDED"].includes(source.status)) {
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
  // A purchase with a live credit cannot be voided independently: doing so
  // would leave its reversal orphaned and may make the invoice total negative.
  if (source.kind === "EXPENSE") {
    const activeReversals = await executeQuery<{ id: string }>(
      `select "id" from "Transaction"
        where "organizationId" = $1 and "financialProfileId" = $2
          and "cardId" = $3 and "invoiceId" = $4
          and "kind" = 'INCOME' and "status" <> 'VOIDED'
          and "description" like $5
        limit 1`,
      [
        context.organizationId,
        context.financialProfileId,
        cardId,
        source.invoiceId,
        `%[estorno:${transactionId}:unico]`,
      ],
    );
    if (activeReversals.length > 0) {
      throw new InvoiceContractError(
        "CARD_PURCHASE_ACTIVE_REVERSAL",
        "Anule primeiro o estorno ativo antes de excluir a compra.",
        409,
      );
    }
  }
  const now = new Date().toISOString();
  const invoice = await executeQuery<{ id: string }>(
    `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
       "updatedAt" = $5
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
        and "cardId" = $6 and "currency" = $7 and "status" = 'OPEN'
        and "totalAmountMinor" + $4 >= 0
      returning "id"`,
    [
      source.invoiceId,
      context.organizationId,
      context.financialProfileId,
      source.kind === "INCOME" ? Number(source.amountMinor) : -Number(source.amountMinor),
      now,
      cardId,
      source.currency,
    ],
  );
  if (invoice.length !== 1)
    throw new InvoiceContractError(
      "CARD_PURCHASE_DELETE_LOCKED",
      "Fatura bloqueada ou saldo incompatível com a exclusão.",
      409,
    );
  const deleted = await executeQuery<{ id: string }>(
    `update "Transaction"
       set "status" = 'VOIDED', "voidedAt" = $4,
           "updatedAt" = $4, "updatedByUserId" = $5
      where "id" = $1 and "organizationId" = $2
        and "financialProfileId" = $3
        and "status" not in ('VOIDED', 'RECONCILED')
      returning "id"`,
    [transactionId, context.organizationId, context.financialProfileId, now, context.userId],
  );
  if (deleted.length !== 1)
    throw new InvoiceContractError("CARD_PURCHASE_DELETE_FAILED", "Não foi possível excluir.", 409);
  await insertAuditLogEntry(executeQuery, {
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    occurredAt: now,
    actorKind: "user",
    actorId: context.userId,
    action: "soft_delete",
    entityKind: "transaction",
    entityId: transactionId,
    redactedChanges: { status: "changed", voidedAt: "added" },
  });
  return { transactionId, invoiceId: source.invoiceId };
}
