-- Issue #677: a same-currency transfer can repeat as a "Fixo" recurrence.
-- The recurrence keeps both legs: accountId is the source and destinationAccountId the
-- destination. Each materialized occurrence remains a single canonical TRANSFER transaction.

ALTER TABLE "Recurrence"
  ADD COLUMN "destinationAccountId" UUID;

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_destinationAccountId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("destinationAccountId", "organizationId", "financialProfileId")
  REFERENCES "Account" ("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Recurrence_organizationId_financialProfileId_destinationAccountId_idx"
  ON "Recurrence" ("organizationId", "financialProfileId", "destinationAccountId");

-- Legacy rows could only become TRANSFER through occurrence edits; recover their destination
-- from the most recent coherent transfer occurrence. Rows that cannot be recovered are left
-- untouched and the constraint below is created NOT VALID so it governs every new write.
UPDATE "Recurrence" r
   SET "destinationAccountId" = latest."destinationAccountId"
  FROM (
    SELECT DISTINCT ON (t."recurrenceId")
           t."recurrenceId", t."destinationAccountId", t."organizationId", t."financialProfileId"
      FROM "Transaction" t
     WHERE t."kind" = 'TRANSFER'
       AND t."recurrenceId" IS NOT NULL
       AND t."destinationAccountId" IS NOT NULL
       AND t."destinationAccountId" IS DISTINCT FROM t."accountId"
     ORDER BY t."recurrenceId", t."plannedOn" DESC, t."createdAt" DESC
  ) latest
 WHERE r."id" = latest."recurrenceId"
   AND r."organizationId" = latest."organizationId"
   AND r."financialProfileId" = latest."financialProfileId"
   AND r."kind" = 'TRANSFER'
   AND r."destinationAccountId" IS NULL
   AND r."accountId" IS DISTINCT FROM latest."destinationAccountId";

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_transfer_accounts_check" CHECK (
    (
      "kind" = 'TRANSFER'
      AND "accountId" IS NOT NULL
      AND "destinationAccountId" IS NOT NULL
      AND "destinationAccountId" <> "accountId"
    )
    OR ("kind" <> 'TRANSFER' AND "destinationAccountId" IS NULL)
  ) NOT VALID;

-- Transfer recurrences are same-currency only in this contract (#668 keeps cross-currency
-- transfers as single occurrences). Specialized producers that write the rule directly
-- cannot persist a destination whose currency differs from the source leg.
CREATE OR REPLACE FUNCTION "enforceRecurrenceTransferCurrency"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_currency text;
  destination_currency text;
BEGIN
  IF NEW."kind" <> 'TRANSFER' OR NEW."destinationAccountId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT upper(source."currency")
    INTO source_currency
    FROM "Account" source
   WHERE source."id" = NEW."accountId"
     AND source."organizationId" = NEW."organizationId"
     AND source."financialProfileId" = NEW."financialProfileId";

  SELECT upper(destination."currency")
    INTO destination_currency
    FROM "Account" destination
   WHERE destination."id" = NEW."destinationAccountId"
     AND destination."organizationId" = NEW."organizationId"
     AND destination."financialProfileId" = NEW."financialProfileId";

  IF source_currency IS NULL
     OR destination_currency IS NULL
     OR destination_currency <> source_currency
     OR upper(NEW."currency") <> source_currency THEN
    RAISE EXCEPTION 'RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "RecurrenceTransferCurrencyInvariant"
BEFORE INSERT OR UPDATE OF
  "accountId",
  "destinationAccountId",
  "currency",
  "kind",
  "organizationId",
  "financialProfileId"
ON "Recurrence"
FOR EACH ROW
EXECUTE FUNCTION "enforceRecurrenceTransferCurrency"();
