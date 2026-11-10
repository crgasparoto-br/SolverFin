import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query, withTransaction } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { executeTransactionBulkActionForContext } from "./repositories/transaction-bulk-actions.js";
import {
  createTransactionGroupForContext,
  getTransactionGroupForContext,
  listTransactionGroupsForContext,
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
    name: `Conta seleção em massa ${Date.now()}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  await verifyTransferBulkReconciliation(account.id);
  const directPosted = await createTransactionForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "posted",
    amountMinor: 1000,
    occurredOn: "2028-06-01",
    effectiveOn: "2028-06-01",
    description: "Direto efetivado",
  });
  const directReconciled = await createTransactionForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "posted",
    amountMinor: 2000,
    occurredOn: "2028-06-02",
    effectiveOn: "2028-06-02",
    description: "Direto conciliado",
  });
  await query(
    `update "Transaction" set "status"='RECONCILED', "reconciledAt"=now() where "id"=$1`,
    [directReconciled.id],
  );

  const members = await Promise.all(
    [3000, 4000].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2028-06-0${index + 3}`,
        effectiveOn: `2028-06-0${index + 3}`,
        description: `Membro em massa ${index + 1}`,
      }),
    ),
  );
  const group = await createTransactionGroupForContext(context, {
    memberIds: members.map((member) => member.id),
    description: "Grupo da seleção em massa",
    displayOn: "2028-06-04",
  });

  const reconciled = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: [directPosted.id, directReconciled.id, members[0]!.id],
    groupIds: [group.id],
  });
  assert.equal(reconciled.affectedTransactionIds.length, 3);
  assert.deepEqual(reconciled.unchangedTransactionIds, [directReconciled.id]);
  assert.equal(reconciled.removedGroupIds.length, 0);
  assert.ok(
    (await getTransactionGroupForContext(context, group.id)).members.every(
      (member) => member.status === "reconciled",
    ),
  );
  assert.equal((await getTransactionForContext(context, directPosted.id)).status, "reconciled");
  assert.equal((await getTransactionForContext(context, directReconciled.id)).status, "reconciled");

  const unreconciled = await executeTransactionBulkActionForContext(context, {
    action: "unreconcile",
    transactionIds: [directPosted.id, directReconciled.id],
    groupIds: [group.id],
  });
  assert.equal(unreconciled.affectedTransactionIds.length, 4);
  assert.ok(
    (await getTransactionGroupForContext(context, group.id)).members.every(
      (member) => member.status === "posted",
    ),
  );
  assert.equal((await getTransactionForContext(context, directPosted.id)).status, "posted");
  assert.equal((await getTransactionForContext(context, directReconciled.id)).status, "posted");

  await assert.rejects(
    () =>
      executeTransactionBulkActionForContext(context, {
        action: "reconcile",
        transactionIds: [members[0]!.id],
      }),
    hasCode("TRANSACTION_BULK_GROUP_REQUIRED"),
  );

  const planned = await createTransactionForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "planned",
    amountMinor: 5000,
    occurredOn: "2028-06-05",
    plannedOn: "2028-06-05",
    effectiveOn: null,
    description: "Previsto bloqueador",
  });
  const dateBeforeReconcile = new Date().toISOString().slice(0, 10);
  const mixedReconcile = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: [directPosted.id, planned.id],
  });
  const dateAfterReconcile = new Date().toISOString().slice(0, 10);
  assert.deepEqual(
    new Set(mixedReconcile.affectedTransactionIds),
    new Set([directPosted.id, planned.id]),
  );
  assert.deepEqual(mixedReconcile.unchangedTransactionIds, []);
  const updatedPlanned = await getTransactionForContext(context, planned.id);
  assert.equal(updatedPlanned.status, "reconciled");
  assert.ok([dateBeforeReconcile, dateAfterReconcile].includes(updatedPlanned.effectiveOn ?? ""));
  assert.equal(updatedPlanned.plannedOn, "2028-06-05");
  assert.equal(updatedPlanned.occurredOn, "2028-06-05");
  assert.equal((await getTransactionForContext(context, directPosted.id)).status, "reconciled");

  const anotherPlanned = await createTransactionForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "planned",
    amountMinor: 6500,
    occurredOn: "2028-06-06",
    plannedOn: "2028-06-06",
    effectiveOn: null,
    description: "Previsto mantido na desconciliação",
  });
  const mixedUnreconcile = await executeTransactionBulkActionForContext(context, {
    action: "unreconcile",
    transactionIds: [planned.id, anotherPlanned.id, directReconciled.id],
  });
  assert.deepEqual(mixedUnreconcile.affectedTransactionIds, [planned.id]);
  assert.deepEqual(
    new Set(mixedUnreconcile.unchangedTransactionIds),
    new Set([anotherPlanned.id, directReconciled.id]),
  );
  assert.equal((await getTransactionForContext(context, planned.id)).status, "posted");
  assert.equal((await getTransactionForContext(context, anotherPlanned.id)).status, "planned");
  assert.equal((await getTransactionForContext(context, anotherPlanned.id)).effectiveOn, undefined);

  const idempotentMixed = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: [directPosted.id, directReconciled.id, anotherPlanned.id],
  });
  assert.deepEqual(idempotentMixed.unchangedTransactionIds, [directPosted.id]);
  assert.deepEqual(
    new Set(idempotentMixed.affectedTransactionIds),
    new Set([directReconciled.id, anotherPlanned.id]),
  );
  assert.equal((await getTransactionForContext(context, anotherPlanned.id)).status, "reconciled");

  // Legacy POSTED rows may have no effectiveOn; their original occurredOn is authoritative.
  // A distinct future occurredOn catches an incorrect fallback to the current UTC day.
  const legacyPosted = await createTransactionForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "posted",
    amountMinor: 5400,
    occurredOn: "2028-08-11",
    plannedOn: "2028-08-09",
    effectiveOn: "2028-08-11",
    description: "Efetivado legado sem data efetiva",
  });
  await query(`update "Transaction" set "effectiveOn"=null where "id"=$1`, [legacyPosted.id]);
  assert.equal((await getTransactionForContext(context, legacyPosted.id)).effectiveOn, undefined);
  const legacyResult = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: [legacyPosted.id],
  });
  assert.deepEqual(legacyResult.affectedTransactionIds, [legacyPosted.id]);
  const reconciledLegacy = await getTransactionForContext(context, legacyPosted.id);
  assert.equal(reconciledLegacy.status, "reconciled");
  assert.equal(reconciledLegacy.effectiveOn, "2028-08-11");
  assert.equal(reconciledLegacy.occurredOn, "2028-08-11");
  assert.equal(reconciledLegacy.plannedOn, "2028-08-09");

  const suggested = await createTransactionForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "suggested",
    amountMinor: 7000,
    occurredOn: "2028-06-07",
    plannedOn: "2028-06-07",
    effectiveOn: null,
    description: "Sugestão protegida",
  });
  await assert.rejects(
    () =>
      executeTransactionBulkActionForContext(context, {
        action: "unreconcile",
        transactionIds: [directPosted.id, suggested.id],
      }),
    hasCode("TRANSACTION_BULK_STATUS_INVALID"),
  );
  assert.equal((await getTransactionForContext(context, directPosted.id)).status, "reconciled");
  assert.equal((await getTransactionForContext(context, suggested.id)).status, "suggested");

  const rollbackAuditCountBefore = await countAudits(group.id);
  const rollbackSuffix = randomUUID().replaceAll("-", "");
  const rollbackFunctionName = `raise_bulk_rollback_${rollbackSuffix}`;
  const rollbackTriggerName = `transaction_bulk_rollback_${rollbackSuffix}`;
  await query(
    `create function "${rollbackFunctionName}"() returns trigger
       language plpgsql
       as $$
       begin
         raise exception 'intentional bulk action audit failure';
       end;
       $$`,
  );
  try {
    await query(
      `create trigger "${rollbackTriggerName}"
         before insert on "AuditLogEntry"
         for each row
         when (new."entityId"='${group.id}' and new."action"='RECONCILE')
         execute function "${rollbackFunctionName}"()`,
    );
    try {
      await assert.rejects(
        () =>
          executeTransactionBulkActionForContext(context, {
            action: "reconcile",
            groupIds: [group.id],
          }),
        /intentional bulk action audit failure/,
      );
    } finally {
      await query(`drop trigger if exists "${rollbackTriggerName}" on "AuditLogEntry"`);
    }
  } finally {
    await query(`drop function if exists "${rollbackFunctionName}"()`);
  }

  const groupAfterIntermediateFailure = await getTransactionGroupForContext(context, group.id);
  assert.equal(groupAfterIntermediateFailure.members.length, members.length);
  for (const member of groupAfterIntermediateFailure.members) {
    assert.equal(member.status, "posted");
    assert.equal(member.transactionGroupId, group.id);
  }
  assert.equal(await countAudits(group.id), rollbackAuditCountBefore);

  const foreignContext: TenantContext = {
    ...context,
    organizationId: randomUUID(),
    financialProfileId: randomUUID(),
  };
  await assert.rejects(
    () =>
      executeTransactionBulkActionForContext(foreignContext, {
        action: "void",
        groupIds: [group.id],
      }),
    hasCode("TENANT_RESOURCE_NOT_FOUND"),
  );

  const deleted = await executeTransactionBulkActionForContext(context, {
    action: "void",
    transactionIds: [directPosted.id],
    groupIds: [group.id],
  });
  assert.equal(deleted.affectedTransactionIds.length, 3);
  assert.deepEqual(deleted.removedGroupIds, [group.id]);
  await assert.rejects(() => getTransactionGroupForContext(context, group.id));
  assert.equal((await getTransactionForContext(context, directPosted.id)).status, "voided");
  for (const member of members) {
    assert.equal((await getTransactionForContext(context, member.id)).status, "voided");
  }
  assert.equal((await getTransactionForContext(context, directReconciled.id)).status, "reconciled");

  const audits = await query<{ action: string; redactedChanges: unknown }>(
    `select "action", "redactedChanges" from "AuditLogEntry" where "entityId"=$1 order by "occurredAt"`,
    [group.id],
  );
  const bulkAudits = audits
    .map((audit) => ({
      action: audit.action,
      changes: readAuditChanges(audit.redactedChanges),
    }))
    .filter((audit) => audit.changes.bulkSelection === true);
  assert.equal(bulkAudits.length, 3);
  assert.deepEqual(
    bulkAudits.map((audit) => audit.action),
    ["RECONCILE", "UNRECONCILE", "SOFT_DELETE"],
  );

  // The group JSON must expose the server-calculated guard even when the
  // remuneration transaction still carries a legacy/manual source value.
  const protectedMembers = await Promise.all(
    [6100, 7200].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "income",
        status: "planned",
        amountMinor,
        occurredOn: `2028-09-0${index + 1}`,
        plannedOn: `2028-09-0${index + 1}`,
        effectiveOn: null,
        description: `Membro protegido em grupo ${index + 1}`,
      }),
    ),
  );
  const remunerationGroup = await createTransactionGroupForContext(context, {
    memberIds: protectedMembers.map((member) => member.id),
    description: "Grupo com remuneração automática",
    displayOn: "2028-09-01",
  });
  assert.equal(remunerationGroup.reconcileProtected, false);
  const rateId = randomUUID();
  const remunerationId = randomUUID();
  await query(
    `insert into "FinancialIndexRate" ("id","kind","referenceOn","dailyRatePercent","dailyFactor","source")
     values ($1,$2,'2028-08-31',0.01,1.0001,'integration-test')`,
    [rateId, `BULK_TEST_${rateId.slice(0, 8)}`],
  );
  try {
    await query(
      `insert into "AccountRemuneration"
        ("id","organizationId","financialProfileId","accountId","financialIndexRateId",
         "transactionId","competenceOn","processedOn","balanceBaseMinor","dailyRatePercent",
         "remunerationPercent","appliedDailyRatePercent","originalAmountMinor")
       values ($1,$2,$3,$4,$5,$6,'2028-08-31','2028-09-01',100000,0.01,100,0.01,6100)`,
      [
        remunerationId,
        context.organizationId,
        context.financialProfileId,
        account.id,
        rateId,
        protectedMembers[0]!.id,
      ],
    );
    const protectedGroup = await getTransactionGroupForContext(context, remunerationGroup.id);
    assert.equal(protectedGroup.reconcileProtected, true);
    const listedProtectedGroup = (
      await listTransactionGroupsForContext(context, {
        accountId: account.id,
        startsOn: "2028-09-01",
        endsOn: "2028-09-30",
      })
    ).find((candidate) => candidate.id === remunerationGroup.id);
    assert.equal(listedProtectedGroup?.reconcileProtected, true);
    assert.deepEqual(
      protectedGroup.members.map((member) => member.reconcileProtected),
      [true, false],
    );
    await assert.rejects(
      () =>
        executeTransactionBulkActionForContext(context, {
          action: "reconcile",
          groupIds: [remunerationGroup.id],
        }),
      hasCode("TRANSACTION_BULK_PROTECTED"),
    );
    assert.ok(
      (await getTransactionGroupForContext(context, remunerationGroup.id)).members.every(
        (member) => member.status === "planned" && member.effectiveOn === undefined,
      ),
    );
    // Prepare the reconciled fixture through the same detach/update/restore lifecycle
    // used by the bulk API. The database forbids changing status on attached members.
    await withTransaction(async (executeQuery) => {
      const memberIds = protectedMembers.map((member) => member.id);
      await executeQuery(
        `update "Transaction" set "transactionGroupId"=null
           where "organizationId"=$1 and "financialProfileId"=$2 and "transactionGroupId"=$3`,
        [context.organizationId, context.financialProfileId, remunerationGroup.id],
      );
      await executeQuery(
        `update "Transaction" set "status"='RECONCILED',
           "effectiveOn"="occurredOn", "reconciledAt"=now()
           where "organizationId"=$1 and "financialProfileId"=$2
             and "id"=any($3::uuid[])`,
        [context.organizationId, context.financialProfileId, memberIds],
      );
      await executeQuery(
        `update "Transaction" set "transactionGroupId"=$1
           where "organizationId"=$2 and "financialProfileId"=$3
             and "id"=any($4::uuid[])`,
        [remunerationGroup.id, context.organizationId, context.financialProfileId, memberIds],
      );
    });
    assert.equal(
      (await getTransactionGroupForContext(context, remunerationGroup.id)).reconcileProtected,
      true,
    );
    await assert.rejects(
      () =>
        executeTransactionBulkActionForContext(context, {
          action: "unreconcile",
          groupIds: [remunerationGroup.id],
        }),
      hasCode("TRANSACTION_BULK_PROTECTED"),
    );
    assert.ok(
      (await getTransactionGroupForContext(context, remunerationGroup.id)).members.every(
        (member) => member.status === "reconciled",
      ),
    );
  } finally {
    await query(`delete from "AccountRemuneration" where "id"=$1`, [remunerationId]);
    await query(`delete from "FinancialIndexRate" where "id"=$1`, [rateId]);
  }

  const expectedKeys = [
    "action",
    "affectedTransactionCount",
    "bulkSelection",
    "selectedDirectCount",
    "selectedGroupCount",
  ];
  for (const audit of bulkAudits) {
    assert.deepEqual(Object.keys(audit.changes).sort(), expectedKeys);
    assert.equal(audit.changes.bulkSelection, true);
    assert.ok(["reconcile", "unreconcile", "void"].includes(String(audit.changes.action)));
    assert.equal(Number.isInteger(audit.changes.selectedGroupCount), true);
    assert.equal(Number.isInteger(audit.changes.selectedDirectCount), true);
    assert.equal(Number.isInteger(audit.changes.affectedTransactionCount), true);
    assert.doesNotMatch(
      JSON.stringify(audit.changes),
      /Direto|Membro|Grupo da seleção|BRL|amount|description|currency/i,
    );
  }
}

async function verifyTransferBulkReconciliation(sourceAccountId: string): Promise<void> {
  const destination = await createAccountForContext(context, {
    name: "Destino cambial em lote " + Date.now(),
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 0,
  });
  const base = {
    accountId: sourceAccountId,
    destinationAccountId: destination.id,
    kind: "transfer" as const,
    occurredOn: "2028-10-01",
  };
  const planned = await createTransactionForContext(context, {
    ...base,
    status: "planned",
    amountMinor: 10000,
    destinationAmountMinor: 1750,
    plannedOn: "2028-10-01",
    effectiveOn: null,
    description: "Transferência prevista em lote",
  });
  const posted = await createTransactionForContext(context, {
    ...base,
    status: "posted",
    amountMinor: 20000,
    destinationAmountMinor: 3450,
    effectiveOn: "2028-10-01",
    description: "Transferência efetivada em lote",
  });
  const ids = [planned.id, posted.id];
  const before = await Promise.all(ids.map((id) => getTransactionForContext(context, id)));
  await assert.rejects(
    () =>
      executeTransactionBulkActionForContext(context, {
        action: "reconcile",
        transactionIds: [planned.id, randomUUID()],
      }),
    hasCode("TENANT_RESOURCE_NOT_FOUND"),
  );
  assert.equal((await getTransactionForContext(context, planned.id)).status, "planned");

  const beforeDay = new Date().toISOString().slice(0, 10);
  const changed = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: ids,
  });
  const afterDay = new Date().toISOString().slice(0, 10);
  assert.deepEqual(new Set(changed.affectedTransactionIds), new Set(ids));
  assert.deepEqual(changed.unchangedTransactionIds, []);
  for (const [index, id] of ids.entries()) {
    const previous = before[index]!;
    const current = await getTransactionForContext(context, id);
    assert.equal(current.status, "reconciled");
    assert.equal(current.accountId, previous.accountId);
    assert.equal(current.destinationAccountId, previous.destinationAccountId);
    assert.equal(current.transferGroupId, previous.transferGroupId);
    assert.equal(current.amountMinor, previous.amountMinor);
    assert.equal(current.currency, previous.currency);
    assert.equal(current.destinationAmountMinor, previous.destinationAmountMinor);
    assert.equal(current.destinationCurrency, previous.destinationCurrency);
    assert.equal(current.plannedOn, previous.plannedOn);
    assert.equal(current.occurredOn, previous.occurredOn);
    if (index === 0) {
      assert.ok([beforeDay, afterDay].includes(current.effectiveOn ?? ""));
    } else {
      assert.equal(current.effectiveOn, previous.effectiveOn);
    }
  }
  const repeat = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: ids,
  });
  assert.deepEqual(repeat.affectedTransactionIds, []);
  assert.deepEqual(new Set(repeat.unchangedTransactionIds), new Set(ids));

  const untouched = await createTransactionForContext(context, {
    ...base,
    status: "planned",
    amountMinor: 30000,
    destinationAmountMinor: 5200,
    plannedOn: "2028-10-01",
    effectiveOn: null,
    description: "Transferência prevista preservada em lote",
  });
  const undone = await executeTransactionBulkActionForContext(context, {
    action: "unreconcile",
    transactionIds: [...ids, untouched.id],
  });
  assert.deepEqual(new Set(undone.affectedTransactionIds), new Set(ids));
  assert.deepEqual(undone.unchangedTransactionIds, [untouched.id]);
  assert.equal((await getTransactionForContext(context, untouched.id)).status, "planned");
  assert.equal((await getTransactionForContext(context, untouched.id)).effectiveOn, undefined);
  for (const id of ids) {
    assert.equal((await getTransactionForContext(context, id)).status, "posted");
  }
}

  // Mixed batch: a BRL->USD transfer, a USD income and a BRL expense must
  // reconcile atomically, without duplicating the canonical transfer.
  const mixedTransfer = await createTransactionForContext(context, {
    ...base,
    status: "planned",
    amountMinor: 14567,
    destinationAmountMinor: 2589,
    occurredOn: "2028-10-09",
    plannedOn: "2028-10-09",
    effectiveOn: null,
    description: "Transferência cambial em seleção mista",
  });
  const mixedIncome = await createTransactionForContext(context, {
    accountId: destination.id,
    kind: "income",
    status: "posted",
    amountMinor: 7333,
    occurredOn: "2028-10-10",
    effectiveOn: "2028-10-10",
    description: "Receita USD em seleção mista",
  });
  const mixedExpense = await createTransactionForContext(context, {
    accountId: sourceAccountId,
    kind: "expense",
    status: "posted",
    amountMinor: 5666,
    occurredOn: "2028-10-11",
    effectiveOn: "2028-10-11",
    description: "Despesa BRL em seleção mista",
  });
  const mixedIds = [mixedTransfer.id, mixedIncome.id, mixedExpense.id];
  const mixedBefore = await Promise.all(
    mixedIds.map((id) => getTransactionForContext(context, id)),
  );
  assert.equal(mixedBefore[0]!.currency, "BRL");
  assert.equal(mixedBefore[0]!.destinationCurrency, "USD");
  assert.equal(mixedBefore[1]!.currency, "USD");
  assert.equal(mixedBefore[2]!.currency, "BRL");

  const invalidMixed = await createTransactionForContext(context, {
    accountId: destination.id,
    kind: "income",
    status: "suggested",
    amountMinor: 999,
    occurredOn: "2028-10-12",
    plannedOn: "2028-10-12",
    effectiveOn: null,
    description: "Sugestão protegida em seleção mista",
  });
  const mixedAuditBefore = await countAudits(mixedTransfer.id);
  await assert.rejects(
    () =>
      executeTransactionBulkActionForContext(context, {
        action: "reconcile",
        transactionIds: [mixedTransfer.id, mixedIncome.id, invalidMixed.id],
      }),
    hasCode("TRANSACTION_BULK_STATUS_INVALID"),
  );
  assert.equal(await countAudits(mixedTransfer.id), mixedAuditBefore);
  for (const [index, id] of mixedIds.entries()) {
    assert.deepEqual(await getTransactionForContext(context, id), mixedBefore[index]);
  }

  const mixedStartDay = new Date().toISOString().slice(0, 10);
  const mixedResult = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: [mixedTransfer.id, mixedIncome.id, mixedExpense.id, mixedTransfer.id],
  });
  const mixedEndDay = new Date().toISOString().slice(0, 10);
  assert.deepEqual(new Set(mixedResult.affectedTransactionIds), new Set(mixedIds));
  assert.equal(mixedResult.affectedTransactionIds.length, mixedIds.length);
  assert.deepEqual(mixedResult.unchangedTransactionIds, []);
  assert.equal(await countAudits(mixedTransfer.id), mixedAuditBefore + 1);
  for (const [index, id] of mixedIds.entries()) {
    const beforeMixed = mixedBefore[index]!;
    const afterMixed = await getTransactionForContext(context, id);
    assert.equal(afterMixed.status, "reconciled");
    assert.equal(afterMixed.accountId, beforeMixed.accountId);
    assert.equal(afterMixed.destinationAccountId, beforeMixed.destinationAccountId);
    assert.equal(afterMixed.transferGroupId, beforeMixed.transferGroupId);
    assert.equal(afterMixed.amountMinor, beforeMixed.amountMinor);
    assert.equal(afterMixed.currency, beforeMixed.currency);
    assert.equal(afterMixed.destinationAmountMinor, beforeMixed.destinationAmountMinor);
    assert.equal(afterMixed.destinationCurrency, beforeMixed.destinationCurrency);
    assert.equal(afterMixed.occurredOn, beforeMixed.occurredOn);
    assert.equal(afterMixed.plannedOn, beforeMixed.plannedOn);
    if (id === mixedTransfer.id) {
      assert.ok([mixedStartDay, mixedEndDay].includes(afterMixed.effectiveOn ?? ""));
    } else {
      assert.equal(afterMixed.effectiveOn, beforeMixed.effectiveOn);
    }
  }
  const mixedRepeat = await executeTransactionBulkActionForContext(context, {
    action: "reconcile",
    transactionIds: mixedIds,
  });
  assert.deepEqual(mixedRepeat.affectedTransactionIds, []);
  assert.deepEqual(new Set(mixedRepeat.unchangedTransactionIds), new Set(mixedIds));
  const mixedUndone = await executeTransactionBulkActionForContext(context, {
    action: "unreconcile",
    transactionIds: mixedIds,
  });
  assert.deepEqual(new Set(mixedUndone.affectedTransactionIds), new Set(mixedIds));
  for (const [index, id] of mixedIds.entries()) {
    const beforeMixed = mixedBefore[index]!;
    const afterMixed = await getTransactionForContext(context, id);
    assert.equal(afterMixed.status, "posted");
    assert.equal(afterMixed.amountMinor, beforeMixed.amountMinor);
    assert.equal(afterMixed.currency, beforeMixed.currency);
    assert.equal(afterMixed.destinationAmountMinor, beforeMixed.destinationAmountMinor);
    assert.equal(afterMixed.destinationCurrency, beforeMixed.destinationCurrency);
    assert.equal(afterMixed.accountId, beforeMixed.accountId);
    assert.equal(afterMixed.destinationAccountId, beforeMixed.destinationAccountId);
    assert.equal(afterMixed.transferGroupId, beforeMixed.transferGroupId);
    assert.equal(afterMixed.occurredOn, beforeMixed.occurredOn);
    assert.equal(afterMixed.plannedOn, beforeMixed.plannedOn);
  }


async function countAudits(entityId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    `select count(*)::int as "count" from "AuditLogEntry" where "entityId"=$1`,
    [entityId],
  );
  return rows[0]?.count ?? 0;
}

function readAuditChanges(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal((error as { code?: string }).code, expected);
    return true;
  };
}
