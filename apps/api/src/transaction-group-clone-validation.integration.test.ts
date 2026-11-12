import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { createCategoryForContext } from "./repositories/categories.js";
import { cloneTransactionGroupForContext } from "./repositories/transaction-group-actions.js";
import {
  createTransactionGroupForContext,
  getTransactionGroupForContext,
} from "./repositories/transaction-groups.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const context: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

void main().finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL);
  const suffix = String(Date.now());
  const account = await createAccountForContext(context, {
    name: `Conta clone validado ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const category = await createCategoryForContext(context, {
    name: `Categoria clone validado ${suffix}`,
    kind: "expense",
  });
  const members = await Promise.all(
    [1100, 2200].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        categoryId: category.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2028-05-0${index + 1}`,
        effectiveOn: `2028-05-0${index + 1}`,
        description: `Clone em lote validado ${suffix} ${index + 1}`,
      }),
    ),
  );
  const group = await createTransactionGroupForContext(context, {
    memberIds: members.map((member) => member.id),
    description: `Grupo clone validado ${suffix}`,
    displayOn: "2028-05-02",
  });

  await query(
    `update "Category" set "status"='ARCHIVED', "updatedAt"=now()
      where "id"=$1 and "organizationId"=$2 and "financialProfileId"=$3`,
    [category.id, context.organizationId, context.financialProfileId],
  );

  await assert.rejects(
    () => cloneTransactionGroupForContext(context, group.id),
    hasCode("TRANSACTION_CATEGORY_ARCHIVED"),
  );

  const cloneRows = await query<{ count: number }>(
    `select count(*)::int as count from "Transaction"
      where "organizationId"=$1 and "financialProfileId"=$2
        and "description" like $3`,
    [
      context.organizationId,
      context.financialProfileId,
      `Cópia de Clone em lote validado ${suffix}%`,
    ],
  );
  assert.equal(cloneRows[0]?.count, 0, "group cloning must validate all members before inserting");

  const persistedGroup = await getTransactionGroupForContext(context, group.id);
  assert.equal(persistedGroup.members.length, 2);
  assert.equal(persistedGroup.totalAmountMinor, 3300);
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal((error as { code?: string }).code, expected);
    return true;
  };
}
