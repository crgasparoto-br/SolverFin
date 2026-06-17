-- Allow totalInstallments = 0 as a sentinel for open-ended recurrences
-- (no fixed number of occurrences known), while still enforcing
-- sequenceNumber <= totalInstallments for bounded schedules.
ALTER TABLE "Installment" DROP CONSTRAINT "Installment_sequence_check";
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_sequence_check" CHECK (
  "sequenceNumber" >= 1 AND ("totalInstallments" = 0 OR "totalInstallments" >= "sequenceNumber")
);
