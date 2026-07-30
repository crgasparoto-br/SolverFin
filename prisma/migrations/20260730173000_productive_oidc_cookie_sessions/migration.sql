CREATE TYPE "OidcLoginAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'CONSUMED', 'CANCELLED', 'EXPIRED', 'FAILED');

CREATE TABLE "ApplicationSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" VARCHAR(128) NOT NULL,
  "transport" VARCHAR(24) NOT NULL DEFAULT 'cookie',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" VARCHAR(120),
  CONSTRAINT "ApplicationSession_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "OidcLoginAttempt" (
  "id" UUID NOT NULL,
  "stateHash" VARCHAR(64) NOT NULL,
  "nonceHash" VARCHAR(64) NOT NULL,
  "encryptedCodeVerifier" TEXT NOT NULL,
  "issuer" VARCHAR(500) NOT NULL,
  "returnTo" VARCHAR(2048) NOT NULL,
  "status" "OidcLoginAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "terminalReason" VARCHAR(120),
  CONSTRAINT "OidcLoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationSession_tokenHash_key" ON "ApplicationSession"("tokenHash");
CREATE INDEX "ApplicationSession_userId_idx" ON "ApplicationSession"("userId");
CREATE INDEX "ApplicationSession_expiresAt_idx" ON "ApplicationSession"("expiresAt");
CREATE INDEX "ApplicationSession_revokedAt_idx" ON "ApplicationSession"("revokedAt");
CREATE INDEX "ApplicationSession_lastSeenAt_idx" ON "ApplicationSession"("lastSeenAt");
CREATE INDEX "ApplicationSession_transport_revokedAt_idx" ON "ApplicationSession"("transport", "revokedAt");
CREATE INDEX "SecurityAuditEvent_userId_occurredAt_idx" ON "SecurityAuditEvent"("userId", "occurredAt");
CREATE INDEX "SecurityAuditEvent_action_occurredAt_idx" ON "SecurityAuditEvent"("action", "occurredAt");
CREATE INDEX "SecurityAuditEvent_correlationId_idx" ON "SecurityAuditEvent"("correlationId");
CREATE UNIQUE INDEX "OidcLoginAttempt_stateHash_key" ON "OidcLoginAttempt"("stateHash");
CREATE INDEX "OidcLoginAttempt_status_expiresAt_idx" ON "OidcLoginAttempt"("status", "expiresAt");

ALTER TABLE "ApplicationSession"
  ADD CONSTRAINT "ApplicationSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityAuditEvent"
  ADD CONSTRAINT "SecurityAuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAuditEvent"
  ADD CONSTRAINT "SecurityAuditEvent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ApplicationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- This rollout intentionally invalidates every active legacy/Bearer session.
UPDATE "ApplicationSession"
SET "revokedAt" = CURRENT_TIMESTAMP,
    "revocationReason" = 'auth_transport_migration'
WHERE "revokedAt" IS NULL AND "transport" <> 'cookie';
