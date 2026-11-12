import assert from "node:assert/strict";

import {
  generateFinancialInsights,
  type FinancialInsight,
  type InsightTransaction,
} from "./index.js";

const organizationId = "org-insights-boundaries";
const financialProfileId = "profile-insights-boundaries";
const currentPeriod = { startOn: "2026-06-01", endOn: "2026-06-30" };
const previousPeriod = { startOn: "2026-05-01", endOn: "2026-05-31" };

increaseThresholdBoundaryIsExact();
subscriptionToleranceBoundaryIsExact();
budgetUsesFullOverlappingPeriod();
merchantIncreaseDetectorHasPositiveControl();

function increaseThresholdBoundaryIsExact(): void {
  const exact = generateFinancialInsights(
    input([
      tx("previous-a", "2026-05-05", 5000, "market", "market-a"),
      tx("previous-b", "2026-05-20", 5000, "market", "market-b"),
      tx("current-a", "2026-06-05", 6250, "market", "market-a"),
      tx("current-b", "2026-06-20", 6250, "market", "market-b"),
    ]),
  );
  const exactInsight = findInsight(exact, "category_spending_increase");
  assert.equal(exactInsight.evidence.percentChange, 25);

  const below = generateFinancialInsights(
    input([
      tx("previous-a", "2026-05-05", 5000, "market", "market-a"),
      tx("previous-b", "2026-05-20", 5000, "market", "market-b"),
      tx("current-a", "2026-06-05", 6200, "market", "market-a"),
      tx("current-b", "2026-06-20", 6200, "market", "market-b"),
    ]),
  );
  assert.equal(
    below.some((item) => item.kind === "category_spending_increase"),
    false,
    "24% must remain below the configured 25% increase threshold",
  );

  const roundsUpButIsStillBelow = generateFinancialInsights(
    input([
      tx("previous-rounded-a", "2026-05-05", 10000, "market", "market-a"),
      tx("previous-rounded-b", "2026-05-20", 10000, "market", "market-b"),
      tx("current-rounded-a", "2026-06-05", 12499, "market", "market-a"),
      tx("current-rounded-b", "2026-06-20", 12500, "market", "market-b"),
    ]),
  );
  assert.equal(
    roundsUpButIsStillBelow.some((item) => item.kind === "category_spending_increase"),
    false,
    "24.995% must not be rounded up before the 25% threshold decision",
  );
}

function subscriptionToleranceBoundaryIsExact(): void {
  const exact = generateFinancialInsights(
    input([
      tx("subscription-apr", "2026-04-05", 8000, "software", "streaming-demo"),
      tx("subscription-may", "2026-05-05", 10000, "software", "streaming-demo"),
      tx("subscription-jun", "2026-06-05", 12000, "software", "streaming-demo"),
    ]),
  );
  const exactInsight = findInsight(exact, "probable_subscription");
  assert.equal(exactInsight.evidence.percentChange, 20);

  const above = generateFinancialInsights(
    input([
      tx("subscription-apr", "2026-04-05", 7900, "software", "streaming-demo"),
      tx("subscription-may", "2026-05-05", 10000, "software", "streaming-demo"),
      tx("subscription-jun", "2026-06-05", 12100, "software", "streaming-demo"),
    ]),
  );
  assert.equal(
    above.some((item) => item.kind === "probable_subscription"),
    false,
    "21% maximum deviation must remain above the configured 20% recurrence tolerance",
  );

  const roundsDownButIsStillAbove = generateFinancialInsights(
    input([
      tx("subscription-rounded-apr", "2026-04-05", 7990, "software", "streaming-rounded"),
      tx("subscription-rounded-may", "2026-05-05", 10000, "software", "streaming-rounded"),
      tx("subscription-rounded-jun", "2026-06-05", 12010, "software", "streaming-rounded"),
    ]),
  );
  assert.equal(
    roundsDownButIsStillAbove.some((item) => item.kind === "probable_subscription"),
    false,
    "20.1% maximum deviation must not be rounded down before the 20% tolerance decision",
  );
}

function budgetUsesFullOverlappingPeriod(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod: { startOn: "2026-08-01", endOn: "2026-08-12" },
    previousPeriod: { startOn: "2026-07-01", endOn: "2026-07-12" },
    currency: "BRL",
    budgets: [
      {
        id: "budget-cross-month",
        organizationId,
        financialProfileId,
        categoryId: "market",
        plannedAmountMinor: 100000,
        currency: "BRL",
        periodStartOn: "2026-07-15",
        periodEndOn: "2026-08-15",
      },
    ],
    transactions: [
      tx("budget-july", "2026-07-20", 80000, "market", "market-july"),
      tx("budget-august", "2026-08-10", 40000, "market", "market-august"),
    ],
  });

  const budget = findInsight(insights, "budget_exceeded");
  assert.equal(budget.evidence.currentAmountMinor, 120000);
  assert.equal(budget.evidence.previousAmountMinor, 100000);
  assert.equal(budget.evidence.deltaAmountMinor, 20000);
  assert.equal(budget.evidence.count, 2);
  assert.equal(budget.evidence.periodStartOn, "2026-07-15");
  assert.equal(budget.evidence.periodEndOn, "2026-08-15");
}

function merchantIncreaseDetectorHasPositiveControl(): void {
  const insights = generateFinancialInsights(
    input([
      tx("previous-a", "2026-05-05", 5000, "market-a", "merchant-chain"),
      tx("previous-b", "2026-05-20", 5000, "market-b", "merchant-chain"),
      tx("current-a", "2026-06-05", 8000, "market-a", "merchant-chain"),
      tx("current-b", "2026-06-20", 8000, "market-b", "merchant-chain"),
    ]),
  );

  const merchant = findInsight(insights, "merchant_spending_increase");
  assert.equal(merchant.filters.merchantKey, "merchant-chain");
  assert.equal(merchant.evidence.currentAmountMinor, 16000);
  assert.equal(merchant.evidence.previousAmountMinor, 10000);
  assert.equal(merchant.evidence.percentChange, 60);
  assert.equal(
    insights.some((item) => item.kind === "category_spending_increase"),
    false,
    "the positive merchant control must not depend on a category-level sample",
  );
}

function input(transactions: readonly InsightTransaction[]) {
  return {
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions,
  } as const;
}

function findInsight(
  insights: readonly FinancialInsight[],
  kind: FinancialInsight["kind"],
): FinancialInsight {
  const insight = insights.find((item) => item.kind === kind);
  assert.ok(insight, `Expected ${kind} insight.`);
  return insight;
}

function tx(
  id: string,
  occurredOn: string,
  amountMinor: number,
  categoryId: string,
  merchantKey: string,
): InsightTransaction {
  return {
    id,
    organizationId,
    financialProfileId,
    kind: "expense",
    status: "posted",
    amountMinor,
    currency: "BRL",
    occurredOn,
    categoryId,
    merchantKey,
  };
}
