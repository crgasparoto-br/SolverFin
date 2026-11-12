-- #693: recipient-scoped deterministic notifications and durable external-channel outbox.
ALTER TYPE "AuditEntityKind" ADD VALUE IF NOT EXISTS 'FINANCIAL_NOTIFICATION';

CREATE TABLE "FinancialNotification" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "eventType" VARCHAR(96) NOT NULL,
  "fingerprint" VARCHAR(71) NOT NULL,
  "facts" JSONB NOT NULL,
  "resourceKind" VARCHAR(32),
  "resourceId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "inAppVisible" BOOLEAN NOT NULL DEFAULT true,
  "readAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialNotification_fingerprint_valid" CHECK (
    "fingerprint" ~ '^sha256-[0-9a-f]{64}$'
  ),
  CONSTRAINT "FinancialNotification_facts_object" CHECK (
    jsonb_typeof("facts") = 'object'
  ),
  CONSTRAINT "FinancialNotification_resource_pair" CHECK (
    ("resourceKind" IS NULL) = ("resourceId" IS NULL)
  ),
  CONSTRAINT "FinancialNotification_profile_fkey" FOREIGN KEY (
    "financialProfileId", "organizationId"
  ) REFERENCES "FinancialProfile" ("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialNotification_recipient_fkey" FOREIGN KEY (
    "recipientUserId"
  ) REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinancialNotification_scoped_id_key" ON "FinancialNotification" (
  "id", "organizationId", "financialProfileId", "recipientUserId"
);
CREATE UNIQUE INDEX "FinancialNotification_dedup_key" ON "FinancialNotification" (
  "organizationId", "financialProfileId", "recipientUserId", "eventType", "fingerprint"
);
CREATE INDEX "FinancialNotification_feed_idx" ON "FinancialNotification" (
  "organizationId", "financialProfileId", "recipientUserId", "inAppVisible", "occurredAt" DESC, "id" DESC
);
CREATE INDEX "FinancialNotification_read_idx" ON "FinancialNotification" (
  "organizationId", "financialProfileId", "recipientUserId", "inAppVisible", "readAt"
);

CREATE TABLE "FinancialNotificationPreference" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "eventType" VARCHAR(96) NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialNotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialNotificationPreference_channel_check" CHECK (
    "channel" IN ('in_app', 'push', 'email')
  ),
  CONSTRAINT "FinancialNotificationPreference_profile_fkey" FOREIGN KEY (
    "financialProfileId", "organizationId"
  ) REFERENCES "FinancialProfile" ("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialNotificationPreference_recipient_fkey" FOREIGN KEY (
    "recipientUserId"
  ) REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialNotificationPreference_scoped_key" ON "FinancialNotificationPreference" (
  "organizationId", "financialProfileId", "recipientUserId", "eventType", "channel"
);
CREATE INDEX "FinancialNotificationPreference_list_idx" ON "FinancialNotificationPreference" (
  "organizationId", "financialProfileId", "recipientUserId"
);

CREATE TABLE "FinancialNotificationDelivery" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "financialProfileId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "state" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "lockedUntil" TIMESTAMPTZ(3),
  "lastErrorCode" VARCHAR(60),
  "deliveredAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialNotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialNotificationDelivery_channel_check" CHECK ("channel" IN ('push', 'email')),
  CONSTRAINT "FinancialNotificationDelivery_state_check" CHECK (
    "state" IN ('pending', 'leased', 'retry', 'delivered', 'disabled')
  ),
  CONSTRAINT "FinancialNotificationDelivery_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "FinancialNotificationDelivery_fkey" FOREIGN KEY (
    "notificationId", "organizationId", "financialProfileId", "recipientUserId"
  ) REFERENCES "FinancialNotification" (
    "id", "organizationId", "financialProfileId", "recipientUserId"
  ) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialNotificationDelivery_notification_channel_key"
  ON "FinancialNotificationDelivery" ("notificationId", "channel");
CREATE INDEX "FinancialNotificationDelivery_retry_idx" ON "FinancialNotificationDelivery" (
  "channel", "state", "nextAttemptAt"
);
CREATE INDEX "FinancialNotificationDelivery_scope_idx" ON "FinancialNotificationDelivery" (
  "organizationId", "financialProfileId", "recipientUserId"
);
