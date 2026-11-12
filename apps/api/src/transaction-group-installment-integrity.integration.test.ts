import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { updateTransactionGroupMemberForContext } from "./repositories/transaction-group-actions.js";
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

  const account = await createAccountForContext(context, {
    name: `Conta integridade parcela ${Date.now()}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const members = await Promise.all(
    [1200, 2300].map((amountMinor, index) =>
      createTransactionForContext(context, {
        accountId: account.id,
        kind: "expense",
        status: "posted",
        amountMinor,
        occurredOn: `2028-05-0${index + 1}`,
        effectiveOn: `2028-05-0${index + 1}`,
        description: `Membro com parcela ${index + 1}`,
      }),
    ),
  );

  const installmentId = randomUUID();
  await query(
    `insert into "Installment"
      ("id","organizationId","financialProfileId","status","sequenceNumber","totalInstallments",
       "dueOn","amountMinor","currency","createdByUserId","updatedByUserId","createdAt","updatedAt")
     values ($1,$2,$3,'POSTED',1,2,$4,$5,'BRL',$6,$6,now(),now())`,
    [
      installmentId,
      context.organizationId,
      context.financialProfileId,
      "2028-05-01",
      1200,
      context.userId,
    ],
  );
  await query(
    `update "Transaction" set "installmentId"=$1
      where "id"=$2 and "organizationId"=$3 and "financialProfileId"=$4`,
    [installmentId, members[0]!.id, context.organizationId, context.financialProfileId],
  );

  const group = await createTransactionGroupForContext(context, {
    memberIds: members.map((member) => member.id),
    description: "Grupo para integridade de parcela",
    displayOn: "2028-05-02",
  });

  await query(`drop trigger if exists "Issue528_installment_missing" on "Installment"`);
  await query(`drop function if exists issue528_installment_missing()`);
  await query(
    `create function issue528_installment_missing() returns trigger as $$
       begin
         if old."id" = '${installmentId}'::uuid then
           return null;
         end if;
         return new;
       end;
     $$ language plpgsql`,
  );
  await query(
    `create trigger "Issue528_installment_missing"
       before update on "Installment"
       for each row execute function issue528_installment_missing()`,
  );

  try {
    await assert.rejects(
      () =>
        updateTransactionGroupMemberForContext(context, group.id, members[0]!.id, {
          amountMinor: 1999,
          date: "2028-05-10",
          description: "Alteração que não pode ficar parcial",
        }),
      hasCode("TRANSACTION_INSTALLMENT_NOT_FOUND"),
    );
  } finally {
    await query(`drop trigger if exists "Issue528_installment_missing" on "Installment"`);
    await query(`drop function if exists issue528_installment_missing()`);
  }

  const persistedGroup = await getTransactionGroupForContext(context, group.id);
  const persistedMember = persistedGroup.members.find((member) => member.id === members[0]!.id);
  assert.equal(persistedGroup.totalAmountMinor, 3500);
  assert.equal(persistedMember?.amountMinor, 1200);
  assert.equal(persistedMember?.description, "Membro com parcela 1");
  assert.equal(persistedMember?.effectiveOn, "2028-05-01");

  const installments = await query<{ dueOn: Date; amountMinor: number }>(
    `select "dueOn","amountMinor" from "Installment" where "id"=$1`,
    [installmentId],
  );
  assert.equal(installments[0]?.dueOn.toISOString().slice(0, 10), "2028-05-01");
  assert.equal(installments[0]?.amountMinor, 1200);
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error) => {
    assert.equal((error as { code?: string }).code, expected);
    return true;
  };
}
