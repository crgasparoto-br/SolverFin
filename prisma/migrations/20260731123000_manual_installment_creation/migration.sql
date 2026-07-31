ALTER TABLE "Transaction"
ADD COLUMN "note" TEXT;

CREATE TABLE "InstallmentCreationRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "financialProfileId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestFingerprint" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentCreationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstallmentCreationRequest_organizationId_financialProfileId_idempotencyKey_key"
ON "InstallmentCreationRequest"("organizationId", "financialProfileId", "idempotencyKey");

CREATE INDEX "InstallmentCreationRequest_organizationId_financialProfileId_createdAt_idx"
ON "InstallmentCreationRequest"("organizationId", "financialProfileId", "createdAt");

ALTER TABLE "InstallmentCreationRequest"
ADD CONSTRAINT "InstallmentCreationRequest_financialProfileId_organizationId_fkey"
FOREIGN KEY ("financialProfileId", "organizationId")
REFERENCES "FinancialProfile"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
