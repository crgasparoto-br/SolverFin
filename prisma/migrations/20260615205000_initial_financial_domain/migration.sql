CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "FinancialContextKind" AS ENUM ('PERSONAL', 'FAMILY', 'MEI', 'BUSINESS');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'BLOCKED');
CREATE TYPE "AccountKind" AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT', 'OTHER');
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE "TransactionKind" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE "TransactionStatus" AS ENUM ('PLANNED', 'POSTED', 'RECONCILED', 'SUGGESTED', 'VOIDED');
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'RECURRENCE', 'INSTALLMENT', 'IMPORT', 'AI_SUGGESTION');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "RecurrenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "InstallmentStatus" AS ENUM ('PLANNED', 'POSTED', 'RECONCILED', 'CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "ImportSourceKind" AS ENUM ('CSV', 'OFX', 'BANK_MESSAGE', 'MANUAL');
CREATE TYPE "ImportStatus" AS ENUM ('RECEIVED', 'PARSED', 'REVIEWING', 'COMPLETED', 'FAILED', 'DISCARDED');
CREATE TYPE "AiSuggestionKind" AS ENUM (
  'TRANSACTION_EXTRACTION',
  'CATEGORIZATION',
  'DEDUPLICATION',
  'RECONCILIATION',
  'INSIGHT'
);
CREATE TYPE "AiSuggestionStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'EDITED',
  'REJECTED',
  'EXPIRED'
);
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'INVOICE', 'STATEMENT', 'MESSAGE', 'OTHER');
CREATE TYPE "AttachmentStatus" AS ENUM ('ACTIVE', 'REDACTED', 'DELETED');
CREATE TYPE "AuditActorKind" AS ENUM ('USER', 'SYSTEM', 'AI', 'IMPORT');
CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'ARCHIVE',
  'RESTORE',
  'SOFT_DELETE',
  'RECONCILE',
  'UNRECONCILE',
  'APPROVE',
  'REJECT'
);
CREATE TYPE "AuditEntityKind" AS ENUM (
  'ACCOUNT',
  'CARD',
  'CATEGORY',
  'TRANSACTION',
  'RECURRENCE',
  'INSTALLMENT',
  'INVOICE',
  'BUDGET',
  'IMPORT_BATCH',
  'AI_SUGGESTION',
  'ATTACHMENT'
);
CREATE TYPE "LinkedEntityKind" AS ENUM ('TRANSACTION', 'INVOICE', 'IMPORT_BATCH', 'AI_SUGGESTION');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(320) NOT NULL,
  "displayName" VARCHAR(160) NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Organization" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerUserId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "kind" "FinancialContextKind" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "kind" "AccountKind" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "openingBalanceMinor" INTEGER NOT NULL DEFAULT 0,
  "maskedIdentifier" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Card" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "paymentAccountId" UUID,
  "name" VARCHAR(160) NOT NULL,
  "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
  "closingDay" INTEGER NOT NULL,
  "dueDay" INTEGER NOT NULL,
  "creditLimitMinor" INTEGER,
  "maskedIdentifier" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Card_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Card_closingDay_check" CHECK ("closingDay" BETWEEN 1 AND 31),
  CONSTRAINT "Card_dueDay_check" CHECK ("dueDay" BETWEEN 1 AND 31),
  CONSTRAINT "Card_creditLimitMinor_check" CHECK (
    "creditLimitMinor" IS NULL OR "creditLimitMinor" >= 0
  )
);

CREATE TABLE "Category" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "parentCategoryId" UUID,
  "name" VARCHAR(160) NOT NULL,
  "kind" "CategoryKind" NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_no_self_parent_check" CHECK (
    "parentCategoryId" IS NULL OR "parentCategoryId" <> "id"
  )
);

CREATE TABLE "Recurrence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "categoryId" UUID,
  "status" "RecurrenceStatus" NOT NULL DEFAULT 'ACTIVE',
  "frequency" "RecurrenceFrequency" NOT NULL,
  "startOn" DATE NOT NULL,
  "endOn" DATE,
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "description" VARCHAR(240) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Recurrence_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "Recurrence_dates_check" CHECK ("endOn" IS NULL OR "endOn" >= "startOn")
);

CREATE TABLE "Installment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "recurrenceId" UUID,
  "cardId" UUID,
  "status" "InstallmentStatus" NOT NULL DEFAULT 'PLANNED',
  "sequenceNumber" INTEGER NOT NULL,
  "totalInstallments" INTEGER NOT NULL,
  "dueOn" DATE NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Installment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Installment_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "Installment_sequence_check" CHECK (
    "sequenceNumber" >= 1 AND "totalInstallments" >= "sequenceNumber"
  )
);

CREATE TABLE "Invoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "cardId" UUID NOT NULL,
  "paymentTransactionId" UUID,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "periodStartOn" DATE NOT NULL,
  "periodEndOn" DATE NOT NULL,
  "dueOn" DATE NOT NULL,
  "totalAmountMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_period_check" CHECK ("periodEndOn" >= "periodStartOn"),
  CONSTRAINT "Invoice_totalAmountMinor_check" CHECK ("totalAmountMinor" >= 0)
);

CREATE TABLE "Budget" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "periodStartOn" DATE NOT NULL,
  "periodEndOn" DATE NOT NULL,
  "plannedAmountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "alertThresholdPercent" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Budget_period_check" CHECK ("periodEndOn" >= "periodStartOn"),
  CONSTRAINT "Budget_plannedAmountMinor_check" CHECK ("plannedAmountMinor" >= 0),
  CONSTRAINT "Budget_alertThresholdPercent_check" CHECK (
    "alertThresholdPercent" IS NULL
    OR ("alertThresholdPercent" >= 1 AND "alertThresholdPercent" <= 100)
  )
);

CREATE TABLE "ImportBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "sourceKind" "ImportSourceKind" NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'RECEIVED',
  "originalFileName" VARCHAR(240),
  "sourceHash" VARCHAR(128) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSuggestion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "kind" "AiSuggestionKind" NOT NULL,
  "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "sourceEntityId" UUID,
  "targetEntityId" UUID,
  "confidence" DECIMAL(5, 4) NOT NULL,
  "explanation" VARCHAR(500) NOT NULL,
  "provider" VARCHAR(80),
  "model" VARCHAR(120),
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiSuggestion_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

CREATE TABLE "Transaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "accountId" UUID,
  "destinationAccountId" UUID,
  "categoryId" UUID,
  "cardId" UUID,
  "invoiceId" UUID,
  "recurrenceId" UUID,
  "installmentId" UUID,
  "importBatchId" UUID,
  "aiSuggestionId" UUID,
  "transferGroupId" UUID,
  "kind" "TransactionKind" NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PLANNED',
  "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "occurredOn" DATE NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "reconciledAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Transaction_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "Transaction_transfer_accounts_check" CHECK (
    (
      "kind" = 'TRANSFER'
      AND "accountId" IS NOT NULL
      AND "destinationAccountId" IS NOT NULL
      AND "accountId" <> "destinationAccountId"
    )
    OR (
      "kind" <> 'TRANSFER'
      AND "destinationAccountId" IS NULL
      AND ("accountId" IS NOT NULL OR "cardId" IS NOT NULL)
    )
  )
);

CREATE TABLE "Attachment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "kind" "AttachmentKind" NOT NULL,
  "status" "AttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "fileName" VARCHAR(240) NOT NULL,
  "mimeType" VARCHAR(120) NOT NULL,
  "storageKey" VARCHAR(500) NOT NULL,
  "linkedEntityId" UUID NOT NULL,
  "linkedEntityKind" "LinkedEntityKind" NOT NULL,
  "redactedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLogEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorKind" "AuditActorKind" NOT NULL,
  "actorId" UUID,
  "action" "AuditAction" NOT NULL,
  "entityKind" "AuditEntityKind" NOT NULL,
  "entityId" UUID NOT NULL,
  "correlationId" VARCHAR(120),
  "reason" VARCHAR(240),
  "redactedChanges" JSONB,
  CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_status_idx" ON "User"("status");

CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");

CREATE UNIQUE INDEX "FinancialProfile_id_organizationId_key" ON "FinancialProfile"("id", "organizationId");
CREATE INDEX "FinancialProfile_organizationId_ownerUserId_idx" ON "FinancialProfile"("organizationId", "ownerUserId");
CREATE INDEX "FinancialProfile_organizationId_status_idx" ON "FinancialProfile"("organizationId", "status");

CREATE UNIQUE INDEX "Account_id_organizationId_financialProfileId_key" ON "Account"("id", "organizationId", "financialProfileId");
CREATE INDEX "Account_organizationId_financialProfileId_status_idx" ON "Account"("organizationId", "financialProfileId", "status");
CREATE INDEX "Account_organizationId_financialProfileId_kind_idx" ON "Account"("organizationId", "financialProfileId", "kind");

CREATE UNIQUE INDEX "Card_id_organizationId_financialProfileId_key" ON "Card"("id", "organizationId", "financialProfileId");
CREATE INDEX "Card_organizationId_financialProfileId_status_idx" ON "Card"("organizationId", "financialProfileId", "status");

CREATE UNIQUE INDEX "Category_id_organizationId_financialProfileId_key" ON "Category"("id", "organizationId", "financialProfileId");
CREATE INDEX "Category_organizationId_financialProfileId_kind_status_idx" ON "Category"("organizationId", "financialProfileId", "kind", "status");
CREATE INDEX "Category_organizationId_financialProfileId_parentCategoryId_idx" ON "Category"("organizationId", "financialProfileId", "parentCategoryId");

CREATE UNIQUE INDEX "Recurrence_id_organizationId_financialProfileId_key" ON "Recurrence"("id", "organizationId", "financialProfileId");
CREATE INDEX "Recurrence_organizationId_financialProfileId_status_idx" ON "Recurrence"("organizationId", "financialProfileId", "status");
CREATE INDEX "Recurrence_organizationId_financialProfileId_startOn_idx" ON "Recurrence"("organizationId", "financialProfileId", "startOn");

CREATE UNIQUE INDEX "Installment_id_organizationId_financialProfileId_key" ON "Installment"("id", "organizationId", "financialProfileId");
CREATE UNIQUE INDEX "Installment_organizationId_financialProfileId_recurrenceId_sequenceNumber_key" ON "Installment"("organizationId", "financialProfileId", "recurrenceId", "sequenceNumber");
CREATE INDEX "Installment_organizationId_financialProfileId_dueOn_idx" ON "Installment"("organizationId", "financialProfileId", "dueOn");
CREATE INDEX "Installment_organizationId_financialProfileId_status_idx" ON "Installment"("organizationId", "financialProfileId", "status");

CREATE UNIQUE INDEX "Invoice_id_organizationId_financialProfileId_key" ON "Invoice"("id", "organizationId", "financialProfileId");
CREATE UNIQUE INDEX "Invoice_paymentTransactionId_key" ON "Invoice"("paymentTransactionId");
CREATE UNIQUE INDEX "Invoice_paymentTransactionId_organizationId_financialProfileId_key" ON "Invoice"("paymentTransactionId", "organizationId", "financialProfileId");
CREATE INDEX "Invoice_organizationId_financialProfileId_cardId_dueOn_idx" ON "Invoice"("organizationId", "financialProfileId", "cardId", "dueOn");
CREATE INDEX "Invoice_organizationId_financialProfileId_status_idx" ON "Invoice"("organizationId", "financialProfileId", "status");

CREATE UNIQUE INDEX "Budget_id_organizationId_financialProfileId_key" ON "Budget"("id", "organizationId", "financialProfileId");
CREATE UNIQUE INDEX "Budget_organizationId_financialProfileId_categoryId_periodStartOn_periodEndOn_key" ON "Budget"("organizationId", "financialProfileId", "categoryId", "periodStartOn", "periodEndOn");
CREATE INDEX "Budget_organizationId_financialProfileId_periodStartOn_periodEndOn_idx" ON "Budget"("organizationId", "financialProfileId", "periodStartOn", "periodEndOn");

CREATE UNIQUE INDEX "ImportBatch_id_organizationId_financialProfileId_key" ON "ImportBatch"("id", "organizationId", "financialProfileId");
CREATE UNIQUE INDEX "ImportBatch_organizationId_financialProfileId_sourceHash_key" ON "ImportBatch"("organizationId", "financialProfileId", "sourceHash");
CREATE INDEX "ImportBatch_organizationId_financialProfileId_sourceKind_status_idx" ON "ImportBatch"("organizationId", "financialProfileId", "sourceKind", "status");
CREATE INDEX "ImportBatch_organizationId_financialProfileId_receivedAt_idx" ON "ImportBatch"("organizationId", "financialProfileId", "receivedAt");

CREATE UNIQUE INDEX "AiSuggestion_id_organizationId_financialProfileId_key" ON "AiSuggestion"("id", "organizationId", "financialProfileId");
CREATE INDEX "AiSuggestion_organizationId_financialProfileId_status_kind_idx" ON "AiSuggestion"("organizationId", "financialProfileId", "status", "kind");
CREATE INDEX "AiSuggestion_organizationId_financialProfileId_sourceEntityId_idx" ON "AiSuggestion"("organizationId", "financialProfileId", "sourceEntityId");
CREATE INDEX "AiSuggestion_organizationId_financialProfileId_targetEntityId_idx" ON "AiSuggestion"("organizationId", "financialProfileId", "targetEntityId");

CREATE UNIQUE INDEX "Transaction_id_organizationId_financialProfileId_key" ON "Transaction"("id", "organizationId", "financialProfileId");
CREATE INDEX "Transaction_organizationId_financialProfileId_occurredOn_idx" ON "Transaction"("organizationId", "financialProfileId", "occurredOn");
CREATE INDEX "Transaction_organizationId_financialProfileId_status_occurredOn_idx" ON "Transaction"("organizationId", "financialProfileId", "status", "occurredOn");
CREATE INDEX "Transaction_organizationId_financialProfileId_accountId_occurredOn_idx" ON "Transaction"("organizationId", "financialProfileId", "accountId", "occurredOn");
CREATE INDEX "Transaction_organizationId_financialProfileId_cardId_occurredOn_idx" ON "Transaction"("organizationId", "financialProfileId", "cardId", "occurredOn");
CREATE INDEX "Transaction_organizationId_financialProfileId_categoryId_occurredOn_idx" ON "Transaction"("organizationId", "financialProfileId", "categoryId", "occurredOn");
CREATE INDEX "Transaction_organizationId_financialProfileId_importBatchId_idx" ON "Transaction"("organizationId", "financialProfileId", "importBatchId");
CREATE INDEX "Transaction_organizationId_financialProfileId_transferGroupId_idx" ON "Transaction"("organizationId", "financialProfileId", "transferGroupId");

CREATE UNIQUE INDEX "Attachment_id_organizationId_financialProfileId_key" ON "Attachment"("id", "organizationId", "financialProfileId");
CREATE INDEX "Attachment_organizationId_financialProfileId_linkedEntityKind_linkedEntityId_idx" ON "Attachment"("organizationId", "financialProfileId", "linkedEntityKind", "linkedEntityId");
CREATE INDEX "Attachment_organizationId_financialProfileId_status_idx" ON "Attachment"("organizationId", "financialProfileId", "status");

CREATE INDEX "AuditLogEntry_organizationId_financialProfileId_occurredAt_idx" ON "AuditLogEntry"("organizationId", "financialProfileId", "occurredAt");
CREATE INDEX "AuditLogEntry_organizationId_financialProfileId_entityKind_entityId_idx" ON "AuditLogEntry"("organizationId", "financialProfileId", "entityKind", "entityId");
CREATE INDEX "AuditLogEntry_organizationId_financialProfileId_correlationId_idx" ON "AuditLogEntry"("organizationId", "financialProfileId", "correlationId");

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialProfile"
  ADD CONSTRAINT "FinancialProfile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinancialProfile_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Card"
  ADD CONSTRAINT "Card_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Card_paymentAccountId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("paymentAccountId", "organizationId", "financialProfileId")
  REFERENCES "Account"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Category_parentCategoryId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("parentCategoryId", "organizationId", "financialProfileId")
  REFERENCES "Category"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Recurrence_accountId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("accountId", "organizationId", "financialProfileId")
  REFERENCES "Account"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Recurrence_categoryId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("categoryId", "organizationId", "financialProfileId")
  REFERENCES "Category"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Installment"
  ADD CONSTRAINT "Installment_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Installment_recurrenceId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("recurrenceId", "organizationId", "financialProfileId")
  REFERENCES "Recurrence"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Installment_cardId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("cardId", "organizationId", "financialProfileId")
  REFERENCES "Card"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_cardId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("cardId", "organizationId", "financialProfileId")
  REFERENCES "Card"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Budget_categoryId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("categoryId", "organizationId", "financialProfileId")
  REFERENCES "Category"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_accountId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("accountId", "organizationId", "financialProfileId")
  REFERENCES "Account"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_destinationAccountId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("destinationAccountId", "organizationId", "financialProfileId")
  REFERENCES "Account"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_categoryId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("categoryId", "organizationId", "financialProfileId")
  REFERENCES "Category"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_cardId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("cardId", "organizationId", "financialProfileId")
  REFERENCES "Card"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_invoiceId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("invoiceId", "organizationId", "financialProfileId")
  REFERENCES "Invoice"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_recurrenceId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("recurrenceId", "organizationId", "financialProfileId")
  REFERENCES "Recurrence"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_installmentId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("installmentId", "organizationId", "financialProfileId")
  REFERENCES "Installment"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_importBatchId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("importBatchId", "organizationId", "financialProfileId")
  REFERENCES "ImportBatch"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Transaction_aiSuggestionId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("aiSuggestionId", "organizationId", "financialProfileId")
  REFERENCES "AiSuggestion"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_paymentTransactionId_organizationId_financialProfileId_fkey"
  FOREIGN KEY ("paymentTransactionId", "organizationId", "financialProfileId")
  REFERENCES "Transaction"("id", "organizationId", "financialProfileId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLogEntry"
  ADD CONSTRAINT "AuditLogEntry_financialProfileId_organizationId_fkey"
  FOREIGN KEY ("financialProfileId", "organizationId")
  REFERENCES "FinancialProfile"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
