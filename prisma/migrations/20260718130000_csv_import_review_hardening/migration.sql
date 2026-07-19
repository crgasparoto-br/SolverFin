ALTER TYPE "AuditEntityKind" ADD VALUE IF NOT EXISTS 'PRIVACY_CONSENT';

ALTER TABLE "ImportBatch"
  ADD COLUMN "contentHash" VARCHAR(80);

CREATE INDEX "ImportBatch_organizationId_financialProfileId_contentHash_idx"
  ON "ImportBatch"("organizationId", "financialProfileId", "contentHash");
