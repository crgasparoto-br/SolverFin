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

-- registerCardPurchaseForContext already persists the canonical purchase transaction before
-- its Installment rows inside one database transaction. Capture that explicit transaction id
-- in a transaction-local setting so the following installment inserts can persist it without
-- matching by amount, description or date.
CREATE FUNCTION "capture_card_purchase_transaction_for_installments"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."cardId" IS NOT NULL
     AND NEW."invoiceId" IS NOT NULL
     AND NEW."accountId" IS NULL
     AND NEW."kind" = 'EXPENSE' THEN
    PERFORM set_config('solverfin.card_purchase_transaction_id', NEW."id"::text, true);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Transaction_capture_card_purchase_for_installments"
AFTER INSERT ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "capture_card_purchase_transaction_for_installments"();

CREATE FUNCTION "link_card_purchase_installment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  purchase_transaction_id UUID;
  matched_invoice_id UUID;
  matched_invoice_count INTEGER;
BEGIN
  -- Recurrence installments retain their existing one-occurrence model. This trigger only
  -- completes the canonical one-purchase-to-many-installments relation created by card purchases.
  IF NEW."recurrenceId" IS NOT NULL OR NEW."cardId" IS NULL OR NEW."transactionId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  purchase_transaction_id := NULLIF(
    current_setting('solverfin.card_purchase_transaction_id', true),
    ''
  )::uuid;

  IF purchase_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Canonical card purchase transaction is unavailable for installment %', NEW."id";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Transaction" t
    WHERE t."id" = purchase_transaction_id
      AND t."organizationId" = NEW."organizationId"
      AND t."financialProfileId" = NEW."financialProfileId"
      AND t."cardId" = NEW."cardId"
      AND t."invoiceId" IS NOT NULL
      AND t."accountId" IS NULL
      AND t."kind" = 'EXPENSE'
  ) THEN
    RAISE EXCEPTION 'Captured purchase transaction does not match installment %', NEW."id";
  END IF;

  SELECT COUNT(*)::int, MIN(i."id"::text)::uuid
    INTO matched_invoice_count, matched_invoice_id
  FROM "Invoice" i
  WHERE i."organizationId" = NEW."organizationId"
    AND i."financialProfileId" = NEW."financialProfileId"
    AND i."cardId" = NEW."cardId"
    AND i."dueOn" = NEW."dueOn";

  IF matched_invoice_count <> 1 OR matched_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Expected exactly one invoice for installment % due on %', NEW."id", NEW."dueOn";
  END IF;

  NEW."transactionId" := purchase_transaction_id;
  NEW."invoiceId" := matched_invoice_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Installment_link_card_purchase"
BEFORE INSERT ON "Installment"
FOR EACH ROW
EXECUTE FUNCTION "link_card_purchase_installment"();
