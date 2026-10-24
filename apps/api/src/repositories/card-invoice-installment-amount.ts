import type { EntityId, TenantContext } from "@solverfin/domain";
import { withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { InvoiceContractError, summarizeInvoiceForContext, type InvoiceSummaryContract } from "./card-invoice-contracts-core.js";

/** Update the selected installment or eligible future occurrences without changing the base purchase. */
export async function adjustInvoiceInstallmentAmountForContext(
  context: TenantContext,
  invoiceId: EntityId,
  installmentId: EntityId,
  amountMinor: number,
  scope: "current" | "current_and_future",
): Promise<{
  installmentId: EntityId;
  updatedCount: number;
  skippedCount: number;
  invoice: InvoiceSummaryContract;
}> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new InvoiceContractError(
      "CARD_INSTALLMENT_AMOUNT_INVALID",
      "Informe um valor positivo em centavos para a parcela.",
    );
  }
  if (scope !== "current" && scope !== "current_and_future") {
    throw new InvoiceContractError(
      "CARD_INSTALLMENT_SCOPE_INVALID",
      "Selecione o escopo de alteração da parcela.",
    );
  }
  let updatedCount = 0;
  let skippedCount = 0;
  await withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{
      id: string;
      transactionId: string;
      invoiceId: string;
      cardId: string;
      transactionCardId: string;
      recurrenceId: string | null;
      sequenceNumber: number;
      totalInstallments: number;
      amountMinor: number;
      currency: string;
      invoiceCurrency: string;
      status: string;
      invoiceStatus: string;
      transactionStatus: string;
    }>(
      `select i."id", i."transactionId", i."invoiceId", i."cardId",
              t."cardId" as "transactionCardId", i."recurrenceId",
              i."sequenceNumber", i."totalInstallments", i."amountMinor",
              i."currency", i."status", inv."status" as "invoiceStatus",
              inv."currency" as "invoiceCurrency", t."status" as "transactionStatus"
         from "Installment" i
         join "Invoice" inv on inv."id" = i."invoiceId"
           and inv."organizationId" = i."organizationId"
           and inv."financialProfileId" = i."financialProfileId"
         join "Transaction" t on t."id" = i."transactionId"
           and t."organizationId" = i."organizationId"
           and t."financialProfileId" = i."financialProfileId"
        where i."transactionId" = (
           select selected."transactionId" from "Installment" selected
            where selected."id" = $1 and selected."invoiceId" = $2
              and selected."organizationId" = $3 and selected."financialProfileId" = $4
        ) and i."organizationId" = $3 and i."financialProfileId" = $4
        order by i."sequenceNumber", i."id"
        for update of i, inv`,
      [installmentId, invoiceId, context.organizationId, context.financialProfileId],
    );
    const selected = rows.find((row) => row.id === installmentId && row.invoiceId === invoiceId);
    if (
      !selected ||
      selected.recurrenceId !== null ||
      selected.totalInstallments < 2 ||
      selected.cardId !== selected.transactionCardId
    ) {
      throw new InvoiceContractError(
        "CARD_INSTALLMENT_NOT_FOUND",
        "Parcela de compra parcelada não encontrada nesta fatura.",
        404,
      );
    }
    const editable = (row: typeof selected): boolean =>
      row.recurrenceId === null &&
      row.cardId === selected.cardId &&
      row.transactionId === selected.transactionId &&
      row.totalInstallments === selected.totalInstallments &&
      row.currency === selected.currency &&
      row.currency === row.invoiceCurrency &&
      row.invoiceStatus === "OPEN" &&
      ["PLANNED", "POSTED"].includes(row.status) &&
      ["PLANNED", "POSTED"].includes(row.transactionStatus);
    if (!editable(selected)) {
      throw new InvoiceContractError(
        "CARD_INSTALLMENT_AMOUNT_LOCKED",
        "Esta parcela não pode ser alterada: fatura ou situação bloqueada.",
        409,
      );
    }
    const candidates =
      scope === "current"
        ? [selected]
        : rows.filter((row) => row.sequenceNumber >= selected.sequenceNumber);
    const now = new Date().toISOString();
    for (const row of candidates) {
      if (!editable(row)) {
        skippedCount += 1;
        continue;
      }
      const delta = amountMinor - Number(row.amountMinor);
      if (delta !== 0) {
        await executeQuery(
          `update "Installment" set "amountMinor" = $5, "updatedAt" = $6,
              "updatedByUserId" = $7
            where "id" = $1 and "invoiceId" = $2
              and "organizationId" = $3 and "financialProfileId" = $4`,
          [
            row.id,
            row.invoiceId,
            context.organizationId,
            context.financialProfileId,
            amountMinor,
            now,
            context.userId,
          ],
        );
        const invoiceRows = await executeQuery<{ id: string }>(
          `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" + $4,
              "updatedAt" = $5
            where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3
              and "status" = 'OPEN' and "totalAmountMinor" + $4 >= 0
            returning "id"`,
          [row.invoiceId, context.organizationId, context.financialProfileId, delta, now],
        );
        if (invoiceRows.length !== 1) {
          throw new InvoiceContractError(
            "CARD_INSTALLMENT_AMOUNT_LOCKED",
            "Não foi possível atualizar o total da fatura.",
            409,
          );
        }
        await insertAuditLogEntry(executeQuery, {
          organizationId: context.organizationId,
          financialProfileId: context.financialProfileId,
          occurredAt: now,
          actorKind: "user",
          actorId: context.userId,
          action: "update",
          entityKind: "installment",
          entityId: row.id,
          redactedChanges: { amountMinor: "changed" },
        });
      }
      updatedCount += 1;
    }
  });
  return {
    installmentId,
    updatedCount,
    skippedCount,
    invoice: await summarizeInvoiceForContext(context, invoiceId),
  };
}
