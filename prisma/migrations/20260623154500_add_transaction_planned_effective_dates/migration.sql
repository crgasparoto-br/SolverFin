-- Add explicit planned and effective dates to bank/account transactions.
-- Existing data keeps occurredOn as the planned date; posted/reconciled rows also get effectiveOn.

ALTER TABLE "Transaction"
  ADD COLUMN "plannedOn" DATE,
  ADD COLUMN "effectiveOn" DATE;

UPDATE "Transaction"
SET
  "plannedOn" = "occurredOn",
  "effectiveOn" = CASE
    WHEN "status" IN ('POSTED', 'RECONCILED') THEN "occurredOn"
    ELSE NULL
  END;

ALTER TABLE "Transaction"
  ALTER COLUMN "plannedOn" SET NOT NULL;

CREATE INDEX "Transaction_organizationId_financialProfileId_plannedOn_idx"
  ON "Transaction"("organizationId", "financialProfileId", "plannedOn");

CREATE INDEX "Transaction_organizationId_financialProfileId_status_plannedOn_idx"
  ON "Transaction"("organizationId", "financialProfileId", "status", "plannedOn");

CREATE INDEX "Transaction_organizationId_financialProfileId_accountId_plannedOn_idx"
  ON "Transaction"("organizationId", "financialProfileId", "accountId", "plannedOn");

CREATE INDEX "Transaction_organizationId_financialProfileId_effectiveOn_idx"
  ON "Transaction"("organizationId", "financialProfileId", "effectiveOn");
