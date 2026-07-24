import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  executeTransactionBulkActionForContext,
} from "./repositories/transaction-bulk-actions.js";
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
    name: `Conta seleção em massa ${Date.now()}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
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
  assert.equal(
    (await getTransactionForContext(context, directPosted.id)).status,
    "reconciled",
  );
  assert.equal(
    (await getTransactionForContext(context, directReconciled.id)).status,
    "reconciled",
  );

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
  assert.equal(
    (await getTransactionForContext(context, directPosted.id)).status,
    "posted",
  );
  assert.equal(
    (await getTransactionForContext(context, directReconciled.id)).status,
    "posted",
  );

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
  await assert.rejects(
    () =>
      executeTransactionBulkActionForContext(context, {
        action: "reconcile",
        transactionIds: [directPosted.id, planned.id],
      }),
    hasCode("TRANSACTION_BULK_STATUS_INVALID"),
  );
  assert.equal(
    (await getTransactionForContext(context, directPosted.id)).status,
    "posted",
  );
  assert.equal(
    (await getTransactionForContext(context, planned.id)).status,
    "planned",
  );

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
  assert.equal(
    (await getTransactionForContext(context, directPosted.id)).status,
    "voided",
  );
  for (const member of members) {
    assert.equal(
      (await getTransactionForContext(context, member.id)).status,
      "voided",
    );
  }
  assert.equal(
    (await getTransactionForContext(context, directReconciled.id)).status,
    "posted",
  );

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
    assert.ok(
      ["reconcile", "unreconcile", "void"].includes(
        String(audit.changes.action),
      ),
    );
    assert.equal(Number.isInteger(audit.changes.selectedGroupCount), true);
    assert.equal(Number.isInteger(audit.changes.selectedDirectCount), true);
    assert.equal(
      Number.isInteger(audit.changes.affectedTransactionCount),
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(audit.changes),
      /Direto|Membro|Grupo da seleção|BRL|amount|description|currency/i,
    );
  }
}

function readAuditChanges(value: unknown): Record<string, unknown> {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
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
