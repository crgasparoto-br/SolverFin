import assert from "node:assert/strict";

import {
  explainFinancialInsightWithProvider,
  generateFinancialInsights,
  type FinancialInsight,
  type FinancialInsightExplanationProvider,
  type InsightTransaction,
} from "./index.js";

const organizationId = "org-insights-a";
const financialProfileId = "profile-insights-a";
const currentPeriod = { startOn: "2026-06-01", endOn: "2026-06-30" };
const previousPeriod = { startOn: "2026-05-01", endOn: "2026-05-31" };

spendingIncreaseHasExactNumericEvidence();
oneOffExpenseDoesNotCreateIncreaseAnomaly();
probableSubscriptionRequiresConsecutiveStableMonths();
interruptedRecurrenceDoesNotTrigger();
unreviewedAndForeignCurrencyRowsAreExcluded();
budgetNegativeBalanceAndMonthlySummaryAreDeterministic();
insufficientDataDoesNotInventInsight();
void providerNarrativeIsAdvisoryOnly();

function spendingIncreaseHasExactNumericEvidence(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [
      tx("may-market-a", "2026-05-05", 5000, "market"),
      tx("may-market-b", "2026-05-20", 5000, "market"),
      tx("jun-market-a", "2026-06-10", 9000, "market"),
      tx("jun-market-b", "2026-06-20", 7000, "market"),
    ],
  });
  const insight = findInsight(insights, "category_spending_increase");
  assert.equal(insight.evidence.currentAmountMinor, 16000);
  assert.equal(insight.evidence.previousAmountMinor, 10000);
  assert.equal(insight.evidence.deltaAmountMinor, 6000);
  assert.equal(insight.evidence.percentChange, 60);
  assert.equal(insight.evidence.count, 2);
  assert.deepEqual(insight.filters, { currency: "BRL", categoryId: "market" });
  assert.equal(insight.comparison?.kind, "previous_period");
}

function oneOffExpenseDoesNotCreateIncreaseAnomaly(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [
      tx("may-market", "2026-05-10", 1000, "market"),
      tx("jun-market", "2026-06-10", 50000, "market"),
    ],
  });
  assert.equal(insights.some((item) => item.kind === "category_spending_increase"), false);
  assert.equal(insights.some((item) => item.kind === "merchant_spending_increase"), false);
}

function probableSubscriptionRequiresConsecutiveStableMonths(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [
      tx("sub-apr", "2026-04-05", 3990, "software", "streaming-demo"),
      tx("sub-may", "2026-05-05", 4090, "software", "streaming-demo"),
      tx("sub-jun", "2026-06-05", 3990, "software", "streaming-demo"),
    ],
  });
  const insight = findInsight(insights, "probable_subscription");
  assert.equal(insight.evidence.label, "streaming-demo");
  assert.equal(insight.evidence.count, 3);
  assert.equal(insight.filters.merchantKey, "streaming-demo");
}

function interruptedRecurrenceDoesNotTrigger(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [
      tx("sub-feb", "2026-02-05", 3990, "software", "streaming-demo"),
      tx("sub-apr", "2026-04-05", 3990, "software", "streaming-demo"),
      tx("sub-jun", "2026-06-05", 3990, "software", "streaming-demo"),
    ],
  });
  assert.equal(insights.some((item) => item.kind === "probable_subscription"), false);
}

function unreviewedAndForeignCurrencyRowsAreExcluded(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [
      tx("may-a", "2026-05-05", 5000, "market"),
      tx("may-b", "2026-05-20", 5000, "market"),
      tx("jun-a", "2026-06-05", 6000, "market"),
      tx("jun-b", "2026-06-20", 6000, "market"),
      tx("pending", "2026-06-21", 50000, "market", "merchant-demo", organizationId, "BRL", "suggested"),
      tx("usd", "2026-06-22", 90000, "market", "merchant-demo", organizationId, "USD"),
      tx("foreign", "2026-06-23", 90000, "market", "merchant-demo", "org-other", "BRL"),
    ],
  });
  const summary = findInsight(insights, "monthly_summary");
  assert.equal(summary.evidence.currentAmountMinor, 12000);
  assert.ok(summary.limitations.some((item) => item.includes("1 lancamento")));
  assert.ok(summary.limitations.some((item) => item.includes("BRL")));
}

function budgetNegativeBalanceAndMonthlySummaryAreDeterministic(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    projectedBalanceMinor: -2500,
    projectedBalanceSourceFingerprint: "sha256-projection",
    projectionPeriodEndOn: "2026-06-30",
    budgets: [
      {
        id: "budget-market",
        organizationId,
        financialProfileId,
        categoryId: "market",
        plannedAmountMinor: 12000,
        currency: "BRL",
        periodStartOn: "2026-06-01",
        periodEndOn: "2026-06-30",
      },
      {
        id: "budget-usd",
        organizationId,
        financialProfileId,
        categoryId: "market",
        plannedAmountMinor: 1,
        currency: "USD",
        periodStartOn: "2026-06-01",
        periodEndOn: "2026-06-30",
      },
    ],
    transactions: [
      tx("income", "2026-06-02", 30000, "salary", "employer", organizationId, "BRL", "posted", "income"),
      tx("expense-a", "2026-06-10", 9000, "market"),
      tx("expense-b", "2026-06-20", 9000, "market"),
      tx("previous-a", "2026-05-10", 6000, "market"),
      tx("previous-b", "2026-05-20", 6000, "market"),
    ],
  });
  const negative = findInsight(insights, "negative_balance_risk");
  const budget = findInsight(insights, "budget_exceeded");
  const summary = findInsight(insights, "monthly_summary");
  assert.equal(negative.evidence.currentAmountMinor, -2500);
  assert.equal(negative.evidence.periodEndOn, "2026-06-30");
  assert.equal(budget.evidence.currentAmountMinor, 18000);
  assert.equal(budget.evidence.previousAmountMinor, 12000);
  assert.equal(budget.evidence.deltaAmountMinor, 6000);
  assert.equal(summary.evidence.currentAmountMinor, 18000);
  assert.equal(summary.evidence.previousAmountMinor, 12000);
}

function insufficientDataDoesNotInventInsight(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [],
  });
  assert.equal(insights.length, 1);
  assert.equal(insights[0]?.kind, "insufficient_data");
  assert.equal(insights[0]?.confidence, "low");
}

async function providerNarrativeIsAdvisoryOnly(): Promise<void> {
  const deterministic = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "BRL",
    transactions: [tx("expense", "2026-06-10", 18000, "market")],
  }).find((item) => item.kind === "monthly_summary");
  assert.ok(deterministic);

  const validProvider: FinancialInsightExplanationProvider = {
    async explain() {
      return "As despesas merecem atenção no período comparado.";
    },
  };
  const invalidProvider: FinancialInsightExplanationProvider = {
    async explain() {
      return "O total foi 999 e deve ser substituído.";
    },
  };
  const unavailableProvider: FinancialInsightExplanationProvider = {
    async explain() {
      throw new Error("provider unavailable");
    },
  };

  assert.equal(
    await explainFinancialInsightWithProvider(deterministic, validProvider),
    "As despesas merecem atenção no período comparado.",
  );
  assert.equal(
    await explainFinancialInsightWithProvider(deterministic, invalidProvider),
    deterministic.explanation,
  );
  assert.equal(
    await explainFinancialInsightWithProvider(deterministic, unavailableProvider),
    deterministic.explanation,
  );
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
  merchantKey = "merchant-demo",
  org = organizationId,
  currency = "BRL",
  status: InsightTransaction["status"] = "posted",
  kind: InsightTransaction["kind"] = "expense",
): InsightTransaction {
  return {
    id,
    organizationId: org,
    financialProfileId,
    kind,
    status,
    amountMinor,
    currency,
    occurredOn,
    categoryId,
    merchantKey,
  };
}
