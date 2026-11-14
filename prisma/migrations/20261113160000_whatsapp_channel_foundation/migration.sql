-- #694: isolated, explicitly confirmed channel identities and event/outbound journal.
-- No inbound message text, webhook payload, app secret, access token, or provider prompt
-- is ever written to these tables. Response copy is erased after delivery or TTL.
CREATE TABLE "WhatsappChannelLink" (
  "id" UUID NOT NULL PRIMARY KEY,
  "provider" VARCHAR(32) NOT NULL DEFAULT 'meta_whatsapp',
  "accountId" VARCHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "senderId" VARCHAR(80),
  "challengeHash" VARCHAR(64),
  "state" VARCHAR(28) NOT NULL DEFAULT 'pending',
  "version" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "confirmedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappChannelLink_state_check" CHECK ("state" IN
    ('pending', 'awaiting_confirmation', 'active', 'cancelled', 'expired', 'revoked')),
  CONSTRAINT "WhatsappChannelLink_version_check" CHECK ("version" >= 0),
  CONSTRAINT "WhatsappChannelLink_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelLink_profile_fkey"
    FOREIGN KEY ("financialProfileId","organizationId")
    REFERENCES "FinancialProfile"("id","organizationId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "WhatsappChannelLink_active_sender"
  ON "WhatsappChannelLink" ("provider","accountId","senderId") WHERE "state"='active';
CREATE UNIQUE INDEX "WhatsappChannelLink_challenge_hash"
  ON "WhatsappChannelLink" ("challengeHash") WHERE "challengeHash" IS NOT NULL;
CREATE INDEX "WhatsappChannelLink_context_idx"
  ON "WhatsappChannelLink" ("userId","organizationId","financialProfileId","state");
CREATE INDEX "WhatsappChannelLink_cleanup_idx" ON "WhatsappChannelLink" ("state","expiresAt");

CREATE TABLE "WhatsappChannelEvent" (
  "id" UUID NOT NULL PRIMARY KEY,
  "provider" VARCHAR(32) NOT NULL,
  "accountId" VARCHAR(64) NOT NULL,
  "providerMessageId" VARCHAR(200) NOT NULL,
  "senderId" VARCHAR(80),
  "linkId" UUID,
  "userId" UUID,
  "organizationId" UUID,
  "financialProfileId" UUID,
  "assistantConversationId" UUID,
  "suggestionId" UUID,
  "importBatchId" UUID,
  "state" VARCHAR(28) NOT NULL DEFAULT 'received',
  "outcome" VARCHAR(40),
  "version" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "replyText" TEXT,
  "outboundProviderMessageId" VARCHAR(200),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappChannelEvent_state_check" CHECK ("state" IN
    ('received','processing','failure_retryable','response_ready','sending',
     'sent','send_unknown','expired','cancelled')),
  CONSTRAINT "WhatsappChannelEvent_version_check" CHECK ("version" >= 0),
  CONSTRAINT "WhatsappChannelEvent_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "WhatsappChannelEvent_reply_limit" CHECK (
    "replyText" IS NULL OR char_length("replyText") <= 4000
  ),
  CONSTRAINT "WhatsappChannelEvent_scope_complete" CHECK (
    ("userId" IS NULL AND "organizationId" IS NULL AND "financialProfileId" IS NULL)
    OR ("userId" IS NOT NULL AND "organizationId" IS NOT NULL AND "financialProfileId" IS NOT NULL)
  ),
  CONSTRAINT "WhatsappChannelEvent_link_fkey" FOREIGN KEY ("linkId")
    REFERENCES "WhatsappChannelLink"("id") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelEvent_user_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "WhatsappChannelEvent_profile_fkey" FOREIGN KEY ("financialProfileId","organizationId")
    REFERENCES "FinancialProfile"("id","organizationId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "WhatsappChannelEvent_provider_message_key"
  ON "WhatsappChannelEvent" ("provider","accountId","providerMessageId");
CREATE INDEX "WhatsappChannelEvent_expiry_idx" ON "WhatsappChannelEvent"("expiresAt","state");
CREATE INDEX "WhatsappChannelEvent_sender_idx" ON "WhatsappChannelEvent"("provider","accountId","senderId","receivedAt" DESC);
CREATE INDEX "WhatsappChannelEvent_link_idx" ON "WhatsappChannelEvent"("linkId","receivedAt" DESC);
