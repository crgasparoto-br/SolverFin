ALTER TABLE "Transaction"
  ADD COLUMN "destinationAmountMinor" BIGINT,
  ADD COLUMN "destinationCurrency" CHAR(3);

UPDATE "Transaction"
   SET "destinationAmountMinor" = "amountMinor",
       "destinationCurrency" = upper("currency")
 WHERE "kind" = 'TRANSFER';

DROP TRIGGER IF EXISTS "TransactionAccountCurrencyInvariant" ON "Transaction";

CREATE OR REPLACE FUNCTION "enforceTransactionAccountCurrency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_currency text;
  destination_currency text;
BEGIN
  source_currency := NULL;
  destination_currency := NULL;

  IF NEW."accountId" IS NOT NULL THEN
    SELECT upper(account."currency")
      INTO source_currency
      FROM "Account" account
     WHERE account."id" = NEW."accountId"
       AND account."organizationId" = NEW."organizationId"
       AND account."financialProfileId" = NEW."financialProfileId";

    IF source_currency IS NOT NULL AND source_currency <> upper(NEW."currency") THEN
      RAISE EXCEPTION 'TRANSACTION_CURRENCY_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."kind" = 'TRANSFER' THEN
    IF NEW."destinationAccountId" IS NULL THEN
      RAISE EXCEPTION 'TRANSACTION_DESTINATION_ACCOUNT_REQUIRED'
        USING ERRCODE = '23514';
    END IF;

    SELECT upper(destination."currency")
      INTO destination_currency
      FROM "Account" destination
     WHERE destination."id" = NEW."destinationAccountId"
       AND destination."organizationId" = NEW."organizationId"
       AND destination."financialProfileId" = NEW."financialProfileId";

    IF destination_currency IS NULL THEN
      RAISE EXCEPTION 'TRANSACTION_DESTINATION_ACCOUNT_INVALID'
        USING ERRCODE = '23514';
    END IF;

    NEW."destinationCurrency" := destination_currency;

    IF destination_currency = upper(NEW."currency") THEN
      NEW."destinationAmountMinor" := NEW."amountMinor";
    ELSE
      IF NEW."destinationAmountMinor" IS NULL THEN
        RAISE EXCEPTION 'TRANSACTION_DESTINATION_AMOUNT_REQUIRED'
          USING ERRCODE = '23514';
      END IF;
      IF NEW."destinationAmountMinor" <= 0 THEN
        RAISE EXCEPTION 'TRANSACTION_DESTINATION_AMOUNT_INVALID'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    NEW."destinationAmountMinor" := NULL;
    NEW."destinationCurrency" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "TransactionAccountCurrencyInvariant"
BEFORE INSERT OR UPDATE OF
  "accountId",
  "destinationAccountId",
  "amountMinor",
  "currency",
  "destinationAmountMinor",
  "destinationCurrency",
  "kind",
  "organizationId",
  "financialProfileId"
ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "enforceTransactionAccountCurrency"();
