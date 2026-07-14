import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  archiveAccountForContext,
  createAccountForContext,
} from "./repositories/accounts.js";
import {
  createRecurrenceForContext,
  generateInstallmentsForContext,
} from "./repositories/recurrences.js";
import { updateTransactionForContext } from "./repositories/transactions.js";

const PERSONAL_CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const OTHER_PROFILE_CONTEXT: TenantContext = {
  organizationId: PERSONAL_CONTEXT.organizationId,
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "business",
  userId: PERSONAL_CONTEXT.userId,
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

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const source = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta origem issue 473 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const target = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta destino issue 473 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const archived = await createAccountForContext(PERSONAL_CONTEXT, {
    name: `Conta arquivada issue 473 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  await archiveAccountForContext(PERSONAL_CONTEXT, archived.id);
  const otherProfileAccount = await createAccountForContext(OTHER_PROFILE_CONTEXT, {
    name: `Conta outro perfil issue 473 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });

  await assertCurrentOnly(source.id, target.id, `${suffix}-current`);
  await assertCurrentAndFuture(source.id, target.id, `${suffix}-future`);
  await assertInvalidAccounts(source.id, archived.id, otherProfileAccount.id, `${suffix}-invalid`);
  await assertAtomicRollback(source.id, target.id, `${suffix}-rollback`);
}

async function assertCurrentOnly(
  sourceAccountId: string,
  targetAccountId: string,
  label: string,
): Promise<void> {
  const fixture = await createMixedRecurrence(sourceAccountId, label);
  const selected = fixture.occurrences[1];
  assert.ok(selected);

  const updated = await updateTransactionForContext(PERSONAL_CONTEXT, selected.transactionId, {
    accountId: targetAccountId,
  });

  assert.equal(updated.accountId, targetAccountId);
  const after = await readOccurrences(fixture.recurrenceId);
  assert.equal(after.length, fixture.occurrences.length);
  assert.equal(after[0]?.accountId, sourceAccountId);
  assert.equal(after[1]?.accountId, targetAccountId);
  assert.equal(after[2]?.accountId, sourceAccountId);
  assert.equal(after[3]?.accountId, sourceAccountId);
  assert.equal(after[4]?.accountId, sourceAccountId);
  assert.equal((await readRecurrence(fixture.recurrenceId)).accountId, sourceAccountId);
  assertPreservedNonAccountFields(fixture.occurrences, after);
}

async function assertCurrentAndFuture(
  sourceAccountId: string,
  targetAccountId: string,
  label: string,
): Promise<void> {
  const fixture = await createMixedRecurrence(sourceAccountId, label);
  const selected = fixture.occurrences[1];
  assert.ok(selected);

  await updateTransactionForContext(PERSONAL_CONTEXT, selected.transactionId, {
    accountId: targetAccountId,
    applyToFuturePlanned: true,
  });

  const after = await readOccurrences(fixture.recurrenceId);
  assert.equal(after.length, fixture.occurrences.length);
  assert.equal(after[0]?.accountId, sourceAccountId, "past occurrence must remain in source");
  assert.equal(after[1]?.accountId, targetAccountId, "selected occurrence must move");
  assert.equal(after[2]?.accountId, targetAccountId, "future planned occurrence must move");
  assert.equal(after[3]?.accountId, sourceAccountId, "reconciled occurrence must remain in source");
  assert.equal(after[4]?.accountId, sourceAccountId, "voided occurrence must remain in source");
  assert.equal((await readRecurrence(fixture.recurrenceId)).accountId, targetAccountId);

  await updateTransactionForContext(PERSONAL_CONTEXT, selected.transactionId, {
    accountId: targetAccountId,
    applyToFuturePlanned: true,
  });
  const afterSameAccount = await readOccurrences(fixture.recurrenceId);
  assert.equal(afterSameAccount.length, fixture.occurrences.length, "same-account edit must not duplicate rows");
  assert.deepEqual(
    afterSameAccount.map((row) => row.transactionId),
    after.map((row) => row.transactionId),
  );
}

async function assertInvalidAccounts(
  sourceAccountId: string,
  archivedAccountId: string,
  otherProfileAccountId: string,
  label: string,
): Promise<void> {
  const fixture = await createMixedRecurrence(sourceAccountId, label);
  const selected = fixture.occurrences[1];
  assert.ok(selected);

  await assertRejectCode(
    () =>
      updateTransactionForContext(PERSONAL_CONTEXT, selected.transactionId, {
        accountId: archivedAccountId,
        applyToFuturePlanned: true,
      }),
    "TRANSACTION_ACCOUNT_ARCHIVED",
  );
  await assertRejectCode(
    () =>
      updateTransactionForContext(PERSONAL_CONTEXT, selected.transactionId, {
        accountId: otherProfileAccountId,
        applyToFuturePlanned: true,
      }),
    "TENANT_RESOURCE_NOT_FOUND",
  );

  const after = await readOccurrences(fixture.recurrenceId);
  assert.deepEqual(
    after.map((row) => row.accountId),
    fixture.occurrences.map((row) => row.accountId),
  );
  assert.equal((await readRecurrence(fixture.recurrenceId)).accountId, sourceAccountId);
}

async function assertAtomicRollback(
  sourceAccountId: string,
  targetAccountId: string,
  label: string,
): Promise<void> {
  const fixture = await createMixedRecurrence(sourceAccountId, label);
  const selected = fixture.occurrences[1];
  const futurePlanned = fixture.occurrences[2];
  assert.ok(selected);
  assert.ok(futurePlanned);

  const constraintName = `qa_issue_473_${Date.now().toString(36)}_${process.pid}`;
  const futureId = assertUuid(futurePlanned.transactionId);
  const targetId = assertUuid(targetAccountId);
  await query(
    `alter table "Transaction" add constraint "${constraintName}"
       check ("id" <> '${futureId}'::uuid or "accountId" <> '${targetId}'::uuid) not valid`,
  );

  try {
    await assert.rejects(
      () =>
        updateTransactionForContext(PERSONAL_CONTEXT, selected.transactionId, {
          accountId: targetAccountId,
          applyToFuturePlanned: true,
        }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "code" in error && error.code === "23514",
    );
  } finally {
    await query(`alter table "Transaction" drop constraint if exists "${constraintName}"`);
  }

  const after = await readOccurrences(fixture.recurrenceId);
  assert.equal(after.length, fixture.occurrences.length);
  assert.deepEqual(
    after.map((row) => row.accountId),
    fixture.occurrences.map((row) => row.accountId),
    "all transaction account changes must roll back",
  );
  assert.equal(
    (await readRecurrence(fixture.recurrenceId)).accountId,
    sourceAccountId,
    "recurrence account change must roll back",
  );
}

async function createMixedRecurrence(
  sourceAccountId: string,
  label: string,
): Promise<{ recurrenceId: string; occurrences: OccurrenceRow[] }> {
  const recurrence = await createRecurrenceForContext(PERSONAL_CONTEXT, {
    frequency: "monthly",
    startOn: "2028-07-10",
    amountMinor: 12_345,
    description: `Recorrencia issue 473 ${label}`,
    kind: "expense",
    accountId: sourceAccountId,
  });
  await generateInstallmentsForContext(PERSONAL_CONTEXT, recurrence.id, "2028-11-10", 5);

  const generated = await readOccurrences(recurrence.id);
  assert.equal(generated.length, 5);
  const past = generated[0];
  const reconciled = generated[3];
  const voided = generated[4];
  assert.ok(past);
  assert.ok(reconciled);
  assert.ok(voided);

  await query(
    `update "Transaction" set "status" = 'POSTED', "effectiveOn" = "plannedOn"
       where "id" = $1`,
    [past.transactionId],
  );
  await query(
    `update "Transaction" set "status" = 'RECONCILED', "effectiveOn" = "plannedOn", "reconciledAt" = now()
       where "id" = $1`,
    [reconciled.transactionId],
  );
  await query(
    `update "Transaction" set "status" = 'VOIDED', "voidedAt" = now()
       where "id" = $1`,
    [voided.transactionId],
  );

  return { recurrenceId: recurrence.id, occurrences: await readOccurrences(recurrence.id) };
}

function assertPreservedNonAccountFields(before: OccurrenceRow[], after: OccurrenceRow[]): void {
  for (const [index, row] of after.entries()) {
    assert.equal(row.transactionId, before[index]?.transactionId);
    assert.equal(row.status, before[index]?.status);
    assert.equal(row.amountMinor, before[index]?.amountMinor);
    assert.equal(row.description, before[index]?.description);
    assert.equal(row.plannedOn, before[index]?.plannedOn);
  }
}

async function assertRejectCode(action: () => Promise<unknown>, expectedCode: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      String(error.code) === expectedCode
    );
  });
}

function assertUuid(value: string): string {
  assert.match(value, /^[0-9a-f-]{36}$/i);
  return value;
}

async function readOccurrences(recurrenceId: string): Promise<OccurrenceRow[]> {
  return query<OccurrenceRow>(
    `select
       t."id" as "transactionId",
       t."accountId",
       t."status",
       t."amountMinor",
       t."description",
       to_char(t."plannedOn", 'YYYY-MM-DD') as "plannedOn",
       i."sequenceNumber"
     from "Transaction" t
     join "Installment" i
       on i."id" = t."installmentId"
      and i."organizationId" = t."organizationId"
      and i."financialProfileId" = t."financialProfileId"
     where t."organizationId" = $1
       and t."financialProfileId" = $2
       and t."recurrenceId" = $3
     order by i."sequenceNumber" asc`,
    [PERSONAL_CONTEXT.organizationId, PERSONAL_CONTEXT.financialProfileId, recurrenceId],
  );
}

async function readRecurrence(recurrenceId: string): Promise<RecurrenceRow> {
  const rows = await query<RecurrenceRow>(
    `select "accountId"
       from "Recurrence"
      where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [recurrenceId, PERSONAL_CONTEXT.organizationId, PERSONAL_CONTEXT.financialProfileId],
  );
  const row = rows[0];
  assert.ok(row);
  return row;
}

interface OccurrenceRow {
  transactionId: string;
  accountId: string | null;
  status: string;
  amountMinor: number;
  description: string;
  plannedOn: string;
  sequenceNumber: number;
}

interface RecurrenceRow {
  accountId: string | null;
}
