-- Issue #691: operational attachments with private database-backed object storage.
ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'CONTRACT';

ALTER TABLE "Attachment"
  ADD COLUMN "byteSize" INTEGER,
  ADD COLUMN "contentSha256" VARCHAR(64);

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_byteSize_positive"
  CHECK ("byteSize" IS NULL OR "byteSize" > 0),
  ADD CONSTRAINT "Attachment_contentSha256_format"
  CHECK ("contentSha256" IS NULL OR "contentSha256" ~ '^[0-9a-f]{64}$');

CREATE TABLE "AttachmentObject" (
  "storageKey" VARCHAR(500) NOT NULL,
  "content" BYTEA NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "contentSha256" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttachmentObject_pkey" PRIMARY KEY ("storageKey"),
  CONSTRAINT "AttachmentObject_byteSize_positive" CHECK ("byteSize" > 0),
  CONSTRAINT "AttachmentObject_byteSize_matches_content" CHECK ("byteSize" = octet_length("content")),
  CONSTRAINT "AttachmentObject_contentSha256_format" CHECK ("contentSha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "Attachment_contentSha256_idx"
  ON "Attachment" ("organizationId", "financialProfileId", "contentSha256");
