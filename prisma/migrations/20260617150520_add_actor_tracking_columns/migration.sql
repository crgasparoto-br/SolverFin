-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "Installment" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;

-- AlterTable
ALTER TABLE "Recurrence" ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "updatedByUserId" UUID;
