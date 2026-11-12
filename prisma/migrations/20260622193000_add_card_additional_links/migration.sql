create table "CardAdditionalLink" (
  "organizationId" uuid not null,
  "financialProfileId" uuid not null,
  "groupCardId" uuid not null,
  "cardId" uuid not null,
  "isPrimary" boolean not null default false,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,

  constraint "CardAdditionalLink_pkey" primary key ("groupCardId", "cardId"),
  constraint "CardAdditionalLink_groupCard_fkey" foreign key ("groupCardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete cascade on update cascade,
  constraint "CardAdditionalLink_card_fkey" foreign key ("cardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete cascade on update cascade
);

create unique index "CardAdditionalLink_one_primary_per_group"
  on "CardAdditionalLink" ("organizationId", "financialProfileId", "groupCardId")
  where "isPrimary" = true;

create index "CardAdditionalLink_card_idx"
  on "CardAdditionalLink" ("organizationId", "financialProfileId", "cardId");
