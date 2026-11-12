import assert from "node:assert/strict";

import { generateFinancialInsights, type InsightTransaction } from "./index.js";

const organizationId = "org-insight-currency";
const financialProfileId = "profile-insight-currency";
const currentPeriod = { startOn: "2026-08-01", endOn: "2026-08-31" };
const previousPeriod = { startOn: "2026-07-01", endOn: "2026-07-31" };

infersSingleNativeCurrencyWithoutDefaultingToBrl();
requiresExplicitCurrencyForMixedNativeData();
filtersMixedDataWhenCurrencyIsExplicit();
rejectsInvalidExplicitCurrency();

function infersSingleNativeCurrencyWithoutDefaultingToBrl(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    transactions: [expense("usd-only", "USD", 12_345)],
  });
  const summary = insights.find((item) => item.kind === "monthly_summary");

  assert.ok(summary);
  assert.equal(summary.currency, "USD");
  assert.equal(summary.filters.currency, "USD");
  assert.equal(summary.evidence.currentAmountMinor, 12_345);
}

function requiresExplicitCurrencyForMixedNativeData(): void {
  assert.throws(
    () =>
      generateFinancialInsights({
        organizationId,
        financialProfileId,
        currentPeriod,
        previousPeriod,
        transactions: [expense("brl-mixed", "BRL", 10_000), expense("usd-mixed", "USD", 20_000)],
      }),
    /explicit currency when multiple native currencies/i,
  );
}

function filtersMixedDataWhenCurrencyIsExplicit(): void {
  const insights = generateFinancialInsights({
    organizationId,
    financialProfileId,
    currentPeriod,
    previousPeriod,
    currency: "usd",
    transactions: [
      expense("brl-explicit", "BRL", 91_000),
      expense("usd-explicit-a", "USD", 2_100),
      expense("usd-explicit-b", "USD", 3_400),
    ],
  });
  const summary = insights.find((item) => item.kind === "monthly_summary");

  assert.ok(summary);
  assert.equal(summary.currency, "USD");
  assert.equal(summary.evidence.currentAmountMinor, 5_500);
  assert.equal(summary.sources.includes("brl-explicit"), false);
}

function rejectsInvalidExplicitCurrency(): void {
  assert.throws(
    () =>
      generateFinancialInsights({
        organizationId,
        financialProfileId,
        currentPeriod,
        previousPeriod,
        currency: "invalid",
        transactions: [expense("usd-invalid", "USD", 1_000)],
      }),
    /ISO 4217/i,
  );
}

function expense(id: string, currency: string, amountMinor: number): InsightTransaction {
  return {
    id,
    organizationId,
    financialProfileId,
    kind: "expense",
    status: "posted",
    amountMinor,
    currency,
    occurredOn: "2026-08-10",
    categoryId: "category-demo",
  };
}
