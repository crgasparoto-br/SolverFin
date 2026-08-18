import assert from "node:assert/strict";

import type { TenantContext, Transaction } from "@solverfin/domain";

import type { QueryExecutor } from "./db.js";
import { reconcileImportedTransactionForContext } from "./import-reconciliation-temporal.js";

const context: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await testPlannedReconciliationUsesImportedEffectiveDate();
  await testPostedReconciliationConfirmsImportedEffectiveDate();
  await testAlreadyReconciledTransactionIsIdempotent();
}

async function testPlannedReconciliationUsesImportedEffectiveDate(): Promise<void> {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  const executeQuery = captureQueries(calls);
  const current = transactionFixture({
    status: "planned",
    occurredOn: "2026-06-10",
    plannedOn: "2026-09-01",
  });

  const reconciled = await reconcileImportedTransactionForContext(
    context,
    current,
    "2026-08-11",
    "2026-08-13T12:30:00.000Z",
    executeQuery,
  );

  assert.equal(reconciled.status, "reconciled");
  assert.equal(reconciled.occurredOn, "2026-06-10", "economic date must be preserved");
  assert.equal(reconciled.plannedOn, "2026-09-01", "planned date must be preserved");
  assert.equal(reconciled.effectiveOn, "2026-08-11", "imported cash date must be recorded");
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.text ?? "", /"effectiveOn" = \$4/);
  assert.deepEqual(calls[0]?.params, [
    current.id,
    context.organizationId,
    context.financialProfileId,
    "2026-08-11",
    "2026-08-13T12:30:00.000Z",
    context.userId,
  ]);
}

async function testPostedReconciliationConfirmsImportedEffectiveDate(): Promise<void> {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  const current = transactionFixture({
    status: "posted",
    occurredOn: "2026-06-12",
    plannedOn: "2026-07-01",
    effectiveOn: "2026-08-09",
  });

  const reconciled = await reconcileImportedTransactionForContext(
    context,
    current,
    "2026-08-12",
    "2026-08-13T09:00:00.000Z",
    captureQueries(calls),
  );

  assert.equal(reconciled.occurredOn, "2026-06-12");
  assert.equal(reconciled.plannedOn, "2026-07-01");
  assert.equal(reconciled.effectiveOn, "2026-08-12");
  assert.equal(calls.length, 1);
}

async function testAlreadyReconciledTransactionIsIdempotent(): Promise<void> {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  const current = transactionFixture({
    status: "reconciled",
    occurredOn: "2026-06-14",
    plannedOn: "2026-07-03",
    effectiveOn: "2026-08-10",
  });

  const reconciled = await reconcileImportedTransactionForContext(
    context,
    current,
    "2026-08-13",
    "2026-08-13T10:00:00.000Z",
    captureQueries(calls),
  );

  assert.equal(reconciled, current);
  assert.equal(reconciled.effectiveOn, "2026-08-10");
  assert.equal(calls.length, 0);
}

function captureQueries(calls: Array<{ text: string; params: readonly unknown[] }>): QueryExecutor {
  return async <TRow>(text: string, params: readonly unknown[] = []): Promise<TRow[]> => {
    calls.push({ text, params });
    return [];
  };
}

function transactionFixture(
  temporal: Pick<Transaction, "status" | "occurredOn" | "plannedOn"> &
    Partial<Pick<Transaction, "effectiveOn">>,
): Transaction {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organizationId: context.organizationId,
    financialProfileId: context.financialProfileId,
    kind: "expense",
    status: temporal.status,
    source: "manual",
    amountMinor: 3200,
    currency: "BRL",
    occurredOn: temporal.occurredOn,
    plannedOn: temporal.plannedOn,
    ...(temporal.effectiveOn === undefined ? {} : { effectiveOn: temporal.effectiveOn }),
    description: "Temporal reconciliation fixture",
    accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    createdAt: "2026-06-10T12:00:00.000Z",
    updatedAt: "2026-06-10T12:00:00.000Z",
  };
}
