-- CreateEnum
CREATE TYPE "PayableReceivableKind" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "PayableReceivableStatus" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditEntityKind" ADD VALUE IF NOT EXISTS 'PAYABLE_RECEIVABLE';

-- CreateTable
CREATE TABLE "PayableReceivable" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "accountId" UUID,
  "categoryId" UUID,
  "settlementTransactionId" UUID,
  "kind" "PayableReceivableKind" NOT NULL,
  "status" "PayableReceivableStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "dueOn" DATE NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayableReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayableReceivable_settlementTransactionId_key" ON "PayableReceivable"("settlementTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PayableReceivable_id_organizationId_financialProfileId_key" ON "PayableReceivable"("id", "organizationId", "financialProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "PayableReceivable_settlementTransactionId_organizationId_financialProfileId_key" ON "PayableReceivable"("settlementTransactionId", "organizationId", "financialProfileId");

-- CreateIndex
CREATE INDEX "PayableReceivable_organizationId_financialProfileId_kind_status_dueOn_idx" ON "PayableReceivable"("organizationId", "financialProfileId", "kind", "status", "dueOn");

-- CreateIndex
CREATE INDEX "PayableReceivable_organizationId_financialProfileId_accountId_dueOn_idx" ON "PayableReceivable"("organizationId", "financialProfileId", "accountId", "dueOn");

-- CreateIndex
CREATE INDEX "PayableReceivable_organizationId_financialProfileId_categoryId_dueOn_idx" ON "PayableReceivable"("organizationId", "financialProfileId", "categoryId", "dueOn");

-- AddForeignKey
ALTER TABLE "PayableReceivable" ADD CONSTRAINT "PayableReceivable_financialProfileId_organizationId_fkey" FOREIGN KEY ("financialProfileId", "organizationId") REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableReceivable" ADD CONSTRAINT "PayableReceivable_accountId_organizationId_financialProfileId_fkey" FOREIGN KEY ("accountId", "organizationId", "financialProfileId") REFERENCES "Account"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableReceivable" ADD CONSTRAINT "PayableReceivable_categoryId_organizationId_financialProfileId_fkey" FOREIGN KEY ("categoryId", "organizationId", "financialProfileId") REFERENCES "Category"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableReceivable" ADD CONSTRAINT "PayableReceivable_settlementTransactionId_organizationId_financialProfileId_fkey" FOREIGN KEY ("settlementTransactionId", "organizationId", "financialProfileId") REFERENCES "Transaction"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT ON UPDATE CASCADE;
