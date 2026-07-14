import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query, withTransaction } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  importCdiRates,
  processAccountRemunerations,
  saveAccountRemunerationConfiguration,
} from "./repositories/account-remuneration.js";
import { updateTransactionForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const COMPETENCE_ON = "2038-04-14";
const PROCESSING_ON = "2038-04-15";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assertIntegrationDatabaseConfigured();

  const suffix = Date.now().toString(36);
  const positiveAccount = await createAccountForContext(CONTEXT, {
    name: `Conta remunerada positiva ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });
  const negativeAccount = await createAccountForContext(CONTEXT, {
    name: `Conta remunerada negativa ${suffix}`,
    kind: "checking",
    openingBalanceMinor: -10_000,
  });
  const accountWithoutRate = await createAccountForContext(CONTEXT, {
    name: `Conta remunerada sem taxa ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });

  await Promise.all([
    saveAccountRemunerationConfiguration(CONTEXT, positiveAccount.id, {
      enabled: true,
      remunerationPercent: 100,
      startsOn: COMPETENCE_ON,
    }),
    saveAccountRemunerationConfiguration(CONTEXT, negativeAccount.id, {
      enabled: true,
      remunerationPercent: 100,
      startsOn: COMPETENCE_ON,
    }),
    saveAccountRemunerationConfiguration(CONTEXT, accountWithoutRate.id, {
      enabled: true,
      remunerationPercent: 100,
      startsOn: "2038-04-20",
    }),
  ]);

  const importResult = await importCdiRates(
    { startsOn: COMPETENCE_ON, endsOn: COMPETENCE_ON },
    buildCdiFetcher([{ data: "14/04/2038", valor: "0,055131" }]),
  );
  assert.equal(importResult.importedCount, 1);

  const firstProcessing = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(firstProcessing.createdCount, 1);
  assert.equal(firstProcessing.skippedWithoutPositiveBalance, 1);

  const transaction = await readRemunerationTransaction(positiveAccount.id);
  assert.equal(transaction.amountMinor, 551);
  assert.equal(transaction.status, "PLANNED");
  assert.equal(transaction.source, "ACCOUNT_REMUNERATION");
  assert.equal(transaction.occurredOn, PROCESSING_ON);
  assert.equal(transaction.plannedOn, PROCESSING_ON);
  assert.equal(transaction.effectiveOn, null);
  assert.equal(transaction.competenceOn, COMPETENCE_ON);
  assert.equal(transaction.balanceBaseMinor, 1_000_000);
  assert.equal(transaction.originalAmountMinor, 551);
  assert.equal(transaction.manuallyAdjusted, false);

  assert.equal(await countRemunerationTransactions(negativeAccount.id), 0);
  assert.equal(await countRemunerationTransactions(accountWithoutRate.id), 0);

  const secondProcessing = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(secondProcessing.createdCount, 0);
  assert.equal(await countRemunerationTransactions(positiveAccount.id), 1);

  await updateTransactionForContext(CONTEXT, transaction.transactionId, {
    amountMinor: 777,
  });

  const adjusted = await readRemunerationTransaction(positiveAccount.id);
  assert.equal(adjusted.amountMinor, 777);
  assert.equal(adjusted.originalAmountMinor, 551);
  assert.equal(adjusted.manuallyAdjusted, true);
  assert.ok(adjusted.adjustedAt);
  assert.equal(adjusted.adjustedByUserId, CONTEXT.userId);

  await processAccountRemunerations(PROCESSING_ON);
  const preserved = await readRemunerationTransaction(positiveAccount.id);
  assert.equal(preserved.amountMinor, 777);
  assert.equal(preserved.originalAmountMinor, 551);

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `select pg_advisory_xact_lock(hashtext('solverfin:account-remuneration'))`,
    );

    await assert.rejects(
      () => processAccountRemunerations(PROCESSING_ON),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "ACCOUNT_REMUNERATION_ALREADY_RUNNING",
    );
  });

  const failedOperation = await readLatestProcessingOperation();
  assert.equal(failedOperation.status, "FAILED");
  assert.equal(failedOperation.failureCount, 1);
}

function buildCdiFetcher(entries: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(entries), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

async function readRemunerationTransaction(accountId: string): Promise<RemunerationRow> {
  const rows = await query<RemunerationRow>(
    `select
        t."id" as "transactionId",
        t."amountMinor",
        t."status",
        t."source",
        to_char(t."occurredOn", 'YYYY-MM-DD') as "occurredOn",
        to_char(t."plannedOn", 'YYYY-MM-DD') as "plannedOn",
        case when t."effectiveOn" is null then null
             else to_char(t."effectiveOn", 'YYYY-MM-DD') end as "effectiveOn",
        to_char(ar."competenceOn", 'YYYY-MM-DD') as "competenceOn",
        ar."balanceBaseMinor",
        ar."originalAmountMinor",
        ar."manuallyAdjusted",
        ar."adjustedAt",
        ar."adjustedByUserId"
       from "AccountRemuneration" ar
       join "Transaction" t on t."id" = ar."transactionId"
      where ar."organizationId" = $1
        and ar."financialProfileId" = $2
        and ar."accountId" = $3
      order by ar."competenceOn" desc
      limit 1`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, accountId],
  );
  const row = rows[0];

  if (!row) {
    throw new Error(`Expected remuneration transaction for account ${accountId}.`);
  }

  return row;
}

async function countRemunerationTransactions(accountId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "AccountRemuneration"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "accountId" = $3`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, accountId],
  );

  return rows[0]?.count ?? 0;
}

async function readLatestProcessingOperation(): Promise<OperationRow> {
  const rows = await query<OperationRow>(
    `select "status", "failureCount"
       from "FinancialIndexOperation"
      where "kind" = 'ACCOUNT_REMUNERATION'
      order by "startedAt" desc
      limit 1`,
  );
  const row = rows[0];

  if (!row) {
    throw new Error("Expected an account remuneration operation record.");
  }

  return row;
}

function assertIntegrationDatabaseConfigured(): void {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required. Run `docker compose up -d postgres` before `npm run test:integration`.",
  );
}

interface RemunerationRow {
  transactionId: string;
  amountMinor: number;
  status: string;
  source: string;
  occurredOn: string;
  plannedOn: string;
  effectiveOn: string | null;
  competenceOn: string;
  balanceBaseMinor: number;
  originalAmountMinor: number;
  manuallyAdjusted: boolean;
  adjustedAt: Date | null;
  adjustedByUserId: string | null;
}

interface OperationRow {
  status: string;
  failureCount: number;
}
