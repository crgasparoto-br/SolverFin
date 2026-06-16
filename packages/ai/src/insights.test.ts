import assert from "node:assert/strict";

import { generateFinancialInsights, type InsightTransaction } from "./index.js";

const currentPeriod = { startOn: "2026-06-01", endOn: "2026-06-30" };
const previousPeriod = { startOn: "2026-05-01", endOn: "2026-05-31" };

spendingIncreaseHasNumericEvidence();
probableSubscriptionUsesRepeatedMerchant();
insufficientDataDoesNotInventInsight();
tenantIsolationFiltersForeignTransactions();
budgetAndNegativeBalanceInsightsAreGenerated();

function spendingIncreaseHasNumericEvidence(): void {
  const insights = generateFinancialInsights({
    organizationId: "org-insights-a",
    financialProfileId: "profile-insights-a",
    currentPeriod,
    previousPeriod,
    transactions: [
      tx("may-market", "2026-05-10", 10000, "market"),
      tx("jun-market-a", "2026-06-10", 9000, "market"),
      tx("jun-market-b", "2026-06-20", 7000, "market"),
    ],
  });

  const insight = insights.find((item) => item.kind === "category_spending_increase");

  assert.equal(insight?.evidence.label, "market");
  assert.equal(insight?.evidence.currentAmountMinor, 16000);
  assert.equal(insight?.evidence.previousAmountMinor, 10000);
  assert.equal(insight?.evidence.percentChange, 60);
  assert.equal(insight?.sources.includes("jun-market-a"), true);
}

function probableSubscriptionUsesRepeatedMerchant(): void {
  const insights = generateFinancialInsights({
    organizationId: "org-insights-a",
    financialProfileId: "profile-insights-a",
    currentPeriod,
    previousPeriod,
    transactions: [
      tx("sub-apr", "2026-04-05", 3990, "software", "streaming-demo"),
      tx("sub-may", "2026-05-05", 3990, "software", "streaming-demo"),
      tx("sub-jun", "2026-06-05", 3990, "software", "streaming-demo"),
    ],
  });

  const insight = insights.find((item) => item.kind === "probable_subscription");

  assert.equal(insight?.confidence, "medium");
  assert.equal(insight?.evidence.label, "streaming-demo");
  assert.equal(insight?.evidence.count, 3);
}

function insufficientDataDoesNotInventInsight(): void {
  const insights = generateFinancialInsights({
    organizationId: "org-insights-a",
    financialProfileId: "profile-insights-a",
    currentPeriod,
    previousPeriod,
    transactions: [],
  });

  assert.equal(insights.length, 1);
  assert.equal(insights[0]?.kind, "insufficient_data");
  assert.equal(insights[0]?.confidence, "low");
}

function tenantIsolationFiltersForeignTransactions(): void {
  const insights = generateFinancialInsights({
    organizationId: "org-insights-a",
    financialProfileId: "profile-insights-a",
    currentPeriod,
    previousPeriod,
    transactions: [
      tx(
        "foreign-current",
        "2026-06-10",
        50000,
        "market",
        "mercado-demo",
        "org-other",
      ),
      tx(
        "foreign-previous",
        "2026-05-10",
        1000,
        "market",
        "mercado-demo",
        "org-other",
      ),
    ],
  });

  assert.equal(insights.length, 1);
  assert.equal(insights[0]?.kind, "insufficient_data");
}

function budgetAndNegativeBalanceInsightsAreGenerated(): void {
  const insights = generateFinancialInsights({
    organizationId: "org-insights-a",
    financialProfileId: "profile-insights-a",
    currentPeriod,
    previousPeriod,
    projectedBalanceMinor: -2500,
    budgets: [
      {
        organizationId: "org-insights-a",
        financialProfileId: "profile-insights-a",
        categoryId: "market",
        plannedAmountMinor: 12000,
        periodStartOn: "2026-06-01",
        periodEndOn: "2026-06-30",
      },
    ],
    transactions: [tx("jun-market", "2026-06-10", 18000, "market")],
  });

  assert.equal(insights.some((item) => item.kind === "negative_balance_risk"), true);
  assert.equal(insights.some((item) => item.kind === "budget_exceeded"), true);
  assert.equal(insights.some((item) => item.kind === "monthly_summary"), true);
}

function tx(
  id: string,
  occurredOn: string,
  amountMinor: number,
  categoryId: string,
  merchantKey = "merchant-demo",
  organizationId = "org-insights-a",
): InsightTransaction {
  return {
    id,
    organizationId,
    financialProfileId: "profile-insights-a",
    kind: "expense",
    status: "posted",
    amountMinor,
    occurredOn,
    categoryId,
    merchantKey,
  };
}
