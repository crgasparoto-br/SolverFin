ALTER TABLE "Card"
ADD COLUMN "currency" CHAR(3);

-- Backfill only when every available monetary signal converges to one valid currency.
-- Invoice history, card transactions and the linked payment account are peers here:
-- conflicting evidence leaves the legacy card unresolved for explicit user review.
WITH currency_candidates AS (
  SELECT
    invoice."organizationId",
    invoice."financialProfileId",
    invoice."cardId",
    UPPER(BTRIM(invoice."currency")) AS "currency"
  FROM "Invoice" AS invoice

  UNION ALL

  SELECT
    transaction."organizationId",
    transaction."financialProfileId",
    transaction."cardId",
    UPPER(BTRIM(transaction."currency")) AS "currency"
  FROM "Transaction" AS transaction
  WHERE transaction."cardId" IS NOT NULL

  UNION ALL

  SELECT
    card."organizationId",
    card."financialProfileId",
    card."id" AS "cardId",
    UPPER(BTRIM(account."currency")) AS "currency"
  FROM "Card" AS card
  INNER JOIN "Account" AS account
    ON account."id" = card."paymentAccountId"
   AND account."organizationId" = card."organizationId"
   AND account."financialProfileId" = card."financialProfileId"
),
unambiguous_currency AS (
  SELECT
    "organizationId",
    "financialProfileId",
    "cardId",
    MIN("currency") AS "currency"
  FROM currency_candidates
  GROUP BY "organizationId", "financialProfileId", "cardId"
  HAVING COUNT(DISTINCT "currency") = 1
     AND BOOL_AND("currency" ~ '^[A-Z]{3}$')
)
UPDATE "Card" AS card
SET "currency" = inferred."currency"
FROM unambiguous_currency AS inferred
WHERE card."currency" IS NULL
  AND card."id" = inferred."cardId"
  AND card."organizationId" = inferred."organizationId"
  AND card."financialProfileId" = inferred."financialProfileId";

ALTER TABLE "Card"
ADD CONSTRAINT "Card_currency_check"
CHECK ("currency" IS NULL OR BTRIM("currency") ~ '^[A-Z]{3}$');
