-- Issue #564: durable, tenant-scoped and reversible category learning.

create table if not exists "CategoryLearningEntry" (
  "id" uuid primary key,
  "organizationId" uuid not null,
  "financialProfileId" uuid not null,
  "merchantKey" varchar(240) not null,
  "transactionKind" varchar(16) not null,
  "categoryId" uuid not null,
  "status" varchar(16) not null default 'active',
  "confidence" numeric(5,4) not null,
  "correctionCount" integer not null default 1,
  "lastCorrectedAt" timestamptz not null,
  "lastSourceSuggestionId" uuid,
  "lastSourceFingerprint" varchar(128),
  "ignoredAt" timestamptz,
  "revertedAt" timestamptz,
  "createdByUserId" uuid,
  "updatedByUserId" uuid,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "CategoryLearningEntry_kind_check"
    check ("transactionKind" in ('income', 'expense', 'transfer')),
  constraint "CategoryLearningEntry_status_check"
    check ("status" in ('active', 'ignored', 'reverted')),
  constraint "CategoryLearningEntry_confidence_check"
    check ("confidence" >= 0 and "confidence" <= 1),
  constraint "CategoryLearningEntry_count_check"
    check ("correctionCount" > 0),
  constraint "CategoryLearningEntry_category_fk"
    foreign key ("categoryId", "organizationId", "financialProfileId")
    references "Category" ("id", "organizationId", "financialProfileId")
    on delete restrict,
  constraint "CategoryLearningEntry_source_fk"
    foreign key ("lastSourceSuggestionId", "organizationId", "financialProfileId")
    references "AiSuggestion" ("id", "organizationId", "financialProfileId")
    on delete restrict,
  constraint "CategoryLearningEntry_pattern_category_unique"
    unique ("organizationId", "financialProfileId", "merchantKey", "transactionKind", "categoryId")
);

create index if not exists "CategoryLearningEntry_scope_status_idx"
  on "CategoryLearningEntry" ("organizationId", "financialProfileId", "status", "updatedAt" desc);

create index if not exists "CategoryLearningEntry_pattern_idx"
  on "CategoryLearningEntry" ("organizationId", "financialProfileId", "merchantKey", "transactionKind");

create index if not exists "CategoryLearningEntry_source_idx"
  on "CategoryLearningEntry" ("organizationId", "financialProfileId", "lastSourceSuggestionId");

create unique index if not exists "AiSuggestion_intelligent_categorization_execution_unique"
  on "AiSuggestion" ("organizationId", "financialProfileId", "sourceSuggestionId", "kind", "model")
  where "sourceSuggestionId" is not null
    and "kind" = 'CATEGORIZATION'
    and "model" like 'intelligent-categorization-v1-%';
