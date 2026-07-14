ALTER TYPE "TransactionSource" ADD VALUE IF NOT EXISTS 'ACCOUNT_REMUNERATION';

CREATE TABLE "FinancialIndexRate" (
  "id" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "referenceOn" DATE NOT NULL,
  "dailyRatePercent" DECIMAL(18, 12) NOT NULL,
  "dailyFactor" DECIMAL(18, 12) NOT NULL,
  "source" VARCHAR(120) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialIndexRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialIndexRate_kind_referenceOn_key" UNIQUE ("kind", "referenceOn"),
  CONSTRAINT "FinancialIndexRate_dailyRatePercent_check" CHECK ("dailyRatePercent" > 0),
  CONSTRAINT "FinancialIndexRate_dailyFactor_check" CHECK ("dailyFactor" > 1)
);

CREATE INDEX "FinancialIndexRate_kind_referenceOn_idx"
  ON "FinancialIndexRate"("kind", "referenceOn" DESC);

CREATE TABLE "FinancialIndexOperation" (
  "id" UUID NOT NULL,
  "kind" VARCHAR(48) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "pendingCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "message" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialIndexOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialIndexOperation_kind_startedAt_idx"
  ON "FinancialIndexOperation"("kind", "startedAt" DESC);

CREATE TABLE "AccountRemunerationConfiguration" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "indexKind" VARCHAR(32) NOT NULL DEFAULT 'CDI',
  "remunerationPercent" DECIMAL(9, 4),
  "startsOn" DATE,
  "categoryId" UUID,
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountRemunerationConfiguration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountRemunerationConfiguration_account_key"
    UNIQUE ("organizationId", "financialProfileId", "accountId"),
  CONSTRAINT "AccountRemunerationConfiguration_percent_check"
    CHECK ("remunerationPercent" IS NULL OR ("remunerationPercent" > 0 AND "remunerationPercent" <= 1000)),
  CONSTRAINT "AccountRemunerationConfiguration_enabled_fields_check"
    CHECK (NOT "enabled" OR ("remunerationPercent" IS NOT NULL AND "startsOn" IS NOT NULL)),
  CONSTRAINT "AccountRemunerationConfiguration_account_fkey"
    FOREIGN KEY ("accountId", "organizationId", "financialProfileId")
    REFERENCES "Account"("id", "organizationId", "financialProfileId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountRemunerationConfiguration_category_fkey"
    FOREIGN KEY ("categoryId", "organizationId", "financialProfileId")
    REFERENCES "Category"("id", "organizationId", "financialProfileId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccountRemunerationConfiguration_scope_enabled_idx"
  ON "AccountRemunerationConfiguration"("organizationId", "financialProfileId", "enabled");

CREATE TABLE "AccountRemuneration" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "financialIndexRateId" UUID NOT NULL,
  "transactionId" UUID NOT NULL,
  "indexKind" VARCHAR(32) NOT NULL DEFAULT 'CDI',
  "competenceOn" DATE NOT NULL,
  "processedOn" DATE NOT NULL,
  "balanceBaseMinor" INTEGER NOT NULL,
  "dailyRatePercent" DECIMAL(18, 12) NOT NULL,
  "remunerationPercent" DECIMAL(9, 4) NOT NULL,
  "appliedDailyRatePercent" DECIMAL(18, 12) NOT NULL,
  "originalAmountMinor" INTEGER NOT NULL,
  "manuallyAdjusted" BOOLEAN NOT NULL DEFAULT FALSE,
  "adjustedAt" TIMESTAMP(3),
  "adjustedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountRemuneration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountRemuneration_transactionId_key" UNIQUE ("transactionId"),
  CONSTRAINT "AccountRemuneration_competence_key"
    UNIQUE ("organizationId", "financialProfileId", "accountId", "competenceOn", "indexKind"),
  CONSTRAINT "AccountRemuneration_positive_values_check"
    CHECK ("balanceBaseMinor" > 0 AND "originalAmountMinor" > 0 AND "dailyRatePercent" > 0 AND "remunerationPercent" > 0),
  CONSTRAINT "AccountRemuneration_account_fkey"
    FOREIGN KEY ("accountId", "organizationId", "financialProfileId")
    REFERENCES "Account"("id", "organizationId", "financialProfileId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountRemuneration_rate_fkey"
    FOREIGN KEY ("financialIndexRateId") REFERENCES "FinancialIndexRate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountRemuneration_transaction_fkey"
    FOREIGN KEY ("transactionId", "organizationId", "financialProfileId")
    REFERENCES "Transaction"("id", "organizationId", "financialProfileId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccountRemuneration_scope_account_competence_idx"
  ON "AccountRemuneration"("organizationId", "financialProfileId", "accountId", "competenceOn" DESC);
CREATE INDEX "AccountRemuneration_adjusted_idx"
  ON "AccountRemuneration"("manuallyAdjusted", "adjustedAt" DESC);

CREATE OR REPLACE FUNCTION "markAccountRemunerationManualAdjustment"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor" THEN
    UPDATE "AccountRemuneration"
       SET "manuallyAdjusted" = TRUE,
           "adjustedAt" = CURRENT_TIMESTAMP,
           "adjustedByUserId" = NEW."updatedByUserId",
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "transactionId" = NEW."id"
       AND "originalAmountMinor" IS DISTINCT FROM NEW."amountMinor";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Transaction_account_remuneration_adjustment_trigger"
AFTER UPDATE OF "amountMinor" ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "markAccountRemunerationManualAdjustment"();
