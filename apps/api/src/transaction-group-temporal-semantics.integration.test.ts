import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { buildCategoryEvolutionReportForSourceContext } from "./category-evolution-account-filter.js";
import { parseCategoryEvolutionFilters } from "./category-evolution-report.js";
import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { updateTransactionGroupMemberForContext } from "./repositories/transaction-group-actions.js";
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

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const account = await createAccountForContext(context, {
    name: `Conta temporal de grupo ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });

  const postedMembers = await Promise.all(
    [1000, 2000, 3000].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2034-01-0${index + 1}`,
        plannedOn: `2034-02-0${index + 1}`,
        effectiveOn: `2034-03-0${index + 1}`,
        description: `Grupo temporal realizado ${suffix}-${index + 1}`,
      }),
    ),
  );
  const postedGroup = await createTransactionGroupForContext(context, {
    memberIds: postedMembers.map((member) => member.id),
    description: `Grupo temporal ${suffix}`,
    displayOn: "2034-03-03",
  });

  await updateTransactionGroupMemberForContext(context, postedGroup.id, postedMembers[0]!.id, {
    plannedOn: "2034-02-20",
  });
  let persisted = await getTransactionForContext(context, postedMembers[0]!.id);
  assert.equal(persisted.occurredOn, "2034-01-01", "planned edit must preserve economic date");
  assert.equal(persisted.plannedOn, "2034-02-20", "planned edit must update only planning");
  assert.equal(persisted.effectiveOn, "2034-03-01", "planned edit must preserve cash date");

  await updateTransactionGroupMemberForContext(context, postedGroup.id, postedMembers[0]!.id, {
    effectiveOn: "2034-03-25",
  });
  persisted = await getTransactionForContext(context, postedMembers[0]!.id);
  assert.equal(persisted.occurredOn, "2034-01-01", "cash edit must preserve economic date");
  assert.equal(persisted.plannedOn, "2034-02-20", "cash edit must preserve planning");
  assert.equal(persisted.effectiveOn, "2034-03-25", "cash edit must update only cash date");

  await updateTransactionGroupMemberForContext(context, postedGroup.id, postedMembers[1]!.id, {
    date: "2034-03-26",
  });
  const legacyDateEdited = await getTransactionForContext(context, postedMembers[1]!.id);
  assert.equal(legacyDateEdited.occurredOn, "2034-01-02");
  assert.equal(legacyDateEdited.plannedOn, "2034-02-02");
  assert.equal(
    legacyDateEdited.effectiveOn,
    "2034-03-26",
    "legacy date must map to effectiveOn for realized members",
  );

  const report = await buildCategoryEvolutionReportForSourceContext(
    context,
    parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "monthly", start: "2034-01", periods: "3" }),
    ),
    { kind: "account", id: account.id },
  );
  const brl = report.currencyBlocks.find((block) => block.currency === "BRL");
  assert.ok(brl);
  assert.deepEqual(
    brl.expense.cells.map((cell) => cell.amountMinor),
    [6000, 0, 0],
    "group temporal edits must keep realized reporting in the original occurredOn period",
  );

  const plannedMembers = await Promise.all(
    [4000, 5000].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "planned",
        amountMinor,
        occurredOn: `2034-04-0${index + 1}`,
        plannedOn: `2034-05-0${index + 1}`,
        effectiveOn: null,
        description: `Grupo temporal previsto ${suffix}-${index + 1}`,
      }),
    ),
  );
  const plannedGroup = await createTransactionGroupForContext(context, {
    memberIds: plannedMembers.map((member) => member.id),
    description: `Grupo temporal previsto ${suffix}`,
    displayOn: "2034-05-02",
  });
  await updateTransactionGroupMemberForContext(context, plannedGroup.id, plannedMembers[0]!.id, {
    date: "2034-05-20",
  });
  const plannedPersisted = await getTransactionForContext(context, plannedMembers[0]!.id);
  assert.equal(plannedPersisted.occurredOn, "2034-04-01");
  assert.equal(
    plannedPersisted.plannedOn,
    "2034-05-20",
    "legacy date must map to plannedOn for planned members",
  );
  assert.equal(plannedPersisted.effectiveOn, undefined);
  assert.equal((await getTransactionGroupForContext(context, plannedGroup.id)).status, "planned");
}
