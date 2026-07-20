CREATE TABLE "TransactionGroup" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "displayOn" DATE NOT NULL,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransactionGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransactionGroup_profile_fkey" FOREIGN KEY ("financialProfileId", "organizationId") REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT,
  CONSTRAINT "TransactionGroup_account_fkey" FOREIGN KEY ("accountId", "organizationId", "financialProfileId") REFERENCES "Account"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT
);

ALTER TABLE "Transaction" ADD COLUMN "transactionGroupId" UUID;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transactionGroupId_fkey"
  FOREIGN KEY ("transactionGroupId", "organizationId", "financialProfileId")
  REFERENCES "TransactionGroup"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "TransactionGroup_id_organizationId_financialProfileId_key" ON "TransactionGroup"("id", "organizationId", "financialProfileId");
CREATE INDEX "TransactionGroup_organizationId_financialProfileId_accountId_displayOn_idx" ON "TransactionGroup"("organizationId", "financialProfileId", "accountId", "displayOn");
CREATE INDEX "Transaction_organizationId_financialProfileId_transactionGroupId_idx" ON "Transaction"("organizationId", "financialProfileId", "transactionGroupId");

CREATE FUNCTION prevent_grouped_transaction_invalidation() RETURNS trigger AS $$
BEGIN
  IF OLD."transactionGroupId" IS NOT NULL AND (
    NEW."accountId" IS DISTINCT FROM OLD."accountId" OR
    NEW."kind" IS DISTINCT FROM OLD."kind" OR
    NEW."status" IS DISTINCT FROM OLD."status" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."cardId" IS DISTINCT FROM OLD."cardId" OR
    NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
  ) THEN
    RAISE EXCEPTION 'Grouped transaction must be ungrouped before eligibility fields change'
      USING ERRCODE = '23514', CONSTRAINT = 'Transaction_group_member_update_blocked';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Transaction_group_member_update_guard"
BEFORE UPDATE ON "Transaction"
FOR EACH ROW EXECUTE FUNCTION prevent_grouped_transaction_invalidation();
