DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "Transaction" movement
     WHERE (
       movement."accountId" IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM "Account" account
          WHERE account."id" = movement."accountId"
            AND account."organizationId" = movement."organizationId"
            AND account."financialProfileId" = movement."financialProfileId"
            AND upper(account."currency") <> upper(movement."currency")
       )
     ) OR (
       movement."destinationAccountId" IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM "Account" destination
          WHERE destination."id" = movement."destinationAccountId"
            AND destination."organizationId" = movement."organizationId"
            AND destination."financialProfileId" = movement."financialProfileId"
            AND upper(destination."currency") <> upper(movement."currency")
       )
     )
  ) THEN
    RAISE EXCEPTION 'TRANSACTION_CURRENCY_MISMATCH: existing transaction/account currency relationship is inconsistent';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "enforceTransactionAccountCurrency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_currency text;
  destination_currency text;
BEGIN
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

  IF NEW."destinationAccountId" IS NOT NULL THEN
    SELECT upper(destination."currency")
      INTO destination_currency
      FROM "Account" destination
     WHERE destination."id" = NEW."destinationAccountId"
       AND destination."organizationId" = NEW."organizationId"
       AND destination."financialProfileId" = NEW."financialProfileId";

    IF destination_currency IS NOT NULL AND destination_currency <> upper(NEW."currency") THEN
      RAISE EXCEPTION 'TRANSACTION_CURRENCY_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "TransactionAccountCurrencyInvariant"
BEFORE INSERT OR UPDATE OF "accountId", "destinationAccountId", "currency", "organizationId", "financialProfileId"
ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "enforceTransactionAccountCurrency"();
