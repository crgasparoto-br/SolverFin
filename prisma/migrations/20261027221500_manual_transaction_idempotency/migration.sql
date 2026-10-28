CREATE TABLE "TransactionCreationRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "financialProfileId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "requestFingerprint" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionCreationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionCreationRequest_organizationId_financialProfileId_idempotencyKey_key"
ON "TransactionCreationRequest"("organizationId", "financialProfileId", "idempotencyKey");

CREATE INDEX "TransactionCreationRequest_organizationId_financialProfileId_createdAt_idx"
ON "TransactionCreationRequest"("organizationId", "financialProfileId", "createdAt");

ALTER TABLE "TransactionCreationRequest"
ADD CONSTRAINT "TransactionCreationRequest_financialProfileId_organizationId_fkey"
FOREIGN KEY ("financialProfileId", "organizationId")
REFERENCES "FinancialProfile"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
