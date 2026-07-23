import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  cloneTransactionGroupForContext,
  cloneTransactionGroupMemberForContext,
  setTransactionGroupStatusForContext,
  updateTransactionGroupMemberForContext,
  voidTransactionGroupForContext,
  voidTransactionGroupMemberForContext,
} from "./repositories/transaction-group-actions.js";
import {
  createTransactionGroupForContext,
  getTransactionGroupForContext,
} from "./repositories/transaction-groups.js";
import {
  createTransactionForContext,
  getTransactionForContext,
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
    name: `Conta ações de grupo ${Date.now()}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const members = await Promise.all(
    [1000, 2000, 3000].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2028-02-0${index + 1}`,
        effectiveOn: `2028-02-0${index + 1}`,
        description: `Membro editável ${index + 1}`,
      }),
    ),
  );
  const group = await createTransactionGroupForContext(context, {
    memberIds: members.map((member) => member.id),
    description: "Grupo com ações",
    displayOn: "2028-02-03",
  });

  const edited = await updateTransactionGroupMemberForContext(context, group.id, members[0]!.id, {
    amountMinor: 1500,
    date: "2028-02-10",
    description: "Membro alterado",
  });
  assert.equal(edited.totalAmountMinor, 6500);
  assert.equal(
    edited.members.find((member) => member.id === members[0]!.id)?.description,
    "Membro alterado",
  );

  const reconciled = await setTransactionGroupStatusForContext(context, group.id, "reconciled");
  assert.equal(reconciled.status, "reconciled");
  assert.ok(reconciled.members.every((member) => member.status === "reconciled"));
  const posted = await setTransactionGroupStatusForContext(context, group.id, "posted");
  assert.ok(posted.members.every((member) => member.status === "posted"));

  const singleClone = await cloneTransactionGroupMemberForContext(
    context,
    group.id,
    members[0]!.id,
  );
  const persistedSingleClone = await getTransactionForContext(context, singleClone.id);
  assert.equal(persistedSingleClone.transactionGroupId, undefined);
  assert.equal(persistedSingleClone.status, "posted");
  assert.match(persistedSingleClone.description, /^Cópia de /);

  const groupClones = await cloneTransactionGroupForContext(context, group.id);
  assert.equal(groupClones.length, 3);
  for (const clone of groupClones) {
    assert.equal((await getTransactionForContext(context, clone.id)).transactionGroupId, undefined);
  }

  const firstRemoval = await voidTransactionGroupMemberForContext(
    context,
    group.id,
    members[0]!.id,
  );
  assert.equal(firstRemoval.groupRemoved, false);
  assert.equal((await getTransactionGroupForContext(context, group.id)).members.length, 2);
  const secondRemoval = await voidTransactionGroupMemberForContext(
    context,
    group.id,
    members[1]!.id,
  );
  assert.equal(secondRemoval.groupRemoved, true);
  await assert.rejects(() => getTransactionGroupForContext(context, group.id));
  assert.equal(
    (await getTransactionForContext(context, members[2]!.id)).transactionGroupId,
    undefined,
  );

  const deleteMembers = await Promise.all(
    [4000, 5000].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2028-03-0${index + 1}`,
        effectiveOn: `2028-03-0${index + 1}`,
        description: `Excluir grupo ${index + 1}`,
      }),
    ),
  );
  const deleteGroup = await createTransactionGroupForContext(context, {
    memberIds: deleteMembers.map((member) => member.id),
    description: "Grupo para excluir",
    displayOn: "2028-03-02",
  });
  const deleted = await voidTransactionGroupForContext(context, deleteGroup.id);
  assert.equal(deleted.voidedMemberIds.length, 2);
  for (const member of deleteMembers) {
    assert.equal((await getTransactionForContext(context, member.id)).status, "voided");
  }

  const audits = await query<{ count: number }>(
    `select count(*)::int as count from "AuditLogEntry" where "entityId"=$1`,
    [group.id],
  );
  assert.ok((audits[0]?.count ?? 0) >= 6);
}
