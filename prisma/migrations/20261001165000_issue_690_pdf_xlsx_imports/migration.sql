ALTER TYPE "ImportSourceKind" ADD VALUE IF NOT EXISTS 'XLSX';
ALTER TYPE "ImportSourceKind" ADD VALUE IF NOT EXISTS 'PDF';

ALTER TABLE "ImportBatch"
  ADD COLUMN "defaultCardId" UUID,
  ADD COLUMN "documentClass" VARCHAR(40),
  ADD COLUMN "parserId" VARCHAR(120),
  ADD COLUMN "parserVersion" VARCHAR(40),
  ADD COLUMN "xlsxSheetName" VARCHAR(120),
  ADD COLUMN "xlsxMapping" JSONB;

CREATE INDEX "ImportBatch_organizationId_financialProfileId_defaultCardId_idx"
  ON "ImportBatch"("organizationId", "financialProfileId", "defaultCardId");

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_defaultCardId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("defaultCardId", "organizationId", "financialProfileId")
  REFERENCES "Card"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
