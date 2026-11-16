-- Meta BSUIDs can exceed 80 characters (ISO country code, optional ENT, 128 chars).
-- Existing WhatsApp channel installations retain their data and idempotency state.
ALTER TABLE "WhatsappChannelLink" ALTER COLUMN "senderId" TYPE VARCHAR(160);
ALTER TABLE "WhatsappChannelEvent" ALTER COLUMN "senderId" TYPE VARCHAR(160);
