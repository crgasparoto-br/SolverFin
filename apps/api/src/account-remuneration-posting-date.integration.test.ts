import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { resetAccountRemunerationTestData } from "./account-remuneration-test-support.js";
import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  importCdiRates,
  processAccountRemunerations,
  saveAccountRemunerationConfiguration,
} from "./repositories/account-remuneration-service.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const FIRST_COMPETENCE_ON = "2036-05-14";
const SECOND_COMPETENCE_ON = "2036-05-15";
const PROCESSING_ON = "2036-05-20";

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
    "DATABASE_URL is required for account remuneration posting date tests.",
  );
  await resetAccountRemunerationTestData();

  const account = await createAccountForContext(CONTEXT, {
    name: `Conta CDI D+1 ${Date.now().toString(36)}`,
    kind: "checking",
    openingBalanceMinor: 1_000_000,
  });

  await saveAccountRemunerationConfiguration(CONTEXT, account.id, {
    enabled: true,
    remunerationPercent: 100,
    startsOn: FIRST_COMPETENCE_ON,
  });

  const importResult = await importCdiRates(
    { startsOn: FIRST_COMPETENCE_ON, endsOn: SECOND_COMPETENCE_ON },
    async () =>
      new Response(
        JSON.stringify([
          { data: "14/05/2036", valor: "0,050000" },
          { data: "15/05/2036", valor: "0,060000" },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  );
  assert.equal(importResult.importedCount, 2);

  const processingResult = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(processingResult.createdCount, 2);

  const rows = await query<PostingDateRow>(
    `select
       to_char(ar."competenceOn", 'YYYY-MM-DD') as "competenceOn",
       to_char(ar."processedOn", 'YYYY-MM-DD') as "processedOn",
       to_char(t."occurredOn", 'YYYY-MM-DD') as "occurredOn",
       to_char(t."plannedOn", 'YYYY-MM-DD') as "plannedOn"
     from "AccountRemuneration" ar
     join "Transaction" t on t."id" = ar."transactionId"
    where ar."organizationId" = $1
      and ar."financialProfileId" = $2
      and ar."accountId" = $3
    order by ar."competenceOn" asc`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, account.id],
  );

  assert.deepEqual(rows, [
    {
      competenceOn: FIRST_COMPETENCE_ON,
      processedOn: PROCESSING_ON,
      occurredOn: "2036-05-15",
      plannedOn: "2036-05-15",
    },
    {
      competenceOn: SECOND_COMPETENCE_ON,
      processedOn: PROCESSING_ON,
      occurredOn: "2036-05-16",
      plannedOn: "2036-05-16",
    },
  ]);

  const repeatedProcessing = await processAccountRemunerations(PROCESSING_ON);
  assert.equal(repeatedProcessing.createdCount, 0);

  const countRows = await query<{ count: number }>(
    `select count(*)::int as "count"
       from "AccountRemuneration"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "accountId" = $3`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, account.id],
  );
  assert.equal(countRows[0]?.count, 2);
}

interface PostingDateRow {
  competenceOn: string;
  processedOn: string;
  occurredOn: string;
  plannedOn: string;
}
