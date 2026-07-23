import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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

  const installmentId = randomUUID();
  await query(
    `insert into "Installment"
      ("id","organizationId","financialProfileId","status","sequenceNumber","totalInstallments",
       "dueOn","amountMinor","currency","createdByUserId","updatedByUserId","createdAt","updatedAt")
     values ($1,$2,$3,'POSTED',1,3,$4,$5,'BRL',$6,$6,now(),now())`,
    [
      installmentId,
      context.organizationId,
      context.financialProfileId,
      "2028-02-01",
      1000,
      context.userId,
    ],
  );
  await query(
    `update "Transaction" set "installmentId"=$1 where "id"=$2 and "organizationId"=$3 and "financialProfileId"=$4`,
    [installmentId, members[0]!.id, context.organizationId, context.financialProfileId],
  );

  const group = await createTransactionGroupForContext(context, {
    memberIds: members.map((member) => member.id),
    description: "Grupo com ações",
    displayOn: "2028-02-03",
  });

  const foreignContext: TenantContext = {
    ...context,
    organizationId: randomUUID(),
    financialProfileId: randomUUID(),
  };
  await assert.rejects(
    () =>
      updateTransactionGroupMemberForContext(foreignContext, group.id, members[0]!.id, {
        description: "Tentativa fora do tenant",
      }),
    hasCode("TENANT_RESOURCE_NOT_FOUND"),
  );

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

  const installments = await query<{
    dueOn: Date;
    amountMinor: number;
    updatedByUserId: string | null;
  }>(
    `select "dueOn","amountMinor","updatedByUserId" from "Installment"
      where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3`,
    [installmentId, context.organizationId, context.financialProfileId],
  );
  assert.equal(installments[0]?.dueOn.toISOString().slice(0, 10), "2028-02-10");
  assert.equal(installments[0]?.amountMinor, 1500);
  assert.equal(installments[0]?.updatedByUserId, context.userId);

  await assert.rejects(
    () =>
      updateTransactionGroupMemberForContext(context, group.id, members[0]!.id, {
        categoryId: randomUUID(),
        amountMinor: 9999,
      }),
    hasCode("TRANSACTION_CATEGORY_INVALID"),
  );
  assert.equal((await getTransactionGroupForContext(context, group.id)).totalAmountMinor, 6500);
  assert.equal(
    (
      await query<{ amountMinor: number }>(
        `select "amountMinor" from "Installment" where "id"=$1`,
        [installmentId],
      )
    )[0]?.amountMinor,
    1500,
  );

  await query(`drop trigger if exists "Issue528_installment_sync_failure" on "Installment"`);
  await query(`drop function if exists issue528_installment_sync_failure()`);
  await query(
    `create function issue528_installment_sync_failure() returns trigger as $$
       begin
         if new."amountMinor" = 1777 then
           raise exception 'issue 528 rollback probe';
         end if;
         return new;
       end;
     $$ language plpgsql`,
  );
  await query(
    `create trigger "Issue528_installment_sync_failure"
       before update on "Installment"
       for each row execute function issue528_installment_sync_failure()`,
  );
  try {
    await assert.rejects(
      () =>
        updateTransactionGroupMemberForContext(context, group.id, members[0]!.id, {
          amountMinor: 1777,
          description: "Alteração que deve reverter",
        }),
      /issue 528 rollback probe/,
    );
  } finally {
    await query(`drop trigger if exists "Issue528_installment_sync_failure" on "Installment"`);
    await query(`drop function if exists issue528_installment_sync_failure()`);
  }
  const rolledBackGroup = await getTransactionGroupForContext(context, group.id);
  assert.equal(rolledBackGroup.totalAmountMinor, 6500);
  assert.equal(
    rolledBackGroup.members.find((member) => member.id === members[0]!.id)?.amountMinor,
    1500,
  );
  assert.equal(
    (
      await query<{ amountMinor: number }>(
        `select "amountMinor" from "Installment" where "id"=$1`,
        [installmentId],
      )
    )[0]?.amountMinor,
    1500,
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
  const originalRows = await query<{ total: number; grouped: number }>(
    `select coalesce(sum("amountMinor"),0)::int as total,
            count(*) filter (where "transactionGroupId"=$1)::int as grouped
       from "Transaction"
      where "organizationId"=$2 and "financialProfileId"=$3 and "id"=any($4::uuid[])`,
    [
      group.id,
      context.organizationId,
      context.financialProfileId,
      members.map((member) => member.id),
    ],
  );
  assert.equal(originalRows[0]?.total, 6500);
  assert.equal(originalRows[0]?.grouped, 3);

  const plannedMembers = await Promise.all(
    [7000, 8000].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "planned",
        amountMinor,
        occurredOn: `2028-04-0${index + 1}`,
        plannedOn: `2028-04-0${index + 1}`,
        effectiveOn: null,
        description: `Membro previsto ${index + 1}`,
      }),
    ),
  );
  const plannedGroup = await createTransactionGroupForContext(context, {
    memberIds: plannedMembers.map((member) => member.id),
    description: "Grupo previsto",
    displayOn: "2028-04-02",
  });
  await assert.rejects(
    () => setTransactionGroupStatusForContext(context, plannedGroup.id, "reconciled"),
    hasCode("TRANSACTION_GROUP_RECONCILE_REQUIRES_EFFECTIVE"),
  );
  assert.ok(
    (await getTransactionGroupForContext(context, plannedGroup.id)).members.every(
      (member) => member.status === "planned",
    ),
  );

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

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal((error as { code?: string }).code, expected);
    return true;
  };
}
