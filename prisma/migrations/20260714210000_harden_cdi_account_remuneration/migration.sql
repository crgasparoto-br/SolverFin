ALTER TABLE "AccountRemuneration"
  ADD COLUMN "status" VARCHAR(48) NOT NULL DEFAULT 'CREATED';

ALTER TABLE "AccountRemuneration"
  ALTER COLUMN "transactionId" DROP NOT NULL;

ALTER TABLE "AccountRemuneration"
  DROP CONSTRAINT IF EXISTS "AccountRemuneration_positive_values_check";

ALTER TABLE "AccountRemuneration"
  ADD CONSTRAINT "AccountRemuneration_result_check"
  CHECK (
    "dailyRatePercent" > 0
    AND "remunerationPercent" > 0
    AND "originalAmountMinor" >= 0
    AND (
      (
        "status" = 'CREATED'
        AND "transactionId" IS NOT NULL
        AND "balanceBaseMinor" > 0
        AND "originalAmountMinor" > 0
      )
      OR
      (
        "status" = 'SKIPPED_NON_POSITIVE_BALANCE'
        AND "transactionId" IS NULL
        AND "balanceBaseMinor" <= 0
        AND "originalAmountMinor" = 0
      )
      OR
      (
        "status" = 'SKIPPED_ZERO_AMOUNT'
        AND "transactionId" IS NULL
        AND "balanceBaseMinor" > 0
        AND "originalAmountMinor" = 0
      )
    )
  );

CREATE INDEX "AccountRemuneration_status_competence_idx"
  ON "AccountRemuneration"("status", "competenceOn" DESC);

CREATE OR REPLACE FUNCTION "protectAccountRemunerationTransactionIdentity"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "AccountRemuneration" ar
     WHERE ar."transactionId" = OLD."id"
  ) AND (
    NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."financialProfileId" IS DISTINCT FROM OLD."financialProfileId"
    OR NEW."accountId" IS DISTINCT FROM OLD."accountId"
    OR NEW."destinationAccountId" IS DISTINCT FROM OLD."destinationAccountId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."occurredOn" IS DISTINCT FROM OLD."occurredOn"
    OR NEW."plannedOn" IS DISTINCT FROM OLD."plannedOn"
    OR NEW."description" IS DISTINCT FROM OLD."description"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Lançamentos de remuneração permitem alterar somente valor, categoria e conciliação.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Transaction_account_remuneration_identity_guard"
BEFORE UPDATE ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "protectAccountRemunerationTransactionIdentity"();
