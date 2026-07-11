-- Multiple recurring purchases for the same card period used to be materialized in
-- parallel. Each request could create its own OPEN invoice before the others became
-- visible. Consolidate those invoice containers while preserving every transaction.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "Invoice" i
      JOIN (
        SELECT
          "organizationId",
          "financialProfileId",
          "cardId",
          "periodStartOn",
          "periodEndOn"
          FROM "Invoice"
         WHERE "status" = 'OPEN'
         GROUP BY
          "organizationId",
          "financialProfileId",
          "cardId",
          "periodStartOn",
          "periodEndOn"
        HAVING COUNT(*) > 1
      ) duplicate_period
        ON duplicate_period."organizationId" = i."organizationId"
       AND duplicate_period."financialProfileId" = i."financialProfileId"
       AND duplicate_period."cardId" = i."cardId"
       AND duplicate_period."periodStartOn" = i."periodStartOn"
       AND duplicate_period."periodEndOn" = i."periodEndOn"
     WHERE i."paymentTransactionId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot consolidate duplicate OPEN invoices with payment transactions';
  END IF;
END $$;

CREATE TEMP TABLE "_InvoiceOpenDuplicateMap" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY
        "organizationId",
        "financialProfileId",
        "cardId",
        "periodStartOn",
        "periodEndOn"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "canonicalId",
    ROW_NUMBER() OVER (
      PARTITION BY
        "organizationId",
        "financialProfileId",
        "cardId",
        "periodStartOn",
        "periodEndOn"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS "position"
    FROM "Invoice"
   WHERE "status" = 'OPEN'
)
SELECT
  "id" AS "duplicateId",
  "canonicalId"
  FROM ranked
 WHERE "position" > 1;

CREATE TEMP TABLE "_InvoiceOpenDuplicateTotals" ON COMMIT DROP AS
SELECT
  duplicate_map."canonicalId",
  SUM(duplicate_invoice."totalAmountMinor") AS "duplicateTotalAmountMinor"
  FROM "_InvoiceOpenDuplicateMap" duplicate_map
  JOIN "Invoice" duplicate_invoice
    ON duplicate_invoice."id" = duplicate_map."duplicateId"
 GROUP BY duplicate_map."canonicalId";

UPDATE "Transaction" transaction_record
   SET "invoiceId" = duplicate_map."canonicalId",
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "_InvoiceOpenDuplicateMap" duplicate_map
 WHERE transaction_record."invoiceId" = duplicate_map."duplicateId";

UPDATE "Invoice" canonical_invoice
   SET "totalAmountMinor" = (
         canonical_invoice."totalAmountMinor" + duplicate_totals."duplicateTotalAmountMinor"
       )::integer,
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "_InvoiceOpenDuplicateTotals" duplicate_totals
 WHERE canonical_invoice."id" = duplicate_totals."canonicalId";

DELETE FROM "Invoice" duplicate_invoice
 USING "_InvoiceOpenDuplicateMap" duplicate_map
 WHERE duplicate_invoice."id" = duplicate_map."duplicateId";

-- Prisma does not currently model partial indexes in schema.prisma. This database
-- guard prevents concurrent requests from creating two OPEN invoices for the same
-- tenant, financial profile, card and billing period.
CREATE UNIQUE INDEX "Invoice_open_card_period_key"
    ON "Invoice" (
      "organizationId",
      "financialProfileId",
      "cardId",
      "periodStartOn",
      "periodEndOn"
    )
 WHERE "status" = 'OPEN';
