CREATE OR REPLACE FUNCTION "enforceAccountTransactionCurrency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."financialProfileId" IS DISTINCT FROM OLD."financialProfileId" THEN
    IF EXISTS (
      SELECT 1
        FROM "Transaction" movement
       WHERE movement."organizationId" = OLD."organizationId"
         AND movement."financialProfileId" = OLD."financialProfileId"
         AND (movement."accountId" = OLD."id" OR movement."destinationAccountId" = OLD."id")
         AND (
           movement."organizationId" <> NEW."organizationId"
           OR movement."financialProfileId" <> NEW."financialProfileId"
           OR upper(movement."currency") <> upper(NEW."currency")
         )
    ) THEN
      RAISE EXCEPTION 'TRANSACTION_CURRENCY_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AccountTransactionCurrencyInvariant"
BEFORE UPDATE OF "currency", "organizationId", "financialProfileId"
ON "Account"
FOR EACH ROW
EXECUTE FUNCTION "enforceAccountTransactionCurrency"();
