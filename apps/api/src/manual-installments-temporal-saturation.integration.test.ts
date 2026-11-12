import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { createManualInstallmentsForContext } from "./repositories/manual-installments.js";

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
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the integration test.");

  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const account = await createAccountForContext(context, {
    name: `Conta parcelas temporais ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });

  const planned = await createManualInstallmentsForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "planned",
    description: `Parcela planejada ${suffix}`,
    plannedOn: "2035-01-31",
    effectiveOn: "2035-01-20",
    amountMinor: 1000,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });

  assert.deepEqual(
    planned.installments.map((item) => ({
      dueOn: item.dueOn,
      occurredOn: item.transaction.occurredOn,
      plannedOn: item.transaction.plannedOn,
      effectiveOn: item.transaction.effectiveOn,
    })),
    [
      {
        dueOn: "2035-01-31",
        occurredOn: "2035-01-31",
        plannedOn: "2035-01-31",
        effectiveOn: undefined,
      },
      {
        dueOn: "2035-02-28",
        occurredOn: "2035-02-28",
        plannedOn: "2035-02-28",
        effectiveOn: undefined,
      },
    ],
    "planned installments must keep due/planned dates and must not fabricate cash effect",
  );

  const posted = await createManualInstallmentsForContext(context, {
    accountId: account.id,
    kind: "expense",
    status: "posted",
    description: `Parcela realizada ${suffix}`,
    plannedOn: "2035-03-15",
    effectiveOn: "2035-03-20",
    amountMinor: 2000,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
  });

  assert.deepEqual(
    posted.installments.map((item) => ({
      occurredOn: item.transaction.occurredOn,
      plannedOn: item.transaction.plannedOn,
      effectiveOn: item.transaction.effectiveOn,
    })),
    [
      {
        occurredOn: "2035-03-20",
        plannedOn: "2035-03-15",
        effectiveOn: "2035-03-20",
      },
      {
        occurredOn: "2035-04-20",
        plannedOn: "2035-04-15",
        effectiveOn: "2035-04-20",
      },
    ],
    "specialized posted installments must preserve planning separately from their derived effective occurrence",
  );

  const reconciled = await createManualInstallmentsForContext(context, {
    accountId: account.id,
    kind: "income",
    status: "reconciled",
    description: `Parcela conciliada ${suffix}`,
    plannedOn: "2035-05-10",
    amountMinor: 3000,
    amountMode: "per_installment",
    totalInstallments: 2,
    initialSequenceNumber: 1,
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
  });

  for (const item of reconciled.installments) {
    assert.equal(item.transaction.effectiveOn, item.transaction.plannedOn);
    assert.equal(item.transaction.occurredOn, item.transaction.plannedOn);
  }
}
