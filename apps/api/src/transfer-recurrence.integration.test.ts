import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  cancelRecurrenceForContext,
  catchUpRecurrenceInstallmentsForContext,
  createRecurrenceForContext,
  generateInstallmentsForContext,
  listRecurrencesForContext,
  pauseRecurrenceForContext,
  resumeRecurrenceForContext,
} from "./repositories/recurrences.js";
import { updateRecurringAccountTransactionForContext } from "./repositories/recurring-account-transaction-edit.js";
import { updateTransactionForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const OTHER_PROFILE_CONTEXT: TenantContext = {
  ...CONTEXT,
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "business",
};

interface Accounts {
  source: string;
  destination: string;
  secondDestination: string;
  usd: string;
  otherProfile: string;
}

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

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const accounts: Accounts = {
    source: await createAccount(CONTEXT, `Origem issue 677 ${suffix}`, "BRL"),
    destination: await createAccount(CONTEXT, `Destino issue 677 ${suffix}`, "BRL"),
    secondDestination: await createAccount(CONTEXT, `Destino 2 issue 677 ${suffix}`, "BRL"),
    usd: await createAccount(CONTEXT, `Destino USD issue 677 ${suffix}`, "USD"),
    otherProfile: await createAccount(OTHER_PROFILE_CONTEXT, `Outro perfil 677 ${suffix}`, "BRL"),
  };

  await assertMaterializesTransferOccurrences(accounts, suffix);
  await assertCatchUpFromDestinationStatement(accounts, suffix);
  await assertRejectsInvalidTransferRecurrences(accounts, suffix);
  await assertDatabaseRejectsIncoherentTransferRule(accounts, suffix);
  await assertLifecycleKeepsBothLegs(accounts, suffix);
  await assertExpandedEditPreservesSourceAndMovesDestination(accounts, suffix);
  await assertExpandedEditRejectsCrossCurrencyWithoutEffects(accounts, suffix);
  await assertKindChangeDropsDestination(accounts, suffix);
}

async function assertMaterializesTransferOccurrences(
  accounts: Accounts,
  suffix: string,
): Promise<void> {
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: todayIso(),
    amountMinor: 25_000,
    description: `Transferencia fixa 677 ${suffix}`,
    kind: "transfer",
    accountId: accounts.source,
    destinationAccountId: accounts.destination,
  });

  assert.equal(recurrence.kind, "transfer");
  assert.equal(recurrence.accountId, accounts.source);
  assert.equal(recurrence.destinationAccountId, accounts.destination);
  const persistedRule = await readRecurrence(recurrence.id);
  assert.equal(persistedRule.kind, "TRANSFER");
  assert.equal(persistedRule.accountId, accounts.source);
  assert.equal(persistedRule.destinationAccountId, accounts.destination);

  const first = await readOccurrences(recurrence.id);
  assert.equal(first.length, 1, "first due date (today) must be materialized on create");
  assertTransferOccurrence(first[0], accounts.source, accounts.destination, 25_000);

  const throughOn = addMonthsIso(todayIso(), 3);
  await generateInstallmentsForContext(CONTEXT, recurrence.id, throughOn);
  const future = await readOccurrences(recurrence.id);
  assert.equal(future.length, 4, "future occurrences are materialized once per due date");
  for (const occurrence of future) {
    assertTransferOccurrence(occurrence, accounts.source, accounts.destination, 25_000);
  }

  await generateInstallmentsForContext(CONTEXT, recurrence.id, throughOn);
  const replay = await readOccurrences(recurrence.id);
  assert.deepEqual(
    replay.map((row) => row.transactionId),
    future.map((row) => row.transactionId),
    "replaying generation must not duplicate occurrences",
  );
  assert.equal(
    new Set(replay.map((row) => row.transferGroupId)).size,
    replay.length,
    "each occurrence keeps its own logical transfer identity",
  );
}

async function assertCatchUpFromDestinationStatement(
  accounts: Accounts,
  suffix: string,
): Promise<void> {
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "daily",
    startOn: addDaysIso(todayIso(), -2),
    amountMinor: 1_000,
    description: `Transferencia diaria 677 ${suffix}`,
    kind: "transfer",
    accountId: accounts.source,
    destinationAccountId: accounts.secondDestination,
  });
  assert.equal((await readOccurrences(recurrence.id)).length, 1);

  await catchUpRecurrenceInstallmentsForContext(CONTEXT, {
    accountId: accounts.secondDestination,
  });
  const afterCatchUp = await readOccurrences(recurrence.id);
  assert.equal(afterCatchUp.length, 3, "destination statement catch-up materializes due dates");
  for (const occurrence of afterCatchUp) {
    assertTransferOccurrence(occurrence, accounts.source, accounts.secondDestination, 1_000);
  }

  const listed = await listRecurrencesForContext(CONTEXT, {
    accountId: accounts.secondDestination,
    status: "all",
  });
  assert.ok(listed.some((item) => item.id === recurrence.id));
  await cancelRecurrenceForContext(CONTEXT, recurrence.id);
}

async function assertRejectsInvalidTransferRecurrences(
  accounts: Accounts,
  suffix: string,
): Promise<void> {
  const description = `Transferencia invalida 677 ${suffix}`;
  const base = {
    frequency: "monthly" as const,
    startOn: todayIso(),
    amountMinor: 5_000,
    description,
    kind: "transfer" as const,
    accountId: accounts.source,
  };

  await assertRejectCode(
    () => createRecurrenceForContext(CONTEXT, { ...base, destinationAccountId: accounts.source }),
    "RECURRENCE_TRANSFER_SAME_ACCOUNT",
  );
  await assertRejectCode(
    () => createRecurrenceForContext(CONTEXT, { ...base, destinationAccountId: accounts.usd }),
    "RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED",
  );
  await assertRejectCode(
    () => createRecurrenceForContext(CONTEXT, base),
    "RECURRENCE_DESTINATION_ACCOUNT_REQUIRED",
  );
  await assertRejectCode(
    () =>
      createRecurrenceForContext(CONTEXT, {
        ...base,
        destinationAccountId: accounts.otherProfile,
      }),
    "TENANT_RESOURCE_NOT_FOUND",
  );

  const persisted = await query<{ count: number }>(
    `select count(*)::int as "count" from "Recurrence"
      where "organizationId" = $1 and "financialProfileId" = $2 and "description" = $3`,
    [CONTEXT.organizationId, CONTEXT.financialProfileId, description],
  );
  assert.equal(persisted[0]?.count, 0, "rejected recurrences must not persist any rule");
}

async function assertDatabaseRejectsIncoherentTransferRule(
  accounts: Accounts,
  suffix: string,
): Promise<void> {
  const insert = (destinationAccountId: string | null, kind = "TRANSFER") =>
    query(
      `insert into "Recurrence"
         ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId",
          "kind", "frequency", "startOn", "amountMinor", "currency", "description", "updatedAt")
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 'MONTHLY', current_date, 100, 'BRL', $6, now())`,
      [
        CONTEXT.organizationId,
        CONTEXT.financialProfileId,
        accounts.source,
        destinationAccountId,
        kind,
        `Regra direta 677 ${suffix}`,
      ],
    );

  await assertRejectCode(() => insert(accounts.usd), "23514");
  await assertRejectCode(() => insert(null), "23514");
  await assertRejectCode(() => insert(accounts.source), "23514");
  await assertRejectCode(() => insert(accounts.destination, "EXPENSE"), "23514");
}

async function assertLifecycleKeepsBothLegs(accounts: Accounts, suffix: string): Promise<void> {
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: addMonthsIso(todayIso(), 1),
    amountMinor: 7_500,
    description: `Transferencia ciclo 677 ${suffix}`,
    kind: "transfer",
    accountId: accounts.source,
    destinationAccountId: accounts.destination,
  });

  const paused = await pauseRecurrenceForContext(CONTEXT, recurrence.id);
  assert.equal(paused.status, "paused");
  await generateInstallmentsForContext(CONTEXT, recurrence.id, addMonthsIso(todayIso(), 3));
  assert.equal((await readOccurrences(recurrence.id)).length, 0, "paused rule generates nothing");

  const resumed = await resumeRecurrenceForContext(CONTEXT, recurrence.id);
  assert.equal(resumed.status, "active");
  assert.equal(resumed.destinationAccountId, accounts.destination);
  await generateInstallmentsForContext(CONTEXT, recurrence.id, addMonthsIso(todayIso(), 2));
  const resumedOccurrences = await readOccurrences(recurrence.id);
  assert.equal(resumedOccurrences.length, 2);
  for (const occurrence of resumedOccurrences) {
    assertTransferOccurrence(occurrence, accounts.source, accounts.destination, 7_500);
  }

  const cancelled = await cancelRecurrenceForContext(CONTEXT, recurrence.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.accountId, accounts.source);
  assert.equal(cancelled.destinationAccountId, accounts.destination);
  await generateInstallmentsForContext(CONTEXT, recurrence.id, addMonthsIso(todayIso(), 5));
  assert.equal((await readOccurrences(recurrence.id)).length, 2, "cancelled rule stops");
}

async function assertExpandedEditPreservesSourceAndMovesDestination(
  accounts: Accounts,
  suffix: string,
): Promise<void> {
  const fixture = await createFutureTransfer(accounts, `${suffix}-expanded`);
  const selected = fixture[1];
  assert.ok(selected);

  await updateRecurringAccountTransactionForContext(CONTEXT, selected.transactionId, {
    destinationAccountId: accounts.secondDestination,
    amountMinor: 9_900,
  });

  const after = await readOccurrences(selected.recurrenceId);
  assertTransferOccurrence(after[0], accounts.source, accounts.destination, 4_000);
  for (const occurrence of after.slice(1)) {
    assertTransferOccurrence(occurrence, accounts.source, accounts.secondDestination, 9_900);
  }
  const rule = await readRecurrence(selected.recurrenceId);
  assert.equal(rule.accountId, accounts.source, "editing the destination never moves the source");
  assert.equal(rule.destinationAccountId, accounts.secondDestination);

  await assertRejectCode(
    () =>
      updateRecurringAccountTransactionForContext(CONTEXT, selected.transactionId, {
        destinationAccountId: accounts.source,
      }),
    "TRANSACTION_TRANSFER_SAME_ACCOUNT",
  );

  const currentOnly = await createFutureTransfer(accounts, `${suffix}-current`);
  const currentSelected = currentOnly[1];
  assert.ok(currentSelected);
  await updateTransactionForContext(CONTEXT, currentSelected.transactionId, {
    destinationAccountId: accounts.secondDestination,
  });
  const afterCurrent = await readOccurrences(currentSelected.recurrenceId);
  assert.equal(afterCurrent[1]?.destinationAccountId, accounts.secondDestination);
  assert.equal(afterCurrent[2]?.destinationAccountId, accounts.destination);
  assert.equal(
    (await readRecurrence(currentSelected.recurrenceId)).destinationAccountId,
    accounts.destination,
  );
}

async function assertExpandedEditRejectsCrossCurrencyWithoutEffects(
  accounts: Accounts,
  suffix: string,
): Promise<void> {
  const fixture = await createFutureTransfer(accounts, `${suffix}-cross`);
  const selected = fixture[1];
  assert.ok(selected);

  await assertRejectCode(
    () =>
      updateRecurringAccountTransactionForContext(CONTEXT, selected.transactionId, {
        destinationAccountId: accounts.usd,
      }),
    "RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED",
  );
  await assertRejectCode(
    () =>
      updateTransactionForContext(CONTEXT, selected.transactionId, {
        destinationAccountId: accounts.usd,
        destinationAmountMinor: 800,
        applyToFuturePlanned: true,
      }),
    "RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED",
  );

  const after = await readOccurrences(selected.recurrenceId);
  assert.deepEqual(after, fixture, "rejected cross-currency edits leave occurrences untouched");
  assert.equal(
    (await readRecurrence(selected.recurrenceId)).destinationAccountId,
    accounts.destination,
  );
}

async function assertKindChangeDropsDestination(accounts: Accounts, suffix: string): Promise<void> {
  const fixture = await createFutureTransfer(accounts, `${suffix}-kind`);
  const selected = fixture[1];
  assert.ok(selected);

  await updateRecurringAccountTransactionForContext(CONTEXT, selected.transactionId, {
    kind: "expense",
  });

  const after = await readOccurrences(selected.recurrenceId);
  assert.equal(after[0]?.kind, "TRANSFER", "previous occurrence stays unchanged");
  for (const occurrence of after.slice(1)) {
    assert.equal(occurrence.kind, "EXPENSE");
    assert.equal(occurrence.destinationAccountId, null, "no residual destination");
    assert.equal(occurrence.destinationAmountMinor, null);
    assert.equal(occurrence.transferGroupId, null);
  }
  const rule = await readRecurrence(selected.recurrenceId);
  assert.equal(rule.kind, "EXPENSE");
  assert.equal(rule.destinationAccountId, null);
}

async function createFutureTransfer(accounts: Accounts, label: string): Promise<OccurrenceRow[]> {
  const recurrence = await createRecurrenceForContext(CONTEXT, {
    frequency: "monthly",
    startOn: "2028-07-10",
    amountMinor: 4_000,
    description: `Transferencia futura 677 ${label}`,
    kind: "transfer",
    accountId: accounts.source,
    destinationAccountId: accounts.destination,
  });
  await generateInstallmentsForContext(CONTEXT, recurrence.id, "2028-10-10", 4);
  const occurrences = await readOccurrences(recurrence.id);
  assert.equal(occurrences.length, 4);
  return occurrences;
}

function assertTransferOccurrence(
  occurrence: OccurrenceRow | undefined,
  sourceAccountId: string,
  destinationAccountId: string,
  amountMinor: number,
): void {
  assert.ok(occurrence);
  assert.equal(occurrence.kind, "TRANSFER", "occurrence must not become income/expense");
  assert.equal(occurrence.accountId, sourceAccountId);
  assert.equal(occurrence.destinationAccountId, destinationAccountId);
  assert.equal(Number(occurrence.amountMinor), amountMinor);
  assert.equal(occurrence.currency, "BRL");
  assert.equal(Number(occurrence.destinationAmountMinor), amountMinor);
  assert.equal(occurrence.destinationCurrency, "BRL");
  assert.ok(occurrence.transferGroupId, "transfer occurrence keeps a logical identity");
}

async function createAccount(
  context: TenantContext,
  name: string,
  currency: string,
): Promise<string> {
  const account = await createAccountForContext(context, {
    name,
    kind: "checking",
    openingBalanceMinor: 0,
    currency,
  });
  return account.id;
}

async function assertRejectCode(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      String(error.code) === expectedCode
    );
  });
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
       t."id" as "transactionId",
       t."recurrenceId",
       t."kind",
       t."accountId",
       t."destinationAccountId",
       t."amountMinor",
       t."currency",
       t."destinationAmountMinor",
       t."destinationCurrency",
       t."transferGroupId",
       to_char(t."plannedOn", 'YYYY-MM-DD') as "plannedOn"
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
    `select "kind", "accountId", "destinationAccountId"
       from "Recurrence"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [recurrenceId, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );
  const row = rows[0];
  assert.ok(row);
  return row;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

interface OccurrenceRow {
  transactionId: string;
  recurrenceId: string;
  kind: string;
  accountId: string | null;
  destinationAccountId: string | null;
  amountMinor: number | string;
  currency: string;
  destinationAmountMinor: number | string | null;
  destinationCurrency: string | null;
  transferGroupId: string | null;
  plannedOn: string;
}

interface RecurrenceRow {
  kind: string;
  accountId: string | null;
  destinationAccountId: string | null;
}
