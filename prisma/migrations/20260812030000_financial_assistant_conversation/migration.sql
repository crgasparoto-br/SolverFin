-- Persisted, tenant-scoped state for the read-only financial assistant.
-- Raw provider prompts/responses are intentionally not stored.

create table "FinancialAssistantConversation" (
  "id" uuid primary key,
  "organizationId" uuid not null,
  "financialProfileId" uuid not null,
  "userId" uuid not null,
  "status" varchar(32) not null,
  "version" integer not null default 0,
  "currency" char(3),
  "pendingIntent" varchar(48),
  "pendingQuestion" varchar(1000),
  "pendingFilters" jsonb not null default '{}'::jsonb,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "FinancialAssistantConversation_status_check"
    check ("status" in ('ACTIVE', 'PROCESSING', 'AWAITING_CLARIFICATION', 'ANSWERED', 'FAILED', 'CANCELLED', 'EXPIRED')),
  constraint "FinancialAssistantConversation_currency_check"
    check ("currency" is null or "currency" ~ '^[A-Z]{3}$'),
  constraint "FinancialAssistantConversation_org_fk"
    foreign key ("organizationId") references "Organization"("id") on delete restrict,
  constraint "FinancialAssistantConversation_profile_fk"
    foreign key ("financialProfileId", "organizationId")
      references "FinancialProfile"("id", "organizationId") on delete restrict,
  constraint "FinancialAssistantConversation_user_fk"
    foreign key ("userId") references "User"("id") on delete restrict,
  constraint "FinancialAssistantConversation_scope_unique"
    unique ("id", "organizationId", "financialProfileId", "userId")
);

create unique index "FinancialAssistantConversation_one_open_context"
  on "FinancialAssistantConversation" ("organizationId", "financialProfileId", "userId")
  where "status" in ('ACTIVE', 'PROCESSING', 'AWAITING_CLARIFICATION', 'ANSWERED', 'FAILED');

create index "FinancialAssistantConversation_expiry_idx"
  on "FinancialAssistantConversation" ("status", "expiresAt");

create table "FinancialAssistantTurn" (
  "id" uuid primary key,
  "conversationId" uuid not null,
  "organizationId" uuid not null,
  "financialProfileId" uuid not null,
  "userId" uuid not null,
  "sequence" integer not null,
  "conversationVersion" integer not null,
  "idempotencyKey" varchar(160) not null,
  "status" varchar(32) not null,
  "normalizedQuestion" varchar(1000) not null,
  "intent" varchar(48) not null,
  "filters" jsonb not null default '{}'::jsonb,
  "evidence" jsonb,
  "safeResponse" jsonb,
  "failureCode" varchar(120),
  "createdAt" timestamptz not null default now(),
  "answeredAt" timestamptz,
  constraint "FinancialAssistantTurn_status_check"
    check ("status" in ('PROCESSING', 'AWAITING_CLARIFICATION', 'ANSWERED', 'FAILED', 'CANCELLED', 'EXPIRED')),
  constraint "FinancialAssistantTurn_conversation_fk"
    foreign key ("conversationId", "organizationId", "financialProfileId", "userId")
      references "FinancialAssistantConversation"("id", "organizationId", "financialProfileId", "userId")
      on delete restrict,
  constraint "FinancialAssistantTurn_idempotency_unique"
    unique ("conversationId", "idempotencyKey"),
  constraint "FinancialAssistantTurn_sequence_unique"
    unique ("conversationId", "sequence")
);

create index "FinancialAssistantTurn_scope_idx"
  on "FinancialAssistantTurn" ("organizationId", "financialProfileId", "userId", "conversationId", "sequence");
