CREATE TYPE "AutomationRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "AutomationRule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "AutomationRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "explanation" VARCHAR(240),
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationRule_id_organizationId_financialProfileId_key"
  ON "AutomationRule"("id", "organizationId", "financialProfileId");

CREATE INDEX "AutomationRule_organizationId_financialProfileId_status_idx"
  ON "AutomationRule"("organizationId", "financialProfileId", "status");

CREATE INDEX "AutomationRule_organizationId_financialProfileId_priority_idx"
  ON "AutomationRule"("organizationId", "financialProfileId", "priority");

ALTER TABLE "AutomationRule"
  ADD CONSTRAINT "AutomationRule_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
