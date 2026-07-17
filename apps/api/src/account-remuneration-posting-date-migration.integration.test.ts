import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  closePool,
  type QueryExecutor,
  withSharedTransaction,
  withTransaction,
} from "./db.js";

const MIGRATION_PATH =
  "prisma/migrations/20260717143000_align_cdi_posting_date_with_competence/migration.sql";
const LEGACY_TRANSACTION_ID = "11111111-1111-4111-8111-111111111150";
const COMPETENCE_ON = "2039-06-14";
const EXPECTED_POSTING_ON = "2039-06-15";
const PROCESSING_ON = "2039-06-20";
const INVALID_POSTING_ON = "2039-06-22";

class RollbackAfterAssertions extends Error {}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for account remuneration posting date migration tests.",
  );

  const migrationSql = await readFile(resolve(process.cwd(), MIGRATION_PATH), "utf8");

  try {
    await withSharedTransaction(async (executeQuery) => {
      await createLegacySchema(executeQuery);
      await insertLegacyData(executeQuery);

      const legacy = await readSnapshot(executeQuery);
      assert.equal(legacy.occurredOn, PROCESSING_ON);
      assert.equal(legacy.plannedOn, PROCESSING_ON);

      await executeQuery(migrationSql);

      const migrated = await readSnapshot(executeQuery);
      assert.equal(migrated.occurredOn, EXPECTED_POSTING_ON);
      assert.equal(migrated.plannedOn, EXPECTED_POSTING_ON);
      assert.deepEqual(preservedFields(migrated), preservedFields(legacy));

      await assert.rejects(
        () =>
          withTransaction(async (nestedQuery) => {
            await nestedQuery(
              `update "Transaction"
                  set "occurredOn" = $2::date,
                      "plannedOn" = $2::date
                where "id" = $1`,
              [LEGACY_TRANSACTION_ID, INVALID_POSTING_ON],
            );
          }),
        isDPlusOneGuardError,
      );

      const afterRejectedDateChange = await readSnapshot(executeQuery);
      assert.equal(afterRejectedDateChange.occurredOn, EXPECTED_POSTING_ON);
      assert.equal(afterRejectedDateChange.plannedOn, EXPECTED_POSTING_ON);

      await executeQuery(
        `update "Transaction"
            set "amountMinor" = "amountMinor" + 1,
                "reconciledAt" = now()
          where "id" = $1`,
        [LEGACY_TRANSACTION_ID],
      );

      const allowedAdjustment = await readSnapshot(executeQuery);
      assert.equal(allowedAdjustment.amountMinor, migrated.amountMinor + 1);
      assert.equal(allowedAdjustment.reconciled, true);
      assert.equal(allowedAdjustment.occurredOn, EXPECTED_POSTING_ON);
      assert.equal(allowedAdjustment.plannedOn, EXPECTED_POSTING_ON);

      throw new RollbackAfterAssertions();
    });
  } catch (error) {
    if (!(error instanceof RollbackAfterAssertions)) {
      throw error;
    }
  }
}

async function createLegacySchema(executeQuery: QueryExecutor): Promise<void> {
  await executeQuery(`create schema "AccountRemunerationMigrationTest"`);
  await executeQuery(
    `set local search_path to "AccountRemunerationMigrationTest", public`,
  );

  await executeQuery(
    `create table "Transaction" (
       "id" uuid primary key,
       "organizationId" uuid not null,
       "financialProfileId" uuid not null,
       "accountId" uuid,
       "destinationAccountId" uuid,
       "categoryId" uuid,
       "kind" varchar(32) not null,
       "status" varchar(32) not null,
       "source" varchar(48) not null,
       "amountMinor" integer not null,
       "currency" varchar(3) not null,
       "occurredOn" date not null,
       "plannedOn" date not null,
       "description" varchar(240) not null,
       "reconciledAt" timestamp,
       "updatedAt" timestamp not null
     )`,
  );

  await executeQuery(
    `create table "AccountRemuneration" (
       "transactionId" uuid,
       "competenceOn" date not null,
       "processedOn" date not null,
       "financialIndexRateId" uuid not null,
       "indexKind" varchar(32) not null,
       "status" varchar(48) not null,
       "balanceBaseMinor" integer not null,
       "dailyRatePercent" numeric(18, 12) not null,
       "remunerationPercent" numeric(9, 4) not null,
       "appliedDailyRatePercent" numeric(18, 12) not null,
       "originalAmountMinor" integer not null,
       "manuallyAdjusted" boolean not null,
       "adjustedAt" timestamp,
       "adjustedByUserId" uuid
     )`,
  );

  await executeQuery(
    `create function "protectAccountRemunerationTransactionIdentity"()
     returns trigger as $$
     begin
       if exists (
         select 1
           from "AccountRemuneration" ar
          where ar."transactionId" = old."id"
       ) and (
         new."organizationId" is distinct from old."organizationId"
         or new."financialProfileId" is distinct from old."financialProfileId"
         or new."accountId" is distinct from old."accountId"
         or new."destinationAccountId" is distinct from old."destinationAccountId"
         or new."kind" is distinct from old."kind"
         or new."source" is distinct from old."source"
         or new."currency" is distinct from old."currency"
         or new."occurredOn" is distinct from old."occurredOn"
         or new."plannedOn" is distinct from old."plannedOn"
         or new."description" is distinct from old."description"
       ) then
         raise exception using
           errcode = '23514',
           message = 'Lançamentos de remuneração permitem alterar somente valor, categoria e conciliação.';
       end if;

       return new;
     end;
     $$ language plpgsql`,
  );

  await executeQuery(
    `create trigger "Transaction_account_remuneration_identity_guard"
     before update on "Transaction"
     for each row
     execute function "protectAccountRemunerationTransactionIdentity"()`,
  );
}

async function insertLegacyData(executeQuery: QueryExecutor): Promise<void> {
  await executeQuery(
    `insert into "Transaction" (
       "id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
       "categoryId", "kind", "status", "source", "amountMinor", "currency", "occurredOn",
       "plannedOn", "description", "reconciledAt", "updatedAt"
     ) values (
       $1, $2, $3, $4, null, $5, 'INCOME', 'PLANNED', 'ACCOUNT_REMUNERATION', 500, 'BRL',
       $6::date, $6::date, 'Rendimento previsto — 100% do CDI', null, now()
     )`,
    [
      LEGACY_TRANSACTION_ID,
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333331",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      PROCESSING_ON,
    ],
  );

  await executeQuery(
    `insert into "AccountRemuneration" (
       "transactionId", "competenceOn", "processedOn", "financialIndexRateId", "indexKind",
       "status", "balanceBaseMinor", "dailyRatePercent", "remunerationPercent",
       "appliedDailyRatePercent", "originalAmountMinor", "manuallyAdjusted", "adjustedAt",
       "adjustedByUserId"
     ) values (
       $1, $2::date, $3::date, $4, 'CDI', 'CREATED', 1000000, 0.05, 100,
       0.05, 500, false, null, null
     )`,
    [
      LEGACY_TRANSACTION_ID,
      COMPETENCE_ON,
      PROCESSING_ON,
      "66666666-6666-4666-8666-666666666666",
    ],
  );
}

async function readSnapshot(executeQuery: QueryExecutor): Promise<AccountRemunerationSnapshot> {
  const rows = await executeQuery<AccountRemunerationSnapshot>(
    `select
       ar."transactionId" as "transactionId",
       to_char(ar."competenceOn", 'YYYY-MM-DD') as "competenceOn",
       to_char(ar."processedOn", 'YYYY-MM-DD') as "processedOn",
       ar."financialIndexRateId" as "financialIndexRateId",
       ar."indexKind" as "indexKind",
       ar."status" as "remunerationStatus",
       ar."balanceBaseMinor" as "balanceBaseMinor",
       ar."dailyRatePercent"::text as "dailyRatePercent",
       ar."remunerationPercent"::text as "remunerationPercent",
       ar."appliedDailyRatePercent"::text as "appliedDailyRatePercent",
       ar."originalAmountMinor" as "originalAmountMinor",
       ar."manuallyAdjusted" as "manuallyAdjusted",
       ar."adjustedAt" is not null as "adjusted",
       ar."adjustedByUserId" as "adjustedByUserId",
       to_char(t."occurredOn", 'YYYY-MM-DD') as "occurredOn",
       to_char(t."plannedOn", 'YYYY-MM-DD') as "plannedOn",
       t."amountMinor" as "amountMinor",
       t."categoryId" as "categoryId",
       t."status" as "transactionStatus",
       t."source" as "source",
       t."description" as "description",
       t."reconciledAt" is not null as "reconciled"
     from "AccountRemuneration" ar
     join "Transaction" t on t."id" = ar."transactionId"
    where ar."transactionId" = $1`,
    [LEGACY_TRANSACTION_ID],
  );

  assert.equal(rows.length, 1);
  return rows[0] as AccountRemunerationSnapshot;
}

function preservedFields(snapshot: AccountRemunerationSnapshot): PreservedFields {
  return {
    competenceOn: snapshot.competenceOn,
    processedOn: snapshot.processedOn,
    financialIndexRateId: snapshot.financialIndexRateId,
    indexKind: snapshot.indexKind,
    remunerationStatus: snapshot.remunerationStatus,
    balanceBaseMinor: snapshot.balanceBaseMinor,
    dailyRatePercent: snapshot.dailyRatePercent,
    remunerationPercent: snapshot.remunerationPercent,
    appliedDailyRatePercent: snapshot.appliedDailyRatePercent,
    originalAmountMinor: snapshot.originalAmountMinor,
    manuallyAdjusted: snapshot.manuallyAdjusted,
    adjusted: snapshot.adjusted,
    adjustedByUserId: snapshot.adjustedByUserId,
    amountMinor: snapshot.amountMinor,
    categoryId: snapshot.categoryId,
    transactionStatus: snapshot.transactionStatus,
    source: snapshot.source,
    description: snapshot.description,
    reconciled: snapshot.reconciled,
  };
}

function isDPlusOneGuardError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "23514" &&
    error.message.includes("D+1")
  );
}

interface AccountRemunerationSnapshot {
  transactionId: string;
  competenceOn: string;
  processedOn: string;
  financialIndexRateId: string;
  indexKind: string;
  remunerationStatus: string;
  balanceBaseMinor: number;
  dailyRatePercent: string;
  remunerationPercent: string;
  appliedDailyRatePercent: string;
  originalAmountMinor: number;
  manuallyAdjusted: boolean;
  adjusted: boolean;
  adjustedByUserId: string | null;
  occurredOn: string;
  plannedOn: string;
  amountMinor: number;
  categoryId: string | null;
  transactionStatus: string;
  source: string;
  description: string;
  reconciled: boolean;
}

type PreservedFields = Omit<
  AccountRemunerationSnapshot,
  "transactionId" | "occurredOn" | "plannedOn"
>;
