-- Destructive migration authorized by #317/#319.
-- Card-related runtime data is discarded so the database can move from
-- separate cards linked by CardAdditionalLink to card aggregators with
-- internal usage instruments.

alter table if exists "Transaction" drop constraint if exists "Transaction_invoiceId_organizationId_financialProfileId_fkey";
alter table if exists "Transaction" drop constraint if exists "Transaction_cardId_organizationId_financialProfileId_fkey";
alter table if exists "Transaction" drop constraint if exists "Transaction_installmentId_organizationId_financialProfileId_fkey";
alter table if exists "Transaction" drop constraint if exists "Transaction_recurrenceId_organizationId_financialProfileId_fkey";
alter table if exists "Installment" drop constraint if exists "Installment_cardId_organizationId_financialProfileId_fkey";
alter table if exists "Installment" drop constraint if exists "Installment_recurrenceId_organizationId_financialProfileId_fkey";
alter table if exists "Recurrence" drop constraint if exists "Recurrence_cardId_organizationId_financialProfileId_fkey";
alter table if exists "Invoice" drop constraint if exists "Invoice_cardId_organizationId_financialProfileId_fkey";
alter table if exists "Invoice" drop constraint if exists "Invoice_paymentTransactionId_organizationId_financialProfileId_fkey";

delete from "Transaction"
where "cardId" is not null
   or "invoiceId" is not null
   or "installmentId" in (select "id" from "Installment" where "cardId" is not null)
   or "recurrenceId" in (select "id" from "Recurrence" where "cardId" is not null);

delete from "Installment"
where "cardId" is not null
   or "recurrenceId" in (select "id" from "Recurrence" where "cardId" is not null);

delete from "Recurrence" where "cardId" is not null;
delete from "Invoice";
drop table if exists "CardAdditionalLink";
delete from "Card";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'CardInstrumentType') then
    create type "CardInstrumentType" as enum ('PHYSICAL', 'VIRTUAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'CardInstrumentHolder') then
    create type "CardInstrumentHolder" as enum ('PRIMARY', 'ADDITIONAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'CardInstrumentStatus') then
    create type "CardInstrumentStatus" as enum ('ACTIVE', 'ARCHIVED');
  end if;

  if not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'AuditEntityKind' and e.enumlabel = 'CARD_INSTRUMENT'
  ) then
    alter type "AuditEntityKind" add value 'CARD_INSTRUMENT';
  end if;
end $$;

create table "CardInstrument" (
  "id" uuid not null,
  "organizationId" uuid not null,
  "financialProfileId" uuid not null,
  "cardId" uuid not null,
  "type" "CardInstrumentType" not null,
  "holder" "CardInstrumentHolder" not null,
  "status" "CardInstrumentStatus" not null default 'ACTIVE',
  "isDefault" boolean not null default false,
  "name" varchar(160),
  "maskedIdentifier" varchar(80),
  "creditLimitMinor" integer,
  "createdByUserId" uuid,
  "updatedByUserId" uuid,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,

  constraint "CardInstrument_pkey" primary key ("id"),
  constraint "CardInstrument_card_fkey" foreign key ("cardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete cascade on update cascade,
  constraint "CardInstrument_profile_fkey" foreign key ("financialProfileId", "organizationId") references "FinancialProfile"("id", "organizationId") on delete restrict on update cascade,
  constraint "CardInstrument_creditLimitMinor_check" check ("creditLimitMinor" is null or "creditLimitMinor" >= 0)
);

create unique index "CardInstrument_tenant_unique"
  on "CardInstrument" ("id", "organizationId", "financialProfileId");

create unique index "CardInstrument_one_default_active_per_card"
  on "CardInstrument" ("organizationId", "financialProfileId", "cardId")
  where "isDefault" = true and "status" = 'ACTIVE';

create index "CardInstrument_card_status_idx"
  on "CardInstrument" ("organizationId", "financialProfileId", "cardId", "status");

create index "CardInstrument_card_default_idx"
  on "CardInstrument" ("organizationId", "financialProfileId", "cardId", "isDefault");

alter table "Transaction" add column "cardInstrumentId" uuid;
alter table "Recurrence" add column "cardInstrumentId" uuid;
alter table "Installment" add column "cardInstrumentId" uuid;

create index "Transaction_cardInstrumentId_idx"
  on "Transaction" ("organizationId", "financialProfileId", "cardInstrumentId", "occurredOn");

create index "Recurrence_cardInstrumentId_idx"
  on "Recurrence" ("organizationId", "financialProfileId", "cardInstrumentId");

create index "Installment_cardInstrumentId_idx"
  on "Installment" ("organizationId", "financialProfileId", "cardInstrumentId");

alter table "Transaction"
  add constraint "Transaction_cardId_organizationId_financialProfileId_fkey"
  foreign key ("cardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Transaction_invoiceId_organizationId_financialProfileId_fkey"
  foreign key ("invoiceId", "organizationId", "financialProfileId") references "Invoice"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Transaction_recurrenceId_organizationId_financialProfileId_fkey"
  foreign key ("recurrenceId", "organizationId", "financialProfileId") references "Recurrence"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Transaction_installmentId_organizationId_financialProfileId_fkey"
  foreign key ("installmentId", "organizationId", "financialProfileId") references "Installment"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Transaction_cardInstrumentId_organizationId_financialProfileId_fkey"
  foreign key ("cardInstrumentId", "organizationId", "financialProfileId") references "CardInstrument"("id", "organizationId", "financialProfileId") on delete restrict on update cascade;

alter table "Recurrence"
  add constraint "Recurrence_cardId_organizationId_financialProfileId_fkey"
  foreign key ("cardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Recurrence_cardInstrumentId_organizationId_financialProfileId_fkey"
  foreign key ("cardInstrumentId", "organizationId", "financialProfileId") references "CardInstrument"("id", "organizationId", "financialProfileId") on delete restrict on update cascade;

alter table "Installment"
  add constraint "Installment_cardId_organizationId_financialProfileId_fkey"
  foreign key ("cardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Installment_recurrenceId_organizationId_financialProfileId_fkey"
  foreign key ("recurrenceId", "organizationId", "financialProfileId") references "Recurrence"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Installment_cardInstrumentId_organizationId_financialProfileId_fkey"
  foreign key ("cardInstrumentId", "organizationId", "financialProfileId") references "CardInstrument"("id", "organizationId", "financialProfileId") on delete restrict on update cascade;

alter table "Invoice"
  add constraint "Invoice_cardId_organizationId_financialProfileId_fkey"
  foreign key ("cardId", "organizationId", "financialProfileId") references "Card"("id", "organizationId", "financialProfileId") on delete restrict on update cascade,
  add constraint "Invoice_paymentTransactionId_organizationId_financialProfileId_fkey"
  foreign key ("paymentTransactionId", "organizationId", "financialProfileId") references "Transaction"("id", "organizationId", "financialProfileId") on delete restrict on update cascade;

-- Temporary read-only compatibility for legacy queries that still select from
-- CardAdditionalLink until #321/#323 replace repositories and routes with the
-- card instrument model. The legacy table is gone; each aggregator resolves to
-- itself so current purchase flows do not depend on manual additional links.
create view "CardAdditionalLink" as
select
  "organizationId",
  "financialProfileId",
  "id" as "groupCardId",
  "id" as "cardId",
  true as "isPrimary",
  "createdAt",
  "updatedAt"
from "Card";
