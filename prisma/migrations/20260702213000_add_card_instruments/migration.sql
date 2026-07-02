-- CreateEnum
CREATE TYPE "CardInstrumentType" AS ENUM ('PHYSICAL', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "CardInstrumentHolder" AS ENUM ('PRIMARY', 'ADDITIONAL');

-- AlterEnum
ALTER TYPE "AuditEntityKind" ADD VALUE IF NOT EXISTS 'CARD_INSTRUMENT';

-- CreateTable
CREATE TABLE "CardInstrument" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "cardId" UUID NOT NULL,
  "type" "CardInstrumentType" NOT NULL,
  "holder" "CardInstrumentHolder" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "name" VARCHAR(160),
  "maskedIdentifier" VARCHAR(80),
  "creditLimitMinor" INTEGER,
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CardInstrument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CardInstrument_creditLimitMinor_check" CHECK (
    "creditLimitMinor" IS NULL OR "creditLimitMinor" >= 0
  )
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "cardInstrumentId" UUID;

-- AlterTable
ALTER TABLE "Recurrence" ADD COLUMN "cardInstrumentId" UUID;

-- AlterTable
ALTER TABLE "Installment" ADD COLUMN "cardInstrumentId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "CardInstrument_id_organizationId_financialProfileId_key" ON "CardInstrument"("id", "organizationId", "financialProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstrument_one_default_active_per_card" ON "CardInstrument"("organizationId", "financialProfileId", "cardId") WHERE "isDefault" = true AND "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "CardInstrument_organizationId_financialProfileId_cardId_status_idx" ON "CardInstrument"("organizationId", "financialProfileId", "cardId", "status");

-- CreateIndex
CREATE INDEX "CardInstrument_organizationId_financialProfileId_cardId_type_holder_idx" ON "CardInstrument"("organizationId", "financialProfileId", "cardId", "type", "holder");

-- CreateIndex
CREATE INDEX "CardInstrument_organizationId_financialProfileId_status_idx" ON "CardInstrument"("organizationId", "financialProfileId", "status");

-- CreateIndex
CREATE INDEX "Transaction_organizationId_financialProfileId_cardInstrumentId_occurredOn_idx" ON "Transaction"("organizationId", "financialProfileId", "cardInstrumentId", "occurredOn");

-- CreateIndex
CREATE INDEX "Recurrence_organizationId_financialProfileId_cardInstrumentId_idx" ON "Recurrence"("organizationId", "financialProfileId", "cardInstrumentId");

-- CreateIndex
CREATE INDEX "Installment_organizationId_financialProfileId_cardInstrumentId_idx" ON "Installment"("organizationId", "financialProfileId", "cardInstrumentId");

-- AddForeignKey
ALTER TABLE "CardInstrument" ADD CONSTRAINT "CardInstrument_financialProfileId_organizationId_fkey" FOREIGN KEY ("financialProfileId", "organizationId") REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstrument" ADD CONSTRAINT "CardInstrument_cardId_organizationId_financialProfileId_fkey" FOREIGN KEY ("cardId", "organizationId", "financialProfileId") REFERENCES "Card"("id", "organizationId", "financialProfileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardInstrumentId_organizationId_financialProfileId_fkey" FOREIGN KEY ("cardInstrumentId", "organizationId", "financialProfileId") REFERENCES "CardInstrument"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_cardInstrumentId_organizationId_financialProfileId_fkey" FOREIGN KEY ("cardInstrumentId", "organizationId", "financialProfileId") REFERENCES "CardInstrument"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_cardInstrumentId_organizationId_financialProfileId_fkey" FOREIGN KEY ("cardInstrumentId", "organizationId", "financialProfileId") REFERENCES "CardInstrument"("id", "organizationId", "financialProfileId") ON DELETE RESTRICT ON UPDATE CASCADE;
