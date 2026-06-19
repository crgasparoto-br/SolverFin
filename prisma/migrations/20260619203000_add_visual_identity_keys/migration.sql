-- Add optional catalog keys for account/card visual identification.
ALTER TABLE "Account" ADD COLUMN "institutionKey" VARCHAR(80);

ALTER TABLE "Card" ADD COLUMN "institutionKey" VARCHAR(80);
ALTER TABLE "Card" ADD COLUMN "brandKey" VARCHAR(80);

CREATE INDEX "Account_organizationId_financialProfileId_institutionKey_idx"
  ON "Account" ("organizationId", "financialProfileId", "institutionKey");

CREATE INDEX "Card_organizationId_financialProfileId_institutionKey_idx"
  ON "Card" ("organizationId", "financialProfileId", "institutionKey");

CREATE INDEX "Card_organizationId_financialProfileId_brandKey_idx"
  ON "Card" ("organizationId", "financialProfileId", "brandKey");
