-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AiSuggestion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AuditLogEntry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Budget" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Card" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FinancialProfile" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ImportBatch" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Installment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Recurrence" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "Category" RENAME CONSTRAINT "Category_parentCategoryId_organizationId_financialProfileId_fke" TO "Category_parentCategoryId_organizationId_financialProfileI_fkey";

-- RenameForeignKey
ALTER TABLE "Invoice" RENAME CONSTRAINT "Invoice_paymentTransactionId_organizationId_financialProfileId_" TO "Invoice_paymentTransactionId_organizationId_financialProfi_fkey";

-- RenameForeignKey
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_aiSuggestionId_organizationId_financialProfileId_fk" TO "Transaction_aiSuggestionId_organizationId_financialProfile_fkey";

-- RenameForeignKey
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_destinationAccountId_organizationId_financialProfil" TO "Transaction_destinationAccountId_organizationId_financialP_fkey";

-- RenameForeignKey
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_importBatchId_organizationId_financialProfileId_fke" TO "Transaction_importBatchId_organizationId_financialProfileI_fkey";

-- RenameForeignKey
ALTER TABLE "Transaction" RENAME CONSTRAINT "Transaction_installmentId_organizationId_financialProfileId_fke" TO "Transaction_installmentId_organizationId_financialProfileI_fkey";

-- RenameIndex
ALTER INDEX "AiSuggestion_organizationId_financialProfileId_sourceEntityId_i" RENAME TO "AiSuggestion_organizationId_financialProfileId_sourceEntity_idx";

-- RenameIndex
ALTER INDEX "AiSuggestion_organizationId_financialProfileId_targetEntityId_i" RENAME TO "AiSuggestion_organizationId_financialProfileId_targetEntity_idx";

-- RenameIndex
ALTER INDEX "Attachment_organizationId_financialProfileId_linkedEntityKind_l" RENAME TO "Attachment_organizationId_financialProfileId_linkedEntityKi_idx";

-- RenameIndex
ALTER INDEX "AuditLogEntry_organizationId_financialProfileId_correlationId_i" RENAME TO "AuditLogEntry_organizationId_financialProfileId_correlation_idx";

-- RenameIndex
ALTER INDEX "AuditLogEntry_organizationId_financialProfileId_entityKind_enti" RENAME TO "AuditLogEntry_organizationId_financialProfileId_entityKind__idx";

-- RenameIndex
ALTER INDEX "Budget_organizationId_financialProfileId_categoryId_periodStart" RENAME TO "Budget_organizationId_financialProfileId_categoryId_periodS_key";

-- RenameIndex
ALTER INDEX "Budget_organizationId_financialProfileId_periodStartOn_periodEn" RENAME TO "Budget_organizationId_financialProfileId_periodStartOn_peri_idx";

-- RenameIndex
ALTER INDEX "ImportBatch_organizationId_financialProfileId_sourceKind_status" RENAME TO "ImportBatch_organizationId_financialProfileId_sourceKind_st_idx";

-- RenameIndex
ALTER INDEX "Installment_organizationId_financialProfileId_recurrenceId_sequ" RENAME TO "Installment_organizationId_financialProfileId_recurrenceId__key";

-- RenameIndex
ALTER INDEX "Invoice_paymentTransactionId_organizationId_financialProfileId_" RENAME TO "Invoice_paymentTransactionId_organizationId_financialProfil_key";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_accountId_occurre" RENAME TO "Transaction_organizationId_financialProfileId_accountId_occ_idx";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_cardId_occurredOn" RENAME TO "Transaction_organizationId_financialProfileId_cardId_occurr_idx";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_categoryId_occurr" RENAME TO "Transaction_organizationId_financialProfileId_categoryId_oc_idx";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_status_occurredOn" RENAME TO "Transaction_organizationId_financialProfileId_status_occurr_idx";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_transferGroupId_i" RENAME TO "Transaction_organizationId_financialProfileId_transferGroup_idx";
