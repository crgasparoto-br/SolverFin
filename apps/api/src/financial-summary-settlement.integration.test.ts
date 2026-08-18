import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import { closeInvoiceForContext } from "./repositories/card-invoice-contracts.js";
import {
  createCardForContext,
  payInvoiceForContext,
  registerCardPurchaseForContext,
} from "./repositories/cards.js";
import { buildFinancialSummary } from "./repositories/dashboard.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const JUNE_REFERENCE = new Date("2035-06-30T12:00:00.000Z");
const FORECAST_REFERENCE = new Date("2035-07-10T12:00:00.000Z");
const JULY_REFERENCE = new Date("2035-07-12T12:00:00.000Z");

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
  const juneBaseline = await buildFinancialSummary(CONTEXT, JUNE_REFERENCE);
  const forecastBaseline = await buildFinancialSummary(CONTEXT, FORECAST_REFERENCE);
  const julyBaseline = await buildFinancialSummary(CONTEXT, JULY_REFERENCE);

  const paymentAccount = await createAccountForContext(CONTEXT, {
    name: `Cash source issue 594 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 20_000,
  });
  const transferTarget = await createAccountForContext(CONTEXT, {
    name: `Cash target issue 594 ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 5_000,
  });

  await assertSummaryDelta(juneBaseline, JUNE_REFERENCE, {
    availableBalanceMinor: 25_000,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 0,
  });

  await createTransactionForContext(CONTEXT, {
    accountId: paymentAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 8_000,
    occurredOn: "2035-06-10",
    plannedOn: "2035-06-10",
    effectiveOn: "2035-06-10",
    description: `Income issue 594 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: paymentAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 3_000,
    occurredOn: "2035-06-11",
    plannedOn: "2035-06-11",
    effectiveOn: "2035-06-11",
    description: `Account expense issue 594 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: paymentAccount.id,
    destinationAccountId: transferTarget.id,
    kind: "transfer",
    status: "posted",
    amountMinor: 4_000,
    occurredOn: "2035-06-12",
    plannedOn: "2035-06-12",
    effectiveOn: "2035-06-12",
    description: `Transfer issue 594 ${suffix}`,
  });

  await assertSummaryDelta(juneBaseline, JUNE_REFERENCE, {
    availableBalanceMinor: 30_000,
    incomeMinor: 8_000,
    expensesMinor: 3_000,
    plannedCommitmentsMinor: 0,
  });

  await createTransactionForContext(CONTEXT, {
    accountId: paymentAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 2_000,
    occurredOn: "2035-06-20",
    plannedOn: "2035-06-25",
    effectiveOn: "2035-07-02",
    description: `Economic before cash issue 594 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: paymentAccount.id,
    kind: "expense",
    status: "planned",
    amountMinor: 1_500,
    occurredOn: "2035-06-21",
    plannedOn: "2035-07-03",
    effectiveOn: null,
    description: `Planned expense issue 594 ${suffix}`,
  });

  await assertSummaryDelta(juneBaseline, JUNE_REFERENCE, {
    availableBalanceMinor: 30_000,
    incomeMinor: 8_000,
    expensesMinor: 5_000,
    plannedCommitmentsMinor: 0,
  });

  const card = await createCardForContext(CONTEXT, {
    name: `Credit card issue 594 ${suffix}`,
    closingDay: 20,
    dueDay: 10,
    paymentAccountId: paymentAccount.id,
  });
  const purchase = await registerCardPurchaseForContext(CONTEXT, card.id, {
    occurredOn: "2035-06-15",
    amountMinor: 7_000,
    description: `Card purchase issue 594 ${suffix}`,
  });

  assert.equal(purchase.transaction.effectiveOn, undefined);
  assert.equal(purchase.forecastTransactions.length, 1);

  await assertSummaryDelta(juneBaseline, JUNE_REFERENCE, {
    availableBalanceMinor: 30_000,
    incomeMinor: 8_000,
    expensesMinor: 12_000,
    plannedCommitmentsMinor: 0,
  });

  const forecast = purchase.forecastTransactions[0];
  assert.ok(forecast);
  assert.equal(forecast.status, "planned");
  assert.equal(forecast.effectiveOn, undefined);
  assert.equal(forecast.plannedOn, "2035-07-10");

  await assertSummaryDelta(forecastBaseline, FORECAST_REFERENCE, {
    availableBalanceMinor: 28_000,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 8_500,
  });

  await closeInvoiceForContext(CONTEXT, purchase.invoice.id);
  const payment = await payInvoiceForContext(CONTEXT, purchase.invoice.id, paymentAccount.id, {
    paidOn: "2035-07-12",
    amountMinor: purchase.invoice.totalAmountMinor,
  });

  assert.equal(payment.invoice.paymentTransactionId, payment.transaction.id);
  assert.equal(payment.transaction.effectiveOn, "2035-07-12");

  await assertSummaryDelta(julyBaseline, JULY_REFERENCE, {
    availableBalanceMinor: 21_000,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 1_500,
  });

  await createTransactionForContext(CONTEXT, {
    accountId: paymentAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: payment.transaction.amountMinor,
    occurredOn: "2035-07-13",
    plannedOn: "2035-07-13",
    effectiveOn: "2035-07-13",
    description: payment.transaction.description,
  });

  const julyAfterLookalike = new Date("2035-07-13T12:00:00.000Z");
  await assertSummaryDelta(julyBaseline, julyAfterLookalike, {
    availableBalanceMinor: 14_000,
    incomeMinor: 0,
    expensesMinor: 7_000,
    plannedCommitmentsMinor: 1_500,
  });
}

interface SummaryDelta {
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  plannedCommitmentsMinor: number;
}

async function assertSummaryDelta(
  baseline: Awaited<ReturnType<typeof buildFinancialSummary>>,
  reference: Date,
  expected: SummaryDelta,
): Promise<void> {
  const summary = await buildFinancialSummary(CONTEXT, reference);
  assert.equal(summary.generatedAt, reference.toISOString());

  assert.deepEqual(
    {
      availableBalanceMinor: summary.availableBalanceMinor - baseline.availableBalanceMinor,
      incomeMinor: summary.incomeMinor - baseline.incomeMinor,
      expensesMinor: summary.expensesMinor - baseline.expensesMinor,
      plannedCommitmentsMinor:
        summary.plannedCommitmentsMinor - baseline.plannedCommitmentsMinor,
    },
    expected,
  );
}
