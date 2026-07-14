import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  getFinancialIndexStatus,
  importCdiRates,
  processAccountRemunerations,
  saveAccountRemunerationConfiguration,
} from "./repositories/account-remuneration-service.js";
import {
  createTransactionForContext,
  updateTransactionForContext,
} from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const COMPETENCE_ON = "2099-01-04";
const PROCESSING_ON = "2099-01-05";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for remuneration integration tests.");

  const suffix = Date.now().toString(36);
  const negativeAccount = await createAccountForContext(CONTEXT, {
    name: `Conta sem rendimento ${suffix}`,
    kind: "checking",
    openingBalanceMinor: -10_000,
  });
  const tinyAccount = await createAccountForContext(CONTEXT, {
    name: `Conta arredondamento zero ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1,
  });
  const protectedAccount = await createAccountForContext(CONTEXT, {
    name: `Conta protegida ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });

  await Promise.all(
    [negativeAccount, tinyAccount, protectedAccount].map((account) =>
      saveAccountRemunerationConfiguration(CONTEXT, account.id, {
        enabled: true,
        remunerationPercent: 100,
        startsOn: COMPETENCE_ON,
      }),
    ),
  );

  await importCdiRates(
    { startsOn: COMPETENCE_ON, endsOn: COMPETENCE_ON },
    buildCdiFetcher([{ data: "04/01/2099", valor: "0,055131" }]),
  );

  const firstProcessing = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(firstProcessing.createdCount, 1);
  assert.equal(firstProcessing.skippedWithoutPositiveBalance, 1);
  assert.equal(firstProcessing.skippedZeroAmount, 1);
  assert.equal(firstProcessing.pendingCount, 0);

  const negativeResult = await readRemunerationResult(negativeAccount.id);
  assert.equal(negativeResult.status, "SKIPPED_NON_POSITIVE_BALANCE");
  assert.equal(negativeResult.transactionId, null);
  assert.equal(negativeResult.originalAmountMinor, 0);

  const tinyResult = await readRemunerationResult(tinyAccount.id);
  assert.equal(tinyResult.status, "SKIPPED_ZERO_AMOUNT");
  assert.equal(tinyResult.transactionId, null);
  assert.equal(tinyResult.originalAmountMinor, 0);

  await createTransactionForContext(CONTEXT, {
    kind: "income",
    amountMinor: 20_000,
    accountId: negativeAccount.id,
    occurredOn: COMPETENCE_ON,
    plannedOn: COMPETENCE_ON,
    effectiveOn: COMPETENCE_ON,
    status: "posted",
    description: "Lançamento retroativo posterior ao processamento",
  });

  const reprocessing = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(reprocessing.createdCount, 0);
  assert.equal(await countRemunerationResults(negativeAccount.id), 1);
  assert.equal(await countRemunerationTransactions(negativeAccount.id), 0);

  const protectedResult = await readRemunerationResult(protectedAccount.id);
  assert.ok(protectedResult.transactionId);

  await assert.rejects(
    () =>
      query(
        `update "Transaction" set "description" = 'Descrição adulterada' where "id" = $1`,
        [protectedResult.transactionId],
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("Lançamentos de remuneração permitem alterar somente valor"),
  );

  await updateTransactionForContext(CONTEXT, protectedResult.transactionId, {
    amountMinor: protectedResult.originalAmountMinor + 1,
  });
  const adjustedRows = await query<{ amountMinor: number; manuallyAdjusted: boolean }>(
    `select t."amountMinor", ar."manuallyAdjusted"
       from "AccountRemuneration" ar
       join "Transaction" t on t."id" = ar."transactionId"
      where ar."accountId" = $1`,
    [protectedAccount.id],
  );
  assert.equal(adjustedRows[0]?.amountMinor, protectedResult.originalAmountMinor + 1);
  assert.equal(adjustedRows[0]?.manuallyAdjusted, true);

  let requestedUrl = "";
  const incrementalResult = await importCdiRates(
    { startsOn: "2000-01-01", endsOn: "2099-01-06" },
    async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify([{ data: "05/01/2099", valor: "0,055131" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(new URL(requestedUrl).searchParams.get("dataInicial"), "05/01/2099");
  assert.equal(incrementalResult.importedCount, 1);

  const status = await getFinancialIndexStatus();
  assert.equal(
    status.pendingConfigurations,
    status.pendingCompetences + status.configurationsWithoutRates,
  );
}

function buildCdiFetcher(entries: unknown[]): typeof fetch {
  return async () =>
    new Response(JSON.stringify(entries), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

async function readRemunerationResult(accountId: string): Promise<RemunerationResultRow> {
  const rows = await query<RemunerationResultRow>(
    `select "status", "transactionId", "originalAmountMinor"
       from "AccountRemuneration"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "accountId" = $3
        and "competenceOn" = $4::date`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, accountId, COMPETENCE_ON],
  );
  const row = rows[0];
  if (!row) throw new Error(`Expected remuneration result for account ${accountId}.`);
  return row;
}

async function countRemunerationResults(accountId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    `select count(*)::int as "count" from "AccountRemuneration" where "accountId" = $1`,
    [accountId],
  );
  return rows[0]?.count ?? 0;
}

async function countRemunerationTransactions(accountId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "AccountRemuneration"
      where "accountId" = $1 and "transactionId" is not null`,
    [accountId],
  );
  return rows[0]?.count ?? 0;
}

interface RemunerationResultRow {
  status: string;
  transactionId: string | null;
  originalAmountMinor: number;
}
