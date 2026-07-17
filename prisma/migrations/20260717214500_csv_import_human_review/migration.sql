ALTER TABLE "ImportBatch"
  ADD COLUMN "defaultAccountId" UUID,
  ADD COLUMN "totalRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "validRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "duplicateRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "problemRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "problems" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "csvDelimiter" VARCHAR(1),
  ADD COLUMN "csvMapping" JSONB;

ALTER TABLE "AiSuggestion"
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "sourceSuggestionId" UUID,
  ADD COLUMN "payloadFingerprint" VARCHAR(128);

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_defaultAccountId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("defaultAccountId", "organizationId", "financialProfileId")
  REFERENCES "Account"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_row_counts_check"
  CHECK (
    "totalRows" >= 0 AND
    "validRows" >= 0 AND
    "duplicateRows" >= 0 AND
    "problemRows" >= 0 AND
    "validRows" <= "totalRows" AND
    "duplicateRows" <= "validRows" AND
    "problemRows" <= "totalRows"
  );

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_csvDelimiter_check"
  CHECK ("csvDelimiter" IS NULL OR "csvDelimiter" IN (',', ';'));

CREATE INDEX "ImportBatch_organizationId_financialProfileId_defaultAccountId_idx"
  ON "ImportBatch"("organizationId", "financialProfileId", "defaultAccountId");

CREATE UNIQUE INDEX "Transaction_organizationId_financialProfileId_aiSuggestionId_key"
  ON "Transaction"("organizationId", "financialProfileId", "aiSuggestionId");

CREATE UNIQUE INDEX "AiSuggestion_deterministic_import_review_key"
  ON "AiSuggestion"(
    "organizationId",
    "financialProfileId",
    "kind",
    "sourceSuggestionId",
    "payloadFingerprint",
    "targetEntityId"
  );

CREATE INDEX "AiSuggestion_organizationId_financialProfileId_sourceSuggestionId_idx"
  ON "AiSuggestion"("organizationId", "financialProfileId", "sourceSuggestionId");
