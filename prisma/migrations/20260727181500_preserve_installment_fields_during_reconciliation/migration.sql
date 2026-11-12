-- Preserve the safe editable fields of canonical installment transactions when
-- an operational reconciliation request resumes after reading an older row
-- version. The application intentionally allows status-only reconciliation and
-- unreconciliation through the generic transaction endpoint, while description,
-- note and category are maintained through PATCH /api/installments/:id.
CREATE OR REPLACE FUNCTION "preserve_installment_fields_during_reconciliation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."installmentId" IS NOT NULL
     AND (
       (OLD."status" IN ('PLANNED', 'POSTED') AND NEW."status" = 'RECONCILED')
       OR (OLD."status" = 'RECONCILED' AND NEW."status" = 'POSTED')
     )
  THEN
    NEW."description" := OLD."description";
    NEW."note" := OLD."note";
    NEW."categoryId" := OLD."categoryId";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "preserve_installment_fields_during_reconciliation_trigger"
ON "Transaction";

CREATE TRIGGER "preserve_installment_fields_during_reconciliation_trigger"
BEFORE UPDATE ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "preserve_installment_fields_during_reconciliation"();
