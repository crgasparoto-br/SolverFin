CREATE TABLE "ApplicationSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" VARCHAR(120),

  CONSTRAINT "ApplicationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationSession_tokenHash_key" ON "ApplicationSession"("tokenHash");
CREATE INDEX "ApplicationSession_userId_idx" ON "ApplicationSession"("userId");
CREATE INDEX "ApplicationSession_expiresAt_idx" ON "ApplicationSession"("expiresAt");
CREATE INDEX "ApplicationSession_revokedAt_idx" ON "ApplicationSession"("revokedAt");
CREATE INDEX "ApplicationSession_lastSeenAt_idx" ON "ApplicationSession"("lastSeenAt");

ALTER TABLE "ApplicationSession"
  ADD CONSTRAINT "ApplicationSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SecurityAuditEvent" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "sessionId" UUID,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" VARCHAR(80) NOT NULL,
  "result" VARCHAR(40) NOT NULL,
  "correlationId" VARCHAR(120),
  "metadata" JSONB,

  CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityAuditEvent_userId_occurredAt_idx" ON "SecurityAuditEvent"("userId", "occurredAt");
CREATE INDEX "SecurityAuditEvent_action_occurredAt_idx" ON "SecurityAuditEvent"("action", "occurredAt");
CREATE INDEX "SecurityAuditEvent_correlationId_idx" ON "SecurityAuditEvent"("correlationId");

ALTER TABLE "SecurityAuditEvent"
  ADD CONSTRAINT "SecurityAuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SecurityAuditEvent"
  ADD CONSTRAINT "SecurityAuditEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ApplicationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
