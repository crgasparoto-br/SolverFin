import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createCreditCardAccountForContext } from "./repositories/card-instruments.js";
import { handleCreditCardAccountsApiRequest } from "./credit-card-accounts-dispatcher.js";
import { handleMvpApiRequest } from "./mvp.js";
import type { ApiRequest } from "./router.js";
import {
  createRecurrenceForContext,
  generateInstallmentsForContext,
} from "./repositories/recurrences.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

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
    "DATABASE_URL is required. Run the integration database before this test.",
  );

  const login = await handleMvpApiRequest({
    method: "POST",
    path: "/api/session",
    body: {
      email: "demo@solverfin.example.invalid",
      password: "SolverFinDemo!2026",
    },
  });
  assert.equal(login.statusCode, 201);
  const token = (login.body as { session: { token: string } }).session.token;

  const suffix = Date.now().toString(36);
  const account = await createCreditCardAccountForContext(CONTEXT, {
    name: `Cartao escopo isolado ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    currency: "BRL",
    creditLimitMinor: 100_000,
    instruments: [
      {
        type: "physical",
        holder: "primary",
        name: "Cartao principal",
        maskedIdentifier: "**** 4242",
      },
    ],
  });
  const instrument = account.instruments[0];
  assert.ok(instrument);

  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2028-04-08",
    amountMinor: 3_000,
    description: `Recorrencia original ${suffix}`,
    cardId: account.id,
    cardInstrumentId: instrument.id,
  });

  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-06-08", 3);

  const before = await readOccurrences(recurrence.id);
  assert.equal(before.length, 3);
  const selected = before[1];
  assert.ok(selected);

  const purchasePath = `/api/credit-card-accounts/${account.id}/purchases/${selected.transactionId}`;
  const currentOnly = await authenticatedPatch(token, `${purchasePath}/current-only`, {
    amountMinor: 4_500,
    occurredOn: "2028-05-09",
    description: `Somente ocorrencia selecionada ${suffix}`,
    editScope: "current_only",
  });
  assert.equal(currentOnly.statusCode, 200);

  const after = await readOccurrences(recurrence.id);
  assert.equal(after.length, 3);

  assertOccurrenceUnchanged(before[0], after[0]);
  assert.equal(after[1]?.transactionId, selected.transactionId);
  assert.equal(after[1]?.transactionAmountMinor, 4_500);
  assert.equal(after[1]?.installmentAmountMinor, 4_500);
  assert.equal(after[1]?.transactionOccurredOn, "2028-05-09");
  assert.equal(after[1]?.installmentDueOn, "2028-05-09");
  assert.equal(after[1]?.transactionDescription, `Somente ocorrencia selecionada ${suffix}`);
  assertOccurrenceUnchanged(before[2], after[2]);

  const recurrenceAfter = await readRecurrence(recurrence.id);
  assert.equal(recurrenceAfter.amountMinor, 3_000);
  assert.equal(recurrenceAfter.description, `Recorrencia original ${suffix}`);

  // Exercise the production dispatcher, not the base router: current+future
  // must apply only to the selected occurrence and later eligible invoices.
  const expanded = await authenticatedPatch(token, purchasePath, {
    amountMinor: 5_200,
    occurredOn: "2028-05-10",
    description: `Recorrencia escopo futuro ${suffix}`,
    editScope: "current_and_future",
  });
  assert.equal(expanded.statusCode, 200);
  const expandedBody = expanded.body as {
    updatedCount: number;
    skippedCount: number;
  };
  assert.equal(expandedBody.updatedCount, 1);
  assert.equal(expandedBody.skippedCount, 0);

  const expandedOccurrences = await readOccurrences(recurrence.id);
  assertOccurrenceUnchanged(before[0], expandedOccurrences[0]);
  assert.equal(expandedOccurrences[1]?.transactionAmountMinor, 5_200);
  assert.equal(expandedOccurrences[1]?.transactionOccurredOn, "2028-05-10");
  assert.equal(expandedOccurrences[1]?.installmentDueOn, "2028-05-10");
  assert.equal(expandedOccurrences[2]?.transactionAmountMinor, 5_200);
  assert.equal(expandedOccurrences[2]?.transactionOccurredOn, "2028-06-10");
  assert.equal(expandedOccurrences[2]?.installmentDueOn, "2028-06-10");

  // The source invoice is the authority for dates: reject attempts to shift
  // the selected purchase outside its billing period without touching future data.
  const rejected = await authenticatedPatch(token, purchasePath, {
    occurredOn: "2028-05-25",
    editScope: "current_and_future",
  });
  assert.equal(rejected.statusCode, 409);
  assert.deepEqual(await readOccurrences(recurrence.id), expandedOccurrences);

  await assertRecurringEditGuards(token, purchasePath, recurrence.id);
}

async function assertRecurringEditGuards(
  token: string,
  purchasePath: string,
  recurrenceId: string,
): Promise<void> {
  const links = await query<{
    transactionId: string;
    invoiceId: string;
    installmentId: string;
    transactionStatus: string;
    installmentStatus: string;
  }>(
    `select t."id" as "transactionId", t."invoiceId", t."installmentId",
            t."status" as "transactionStatus", i."status" as "installmentStatus"
       from "Transaction" t
       join "Installment" i on i."id" = t."installmentId"
      where t."recurrenceId" = $1 and t."organizationId" = $2
        and t."financialProfileId" = $3
      order by i."sequenceNumber"`,
    [recurrenceId, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  assert.equal(links.length, 3);
  const selected = links[1]!;
  const future = links[2]!;

  const invoiceTotal = async (invoiceId: string): Promise<number> => {
    const rows = await query<{ totalAmountMinor: string | number }>(
      `select "totalAmountMinor" from "Invoice" where "id" = $1`,
      [invoiceId],
    );
    assert.ok(rows[0]);
    return Number(rows[0].totalAmountMinor);
  };

  const assertNoFinancialWrite = async (snapshot: OccurrenceRow[], total: number) => {
    assert.deepEqual(await readOccurrences(recurrenceId), snapshot);
    assert.equal(await invoiceTotal(selected.invoiceId), total);
  };

  // Wrong implementation: current+future edits the selected reconciled row
  // because only future candidates have status guards.
  for (const locked of [
    { table: "Transaction", id: selected.transactionId, original: selected.transactionStatus },
    { table: "Installment", id: selected.installmentId, original: selected.installmentStatus },
  ] as const) {
    const snapshot = await readOccurrences(recurrenceId);
    const total = await invoiceTotal(selected.invoiceId);
    await query(`update "${locked.table}" set "status" = 'RECONCILED' where "id" = $1`, [
      locked.id,
    ]);
    try {
      for (const path of [purchasePath, `${purchasePath}/current-only`]) {
        const rejected = await authenticatedPatch(token, path, {
          amountMinor: 6_200,
          editScope: path === purchasePath ? "current_and_future" : "current_only",
        });
        assert.equal(rejected.statusCode, 409, `A selected ${locked.table} is reconciled`);
      }
      await assertNoFinancialWrite(snapshot, total);
    } finally {
      await query(`update "${locked.table}" set "status" = $2 where "id" = $1`, [
        locked.id,
        locked.original,
      ]);
    }
  }

  // Wrong implementation: the selected recurrence or invoice has a different
  // currency, but the editor still applies native amounts without conversion.
  for (const target of [
    { table: "Invoice", id: selected.invoiceId },
    { table: "Installment", id: selected.installmentId },
    { table: "Recurrence", id: recurrenceId },
  ] as const) {
    const snapshot = await readOccurrences(recurrenceId);
    const total = await invoiceTotal(selected.invoiceId);
    await query(`update "${target.table}" set "currency" = 'USD' where "id" = $1`, [target.id]);
    try {
      for (const path of [purchasePath, `${purchasePath}/current-only`]) {
        const rejected = await authenticatedPatch(token, path, {
          amountMinor: 6_300,
          editScope: path === purchasePath ? "current_and_future" : "current_only",
        });
        assert.equal(rejected.statusCode, 409, `Selected ${target.table} currency mismatches`);
      }
      await assertNoFinancialWrite(snapshot, total);
    } finally {
      await query(`update "${target.table}" set "currency" = 'BRL' where "id" = $1`, [target.id]);
    }
  }

  // Future mismatches must be reported as skipped, never converted or relabelled.
  for (const [index, target] of [
    { table: "Transaction", id: future.transactionId },
    { table: "Installment", id: future.installmentId },
    { table: "Invoice", id: future.invoiceId },
  ].entries()) {
    const beforeFuture = (await readOccurrences(recurrenceId))[2];
    const futureTotal = await invoiceTotal(future.invoiceId);
    await query(`update "${target.table}" set "currency" = 'USD' where "id" = $1`, [target.id]);
    try {
      const result = await authenticatedPatch(token, purchasePath, {
        amountMinor: 6_400 + index * 100,
        editScope: "current_and_future",
      });
      assert.equal(result.statusCode, 200);
      const body = result.body as {
        updatedCount: number;
        skippedCount: number;
        skipped: Array<{ reason: string; transactionId?: string }>;
      };
      assert.equal(body.updatedCount, 0);
      assert.equal(body.skippedCount, 1);
      assert.equal(body.skipped[0]?.reason, "currency_mismatch");
      assert.equal(body.skipped[0]?.transactionId, future.transactionId);
      assertOccurrenceUnchanged(beforeFuture, (await readOccurrences(recurrenceId))[2]);
      assert.equal(await invoiceTotal(future.invoiceId), futureTotal);
    } finally {
      await query(`update "${target.table}" set "currency" = 'BRL' where "id" = $1`, [target.id]);
    }
  }
}

async function authenticatedPatch(token: string, path: string, body: unknown) {
  const url = new URL(path, "http://solverfin.integration.test");
  const request: ApiRequest = {
    method: "PATCH",
    pathname: url.pathname,
    query: url.searchParams,
    headers: { authorization: `Bearer ${token}` },
    body,
  };
  const response = await handleCreditCardAccountsApiRequest(request);
  assert.ok(response, `Expected response for ${path}`);
  return response;
}

function assertOccurrenceUnchanged(
  before: OccurrenceRow | undefined,
  after: OccurrenceRow | undefined,
): void {
  assert.ok(before);
  assert.ok(after);
  assert.deepEqual(after, before);
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
       t."id" as "transactionId",
       i."sequenceNumber",
       t."amountMinor" as "transactionAmountMinor",
       i."amountMinor" as "installmentAmountMinor",
       t."description" as "transactionDescription",
       to_char(t."occurredOn", 'YYYY-MM-DD') as "transactionOccurredOn",
       to_char(i."dueOn", 'YYYY-MM-DD') as "installmentDueOn"
     from "Transaction" t
     join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     where t."organizationId" = $1
       and t."financialProfileId" = $2
       and t."recurrenceId" = $3
     order by i."sequenceNumber" asc`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, recurrenceId],
  );
}

async function readRecurrence(recurrenceId: string): Promise<RecurrenceRow> {
  const rows = await query<RecurrenceRow>(
    `select "amountMinor", "description"
       from "Recurrence"
      where "id" = $1
        and "organizationId" = $2
        and "financialProfileId" = $3`,
    [recurrenceId, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const row = rows[0];
  assert.ok(row);
  return row;
}

interface OccurrenceRow {
  transactionId: string;
  sequenceNumber: number;
  transactionAmountMinor: number;
  installmentAmountMinor: number;
  transactionDescription: string;
  transactionOccurredOn: string;
  installmentDueOn: string;
}

interface RecurrenceRow {
  amountMinor: number;
  description: string;
}
