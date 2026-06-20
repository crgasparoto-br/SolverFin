/*
  Warnings:

  - You are about to drop the `ApplicationSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SecurityAuditEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ApplicationSession" DROP CONSTRAINT "ApplicationSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "SecurityAuditEvent" DROP CONSTRAINT "SecurityAuditEvent_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SecurityAuditEvent" DROP CONSTRAINT "SecurityAuditEvent_userId_fkey";

-- DropTable
DROP TABLE "ApplicationSession";

-- DropTable
DROP TABLE "SecurityAuditEvent";

-- RenameForeignKey
ALTER TABLE "PayableReceivable" RENAME CONSTRAINT "PayableReceivable_accountId_organizationId_financialProfileId_f" TO "PayableReceivable_accountId_organizationId_financialProfil_fkey";

-- RenameForeignKey
ALTER TABLE "PayableReceivable" RENAME CONSTRAINT "PayableReceivable_categoryId_organizationId_financialProfileId_" TO "PayableReceivable_categoryId_organizationId_financialProfi_fkey";

-- RenameForeignKey
ALTER TABLE "PayableReceivable" RENAME CONSTRAINT "PayableReceivable_settlementTransactionId_organizationId_financ" TO "PayableReceivable_settlementTransactionId_organizationId_f_fkey";

-- RenameIndex
ALTER INDEX "PayableReceivable_organizationId_financialProfileId_accountId_d" RENAME TO "PayableReceivable_organizationId_financialProfileId_account_idx";

-- RenameIndex
ALTER INDEX "PayableReceivable_organizationId_financialProfileId_categoryId_" RENAME TO "PayableReceivable_organizationId_financialProfileId_categor_idx";

-- RenameIndex
ALTER INDEX "PayableReceivable_organizationId_financialProfileId_kind_status" RENAME TO "PayableReceivable_organizationId_financialProfileId_kind_st_idx";

-- RenameIndex
ALTER INDEX "PayableReceivable_settlementTransactionId_organizationId_financ" RENAME TO "PayableReceivable_settlementTransactionId_organizationId_fi_key";
