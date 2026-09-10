-- Canonical linkage for installment card purchases.
-- Legacy rows are backfilled only from an already persisted, unique Transaction.installmentId link.

ALTER TABLE "Installment"
  ADD COLUMN "transactionId" UUID,
  ADD COLUMN "invoiceId" UUID;

WITH "unique_legacy_links" AS (
  SELECT
    t."organizationId",
    t."financialProfileId",
    t."installmentId",
    MIN(t."id"::text)::uuid AS "transactionId",
    MIN(t."invoiceId"::text)::uuid AS "invoiceId"
  FROM "Transaction" t
  WHERE t."installmentId" IS NOT NULL
  GROUP BY t."organizationId", t."financialProfileId", t."installmentId"
  HAVING COUNT(*) = 1
)
UPDATE "Installment" i
SET
  "transactionId" = l."transactionId",
  "invoiceId" = l."invoiceId"
FROM "unique_legacy_links" l
WHERE i."id" = l."installmentId"
  AND i."organizationId" = l."organizationId"
  AND i."financialProfileId" = l."financialProfileId";

CREATE INDEX "Installment_organizationId_financialProfileId_transactionId_idx"
  ON "Installment"("organizationId", "financialProfileId", "transactionId");

CREATE INDEX "Installment_organizationId_financialProfileId_invoiceId_idx"
  ON "Installment"("organizationId", "financialProfileId", "invoiceId");

ALTER TABLE "Installment"
  ADD CONSTRAINT "Installment_transactionId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("transactionId", "organizationId", "financialProfileId")
  REFERENCES "Transaction"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Installment"
  ADD CONSTRAINT "Installment_invoiceId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("invoiceId", "organizationId", "financialProfileId")
  REFERENCES "Invoice"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
