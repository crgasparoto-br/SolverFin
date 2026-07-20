import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  createTransactionGroupForContext,
  getTransactionGroupForContext,
  listTransactionGroupsForContext,
  ungroupTransactionsForContext,
} from "./repositories/transaction-groups.js";
import {
  createTransactionForContext,
  getTransactionForContext,
  updateTransactionForContext,
} from "./repositories/transactions.js";

const context: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

void main().finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);
  const account = await createAccountForContext(context, {
    name: `Conta grupo ${Date.now()}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const members = await Promise.all(
    [101, 202, 303, 404].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2028-01-0${index + 1}`,
        description: `Membro ${index + 1}`,
      }),
    ),
  );

  const group = await createTransactionGroupForContext(context, {
    memberIds: members.slice(0, 2).map((member) => member.id),
    description: "Grupo de teste",
    displayOn: "2028-01-02",
  });
  assert.equal(group.totalAmountMinor, 303);
  assert.equal((await getTransactionGroupForContext(context, group.id)).members.length, 2);
  assert.equal(
    (
      await listTransactionGroupsForContext(context, {
        accountId: account.id,
        startsOn: "2028-01-01",
        endsOn: "2028-01-31",
      })
    ).length,
    1,
  );
  await assert.rejects(
    () => updateTransactionForContext(context, members[0]!.id, { status: "reconciled" }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "TRANSACTION_GROUP_MEMBER_UPDATE_BLOCKED",
  );
  const unchangedMember = await getTransactionForContext(context, members[0]!.id);
  assert.equal(unchangedMember.status, "posted");
  assert.equal(unchangedMember.amountMinor, members[0]!.amountMinor);
  assert.equal(unchangedMember.recurrenceId, members[0]!.recurrenceId);
  assert.equal(unchangedMember.installmentId, members[0]!.installmentId);
  assert.equal(unchangedMember.importBatchId, members[0]!.importBatchId);
  assert.equal(unchangedMember.transferGroupId, members[0]!.transferGroupId);

  const attempts = await Promise.allSettled([
    createTransactionGroupForContext(context, {
      memberIds: members.slice(2).map((member) => member.id),
      description: "Concorrente A",
      displayOn: "2028-01-03",
    }),
    createTransactionGroupForContext(context, {
      memberIds: members.slice(2).map((member) => member.id),
      description: "Concorrente B",
      displayOn: "2028-01-03",
    }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const concurrentGroups = await query<{ count: number }>(
    `select count(*)::int as count from "TransactionGroup" where "organizationId"=$1 and "financialProfileId"=$2 and "description" like 'Concorrente %'`,
    [context.organizationId, context.financialProfileId],
  );
  assert.equal(
    concurrentGroups[0]?.count,
    1,
    "a tentativa concorrente deve sofrer rollback completo",
  );
  const concurrentMembers = await query<{ count: number }>(
    `select count(*)::int as count from "Transaction" where "id"=any($1::uuid[]) and "transactionGroupId" is not null`,
    [members.slice(2).map((member) => member.id)],
  );
  assert.equal(concurrentMembers[0]?.count, 2, "nenhum membro pode ficar parcialmente associado");

  const auditRows = await query<{ redactedChanges: Record<string, unknown> }>(
    `select "redactedChanges" from "AuditLogEntry" where "entityId"=$1`,
    [group.id],
  );
  assert.deepEqual(Object.keys(auditRows[0]?.redactedChanges ?? {}).sort(), [
    "grouping",
    "memberCount",
  ]);

  const otherProfile = { ...context, financialProfileId: "33333333-3333-4333-8333-333333333332" };
  await assert.rejects(
    () => getTransactionGroupForContext(otherProfile, group.id),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "TENANT_RESOURCE_NOT_FOUND",
  );

  const result = await ungroupTransactionsForContext(context, group.id);
  assert.equal(result.ungroupedMemberIds.length, 2);
  await assert.rejects(() => getTransactionGroupForContext(context, group.id));
}
