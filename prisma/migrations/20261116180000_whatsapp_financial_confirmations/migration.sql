-- #695: only a channel decision journal; financial effects remain in the canonical review transaction.
CREATE TABLE "WhatsappChannelConfirmation" (
  "id" UUID NOT NULL PRIMARY KEY,
  "linkId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "sourceEventId" UUID NOT NULL,
  "decisionEventId" UUID,
  "suggestionId" UUID NOT NULL,
  "fingerprint" VARCHAR(128) NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending_confirmation',
  "version" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "resolvedAt" TIMESTAMPTZ(3),
  "transactionId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappChannelConfirmation_status_check" CHECK ("status" IN (
    'pending_confirmation','confirmed','rejected','cancelled','expired'
  )),
  CONSTRAINT "WhatsappChannelConfirmation_version_check" CHECK ("version" >= 0),
  CONSTRAINT "WhatsappChannelConfirmation_link_fkey"
    FOREIGN KEY ("linkId") REFERENCES "WhatsappChannelLink"("id") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelConfirmation_suggestion_fkey"
    FOREIGN KEY ("suggestionId","organizationId","financialProfileId")
    REFERENCES "AiSuggestion"("id","organizationId","financialProfileId") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelConfirmation_source_event_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "WhatsappChannelEvent"("id") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelConfirmation_decision_event_fkey"
    FOREIGN KEY ("decisionEventId") REFERENCES "WhatsappChannelEvent"("id") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelConfirmation_transaction_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "WhatsappChannelConfirmation_tokenHash_key"
  ON "WhatsappChannelConfirmation"("tokenHash");
CREATE UNIQUE INDEX "WhatsappChannelConfirmation_source_suggestion_key"
  ON "WhatsappChannelConfirmation"("sourceEventId","suggestionId");
CREATE INDEX "WhatsappChannelConfirmation_link_status_expiry_idx"
  ON "WhatsappChannelConfirmation"("linkId","status","expiresAt");
CREATE INDEX "WhatsappChannelConfirmation_profile_suggestion_idx"
  ON "WhatsappChannelConfirmation"("organizationId","financialProfileId","suggestionId");
