-- Repair legacy card purchases that were materialized from installments before
-- Transaction.recurrenceId started being persisted consistently.
--
-- The installment remains the source of truth for the recurrence relationship.
-- Tenant columns are included in the join to preserve strict profile isolation.
UPDATE "Transaction" AS transaction
SET
  "recurrenceId" = installment."recurrenceId",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Installment" AS installment
WHERE transaction."installmentId" = installment."id"
  AND transaction."organizationId" = installment."organizationId"
  AND transaction."financialProfileId" = installment."financialProfileId"
  AND transaction."cardId" IS NOT NULL
  AND transaction."accountId" IS NULL
  AND transaction."recurrenceId" IS NULL
  AND installment."recurrenceId" IS NOT NULL;
