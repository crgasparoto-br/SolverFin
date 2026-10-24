import type { EntityId, TenantContext } from "@solverfin/domain";
import { withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { assertActiveCardInstrumentBelongsToCard, InvoiceContractError, isIsoDate } from "./card-invoice-contracts-core.js";
import { toDateOnly } from "./repository-date-utils.js";

/** Update a credit while preserving its origin marker and recalculating the invoice. */
export async function updateCardReversalForContext(
  context: TenantContext,
  cardId: EntityId,
  reversalId: EntityId,
  payload: {
    description: string;
    occurredOn: string;
    amountMinor: number;
    cardInstrumentId?: string;
  },
): Promise<{ transactionId: EntityId; invoiceId: EntityId }> {
  if (!Number.isSafeInteger(payload.amountMinor) || payload.amountMinor <= 0) {
    throw new InvoiceContractError(
      "CARD_REVERSAL_AMOUNT_INVALID",
      "Informe um valor positivo para o crédito.",
    );
  }
  if (!isIsoDate(payload.occurredOn) || !payload.description.trim()) {
    throw new InvoiceContractError(
      "CARD_REVERSAL_DETAILS_INVALID",
      "Informe data e descrição válidas.",
    );
  }
  let invoiceId: EntityId | undefined;
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{
      invoiceId: string;
      amountMinor: number;
      description: string;
      invoiceStatus: string;
      periodStartOn: Date;
      periodEndOn: Date;
    }>(
      `select t."invoiceId", t."amountMinor", t."description",
           inv."status" as "invoiceStatus", inv."periodStartOn", inv."periodEndOn"
         from "Transaction" t join "Invoice" inv on inv."id" = t."invoiceId"
          and inv."organizationId" = t."organizationId"
          and inv."financialProfileId" = t."financialProfileId"
        where t."id" = $1 and t."cardId" = $2 and t."organizationId" = $3
          and t."financialProfileId" = $4 and t."kind" = 'INCOME'
          and t."description" like '%[estorno:%'
        for update of t, inv`,
      [reversalId, cardId, context.organizationId, context.financialProfileId],
    );
    const current = rows[0];
    if (!current || current.invoiceStatus !== "OPEN") {
      throw new InvoiceContractError(
        "CARD_REVERSAL_EDIT_LOCKED",
        "O estorno não está disponível para edição.",
        409,
      );
    }
    if (
      payload.occurredOn < toDateOnly(current.periodStartOn) ||
      payload.occurredOn > toDateOnly(current.periodEndOn)
    ) {
      throw new InvoiceContractError(
        "CARD_REVERSAL_DATE_INVALID",
        "A data deve pertencer à fatura.",
        409,
      );
    }
    if (payload.cardInstrumentId) {
      await assertActiveCardInstrumentBelongsToCard(context, cardId, payload.cardInstrumentId);
    }
    const marker = current.description.match(/ \[estorno:[^\]]+\]$/)?.[0];
    if (!marker)
      throw new InvoiceContractError(
        "CARD_REVERSAL_MARKER_INVALID",
        "Estorno sem referência à compra.",
        409,
      );
    const now = new Date().toISOString();
    await executeQuery(
      `update "Transaction" set "amountMinor" = $5, "occurredOn" = $6, "plannedOn" = $6,
          "description" = $7, "cardInstrumentId" = coalesce($8, "cardInstrumentId"),
          "updatedAt" = $9, "updatedByUserId" = $10
        where "id" = $1 and "cardId" = $2 and "organizationId" = $3 and "financialProfileId" = $4`,
      [
        reversalId,
        cardId,
        context.organizationId,
        context.financialProfileId,
        payload.amountMinor,
        payload.occurredOn,
        payload.description.trim() + marker,
        payload.cardInstrumentId ?? null,
        now,
        context.userId,
      ],
    );
    await executeQuery(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
         "updatedAt" = $5
       where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
      [
        current.invoiceId,
        context.organizationId,
        context.financialProfileId,
        Number(current.amountMinor) - payload.amountMinor,
        now,
      ],
    );
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "update",
      entityKind: "transaction",
      entityId: reversalId,
      redactedChanges: { amountMinor: "changed", description: "changed" },
    });
    invoiceId = current.invoiceId;
  });
  if (!invoiceId)
    throw new InvoiceContractError(
      "CARD_REVERSAL_EDIT_FAILED",
      "Não foi possível atualizar o estorno.",
      409,
    );
  return { transactionId: reversalId, invoiceId };
}
