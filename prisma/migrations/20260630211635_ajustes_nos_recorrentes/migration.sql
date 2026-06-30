/*
  Warnings:

  - You are about to drop the column `note` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the `CardAdditionalLink` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CardAdditionalLink" DROP CONSTRAINT "CardAdditionalLink_card_fkey";

-- DropForeignKey
ALTER TABLE "CardAdditionalLink" DROP CONSTRAINT "CardAdditionalLink_groupCard_fkey";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "note";

-- DropTable
DROP TABLE "CardAdditionalLink";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_accountId_planned" RENAME TO "Transaction_organizationId_financialProfileId_accountId_pla_idx";

-- RenameIndex
ALTER INDEX "Transaction_organizationId_financialProfileId_status_plannedOn_" RENAME TO "Transaction_organizationId_financialProfileId_status_planne_idx";
