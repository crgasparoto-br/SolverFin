import type { EntityId, TenantContext } from "@solverfin/domain";
import { withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { InvoiceContractError } from "./card-invoice-contracts-core.js";
import { toDateOnly } from "./repository-date-utils.js";

/** Create a one-off credit for a selected purchase, with transactional protection. */
export async function reverseCardPurchaseForContext(
  context: TenantContext,
  cardId: EntityId,
  transactionId: EntityId,
  invoiceId: EntityId,
  installmentId?: EntityId,
): Promise<{ transactionId: string; invoiceId: string; amountMinor: number }> {
  const { randomUUID } = await import("node:crypto");
  let createdId = "";
  let reversedAmount = 0;
  await withTransaction(async (executeQuery) => {
    const invoices = await executeQuery<{ id: string; status: string; currency: string }>(
      `select "id", "status", "currency" from "Invoice"
        where "id" = $1 and "cardId" = $2 and "organizationId" = $3
          and "financialProfileId" = $4 for update`,
      [invoiceId, cardId, context.organizationId, context.financialProfileId],
    );
    if (!invoices[0] || invoices[0].status !== "OPEN") {
      throw new InvoiceContractError(
        "CARD_REVERSAL_INVOICE_LOCKED",
        "Somente faturas abertas permitem estorno.",
        409,
      );
    }
    const source = await executeQuery<{
      id: string;
      description: string;
      amountMinor: number;
      currency: string;
      cardInstrumentId: string | null;
      occurredOn: Date;
    }>(
      installmentId
        ? `select t."id", t."description", i."amountMinor", i."currency",
                  i."cardInstrumentId", i."dueOn" as "occurredOn"
             from "Transaction" t join "Installment" i on i."transactionId" = t."id"
            where t."id" = $1 and i."id" = $2 and i."invoiceId" = $3
              and t."cardId" = $4 and t."kind" = 'EXPENSE'
              and t."organizationId" = $5 and t."financialProfileId" = $6
              and i."organizationId" = $5 and i."financialProfileId" = $6`
        : `select t."id", t."description", t."amountMinor", t."currency",
                  t."cardInstrumentId", t."occurredOn"
             from "Transaction" t where t."id" = $1 and t."invoiceId" = $2
              and t."installmentId" is null and t."cardId" = $3
              and t."kind" = 'EXPENSE' and t."organizationId" = $4 and t."financialProfileId" = $5`,
      installmentId
        ? [
            transactionId,
            installmentId,
            invoiceId,
            cardId,
            context.organizationId,
            context.financialProfileId,
          ]
        : [transactionId, invoiceId, cardId, context.organizationId, context.financialProfileId],
    );
    const origin = source[0];
    if (
      !origin ||
      !Number.isSafeInteger(Number(origin.amountMinor)) ||
      Number(origin.amountMinor) <= 0 ||
      origin.currency !== invoices[0].currency
    ) {
      throw new InvoiceContractError(
        "CARD_REVERSAL_INVALID_SOURCE",
        "Lançamento não elegível ao estorno.",
        409,
      );
    }
    const marker = "[estorno:" + transactionId + ":" + (installmentId ?? "unico") + "]";
    const existing = await executeQuery<{ id: string }>(
      `select "id" from "Transaction" where "organizationId" = $1 and
         "financialProfileId" = $2 and "cardId" = $3 and "kind" = 'INCOME'
         and "description" like $4 limit 1`,
      [context.organizationId, context.financialProfileId, cardId, "%" + marker],
    );
    if (existing.length) {
      throw new InvoiceContractError(
        "CARD_REVERSAL_DUPLICATE",
        "Este lançamento já foi estornado.",
        409,
      );
    }
    const categories = await executeQuery<{ id: string }>(
      `select "id" from "Category" where "organizationId" = $1 and
         "financialProfileId" = $2 and "normalizedName" = 'estornos'
         and "kind" = 'INCOME' and "status" = 'ACTIVE'
         order by "createdAt" limit 1`,
      [context.organizationId, context.financialProfileId],
    );
    // Default category seeding may not have run for this profile. Provision it atomically.
    let reversalCategoryId = categories[0]?.id;
    if (!reversalCategoryId) {
      reversalCategoryId = randomUUID();
      const parent = await executeQuery<{ id: string }>(
        `select "id" from "Category" where "organizationId" = $1
           and "financialProfileId" = $2 and "kind" = 'INCOME'
           and "normalizedName" = 'reembolsos' and "status" = 'ACTIVE'
           limit 1`,
        [context.organizationId, context.financialProfileId],
      );
      await executeQuery(
        `insert into "Category"
          ("id", "organizationId", "financialProfileId", "parentCategoryId",
           "name", "normalizedName", "kind", "status", "createdAt", "updatedAt",
           "createdByUserId", "updatedByUserId")
         values ($1, $2, $3, $4, 'Estornos', 'estornos', 'INCOME', 'ACTIVE',
                 now(), now(), $5, $5)`,
        [
          reversalCategoryId,
          context.organizationId,
          context.financialProfileId,
          parent[0]?.id ?? null,
          context.userId,
        ],
      );
    }
    createdId = randomUUID();
    reversedAmount = Number(origin.amountMinor);
    const now = new Date().toISOString();
    await executeQuery(
      `insert into "Transaction"
        ("id", "organizationId", "financialProfileId", "cardId", "cardInstrumentId",
         "invoiceId", "categoryId", "kind", "status", "source", "amountMinor", "currency",
         "occurredOn", "plannedOn", "description", "createdAt", "updatedAt",
         "createdByUserId", "updatedByUserId")
       values ($1,$2,$3,$4,$5,$6,$7,'INCOME','POSTED','MANUAL',$8,$9,$10,$10,$11,$12,$12,$13,$13)`,
      [
        createdId,
        context.organizationId,
        context.financialProfileId,
        cardId,
        origin.cardInstrumentId,
        invoiceId,
        reversalCategoryId,
        reversedAmount,
        origin.currency,
        toDateOnly(origin.occurredOn),
        "Estorno: " + origin.description + " " + marker,
        now,
        context.userId,
      ],
    );
    const updated = await executeQuery<{ id: string }>(
      `update "Invoice" set "totalAmountMinor" = "totalAmountMinor" - $4,
           "updatedAt" = $5 where "id" = $1 and "organizationId" = $2
           and "financialProfileId" = $3 and "status" = 'OPEN'
           returning "id"`,
      [invoiceId, context.organizationId, context.financialProfileId, reversedAmount, now],
    );
    if (updated.length !== 1)
      throw new InvoiceContractError("CARD_REVERSAL_INVOICE_LOCKED", "Fatura não editável.", 409);
    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now,
      actorKind: "user",
      actorId: context.userId,
      action: "create",
      entityKind: "transaction",
      entityId: createdId,
      redactedChanges: { reversalOf: "added" },
    });
  });
  return { transactionId: createdId, invoiceId, amountMinor: -reversedAmount };
}

/** Update the newly generated credit using its own immutable reversal identity. */
