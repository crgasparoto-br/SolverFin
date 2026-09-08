ALTER TABLE "Card"
ADD COLUMN "currency" CHAR(3);

-- Preserve an existing mono-currency invoice contract when it is unambiguous.
UPDATE "Card" AS card
SET "currency" = inferred."currency"
FROM (
  SELECT
    "organizationId",
    "financialProfileId",
    "cardId",
    MIN(UPPER(BTRIM("currency"))) AS "currency"
  FROM "Invoice"
  GROUP BY "organizationId", "financialProfileId", "cardId"
  HAVING COUNT(DISTINCT UPPER(BTRIM("currency"))) = 1
) AS inferred
WHERE card."id" = inferred."cardId"
  AND card."organizationId" = inferred."organizationId"
  AND card."financialProfileId" = inferred."financialProfileId";

-- If there is no invoice history, use a single currency already observed on card transactions.
UPDATE "Card" AS card
SET "currency" = inferred."currency"
FROM (
  SELECT
    "organizationId",
    "financialProfileId",
    "cardId",
    MIN(UPPER(BTRIM("currency"))) AS "currency"
  FROM "Transaction"
  WHERE "cardId" IS NOT NULL
  GROUP BY "organizationId", "financialProfileId", "cardId"
  HAVING COUNT(DISTINCT UPPER(BTRIM("currency"))) = 1
) AS inferred
WHERE card."currency" IS NULL
  AND card."id" = inferred."cardId"
  AND card."organizationId" = inferred."organizationId"
  AND card."financialProfileId" = inferred."financialProfileId";

-- Last safe source: the linked payment account, only when the card has no monetary history.
UPDATE "Card" AS card
SET "currency" = UPPER(BTRIM(account."currency"))
FROM "Account" AS account
WHERE card."currency" IS NULL
  AND card."paymentAccountId" = account."id"
  AND card."organizationId" = account."organizationId"
  AND card."financialProfileId" = account."financialProfileId"
  AND NOT EXISTS (
    SELECT 1
    FROM "Invoice" AS invoice
    WHERE invoice."organizationId" = card."organizationId"
      AND invoice."financialProfileId" = card."financialProfileId"
      AND invoice."cardId" = card."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Transaction" AS transaction
    WHERE transaction."organizationId" = card."organizationId"
      AND transaction."financialProfileId" = card."financialProfileId"
      AND transaction."cardId" = card."id"
  );

ALTER TABLE "Card"
ADD CONSTRAINT "Card_currency_check"
CHECK ("currency" IS NULL OR BTRIM("currency") ~ '^[A-Z]{3}$');
