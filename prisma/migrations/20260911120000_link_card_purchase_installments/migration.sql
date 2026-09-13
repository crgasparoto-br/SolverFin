-- New card-purchase schedules receive durable links to their economic purchase and invoice.
-- Existing rows remain unlinked because descriptions, dates and amounts are not safe identity keys.
ALTER TABLE "Installment"
  ADD COLUMN "transactionId" UUID,
  ADD COLUMN "invoiceId" UUID;

CREATE UNIQUE INDEX "Installment_organizationId_financialProfileId_transactionId_sequenceNumber_key"
  ON "Installment"("organizationId", "financialProfileId", "transactionId", "sequenceNumber");

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
