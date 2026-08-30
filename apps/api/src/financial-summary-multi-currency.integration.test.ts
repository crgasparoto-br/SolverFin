import assert from "node:assert/strict";

import type { TenantContext } from "@solverfin/domain";

import { closePool } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  buildFinancialSummary,
  type DashboardCurrencyBlock,
  type DashboardSummary,
} from "./repositories/dashboard.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};
const SIBLING_CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "mei",
  userId: "11111111-1111-4111-8111-111111111111",
};
const REFERENCE = new Date("2037-08-20T12:00:00.000Z");

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

  const baseline = await buildFinancialSummary(CONTEXT, REFERENCE);
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const brlAccount = await createAccountForContext(CONTEXT, {
    name: `Summary BRL issue 608 ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 10_000,
  });
  const brlSecondaryAccount = await createAccountForContext(CONTEXT, {
    name: `Summary BRL secondary issue 608 ${suffix}`,
    kind: "checking",
    currency: "BRL",
    openingBalanceMinor: 4_000,
  });
  const usdAccount = await createAccountForContext(CONTEXT, {
    name: `Summary USD issue 608 ${suffix}`,
    kind: "checking",
    currency: "USD",
    openingBalanceMinor: 20_000,
  });
  const siblingAccount = await createAccountForContext(SIBLING_CONTEXT, {
    name: `Summary sibling EUR issue 608 ${suffix}`,
    kind: "checking",
    currency: "EUR",
    openingBalanceMinor: 90_000_000,
  });

  await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 1_100,
    currency: "BRL",
    occurredOn: "2037-08-05",
    plannedOn: "2037-08-05",
    effectiveOn: "2037-08-05",
    description: `BRL income issue 608 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: brlSecondaryAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 700,
    currency: "BRL",
    occurredOn: "2037-08-05",
    plannedOn: "2037-08-05",
    effectiveOn: "2037-08-05",
    description: `BRL secondary income issue 608 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 300,
    currency: "BRL",
    occurredOn: "2037-08-06",
    plannedOn: "2037-08-06",
    effectiveOn: "2037-08-06",
    description: `BRL expense issue 608 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: brlAccount.id,
    kind: "expense",
    status: "planned",
    amountMinor: 500,
    currency: "BRL",
    occurredOn: "2037-08-07",
    plannedOn: "2037-08-25",
    effectiveOn: null,
    description: `BRL planned issue 608 ${suffix}`,
  });

  await createTransactionForContext(CONTEXT, {
    accountId: usdAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 2_200,
    currency: "USD",
    occurredOn: "2037-08-08",
    plannedOn: "2037-08-08",
    effectiveOn: "2037-08-08",
    description: `USD income issue 608 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: usdAccount.id,
    kind: "expense",
    status: "posted",
    amountMinor: 400,
    currency: "USD",
    occurredOn: "2037-08-09",
    plannedOn: "2037-08-09",
    effectiveOn: "2037-08-09",
    description: `USD expense issue 608 ${suffix}`,
  });
  await createTransactionForContext(CONTEXT, {
    accountId: usdAccount.id,
    kind: "expense",
    status: "planned",
    amountMinor: 700,
    currency: "USD",
    occurredOn: "2037-08-10",
    plannedOn: "2037-08-26",
    effectiveOn: null,
    description: `USD planned issue 608 ${suffix}`,
  });

  const siblingDescription = `Sibling profile income issue 608 ${suffix}`;
  await createTransactionForContext(SIBLING_CONTEXT, {
    accountId: siblingAccount.id,
    kind: "income",
    status: "posted",
    amountMinor: 80_000_000,
    currency: "EUR",
    occurredOn: "2037-08-19",
    plannedOn: "2037-08-19",
    effectiveOn: "2037-08-19",
    description: siblingDescription,
  });
  const siblingSummary = await buildFinancialSummary(SIBLING_CONTEXT, REFERENCE);
  assert.equal(
    siblingSummary.recentItems.some((item) => item.description === siblingDescription),
    true,
  );

  const summary = await buildFinancialSummary(CONTEXT, REFERENCE);
  const currencies = summary.currencyBlocks.map((block) => block.currency);
  assert.deepEqual(currencies, [...currencies].sort());

  assertBlockDelta(summary, baseline, "BRL", {
    availableBalanceMinor: 15_500,
    incomeMinor: 1_800,
    expensesMinor: 300,
    netVariationMinor: 1_500,
    plannedCommitmentsMinor: 500,
  });
  assertBlockDelta(summary, baseline, "USD", {
    availableBalanceMinor: 21_800,
    incomeMinor: 2_200,
    expensesMinor: 400,
    netVariationMinor: 1_800,
    plannedCommitmentsMinor: 700,
  });
  assert.deepEqual(blockFor(summary, "EUR"), blockFor(baseline, "EUR"));
  assert.equal(
    summary.recentItems.some((item) => item.description === siblingDescription),
    false,
  );

  const brlEvidenceAccountIds = blockFor(summary, "BRL").accounts.map((account) => account.id);
  assert.equal(brlEvidenceAccountIds.includes(brlAccount.id), true);
  assert.equal(brlEvidenceAccountIds.includes(brlSecondaryAccount.id), true);
  assert.equal(brlEvidenceAccountIds.includes(siblingAccount.id), false);

  assert.equal("currency" in summary, false);
  assert.equal("availableBalanceMinor" in summary, false);
  assert.equal("incomeMinor" in summary, false);
  assert.equal("expensesMinor" in summary, false);
  assert.equal("netVariationMinor" in summary, false);
  assert.equal("plannedCommitmentsMinor" in summary, false);

  const issueItems = summary.recentItems.filter((item) =>
    item.description.includes(`issue 608 ${suffix}`),
  );
  assert.equal(
    issueItems.some((item) => item.currency === "BRL"),
    true,
  );
  assert.equal(
    issueItems.some((item) => item.currency === "USD"),
    true,
  );
}

interface ExpectedBlockDelta {
  availableBalanceMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  netVariationMinor: number;
  plannedCommitmentsMinor: number;
}

function assertBlockDelta(
  summary: DashboardSummary,
  baseline: DashboardSummary,
  currency: string,
  expected: ExpectedBlockDelta,
): void {
  const current = blockFor(summary, currency);
  const before = blockFor(baseline, currency);
  assert.deepEqual(
    {
      availableBalanceMinor: current.availableBalanceMinor - before.availableBalanceMinor,
      incomeMinor: current.incomeMinor - before.incomeMinor,
      expensesMinor: current.expensesMinor - before.expensesMinor,
      netVariationMinor: (current.netVariationMinor ?? 0) - (before.netVariationMinor ?? 0),
      plannedCommitmentsMinor: current.plannedCommitmentsMinor - before.plannedCommitmentsMinor,
    },
    expected,
  );
}

function blockFor(summary: DashboardSummary, currency: string): DashboardCurrencyBlock {
  const found = summary.currencyBlocks.find((block) => block.currency === currency);
  if (found !== undefined) {
    return found;
  }

  return {
    currency,
    availableBalanceMinor: 0,
    incomeMinor: 0,
    expensesMinor: 0,
    plannedCommitmentsMinor: 0,
    accounts: [],
  };
}