import assert from "node:assert/strict";

import {
  compareFinancialInsightPriority,
  deduplicateEquivalentFinancialInsights,
  FINANCIAL_INSIGHT_PRIORITY_POLICY_VERSION,
  FINANCIAL_INSIGHT_TYPE_PRECEDENCE,
  sortFinancialInsightsByPriority,
  type FinancialInsightPriorityKey,
} from "./index.js";

interface Item extends FinancialInsightPriorityKey {
  id: string;
  confidence: number;
  createdAt: string;
  calculationVersion: string;
}

severityPrevailsOverTypeAndConfidence();
typePrecedenceIsFixedWithinSameSeverity();
orderIsIndependentFromPersistenceOrder();
residualTieUsesStableIdentity();
equivalentSnapshotsAreDeduplicatedWithoutCrossTypeSuppression();
policyIsVersionedAndCoversEveryActionableKind();

function severityPrevailsOverTypeAndConfidence(): void {
  const criticalLowConfidence = item("a", "monthly_summary", "critical", { confidence: 0.1 });
  const warningHighConfidence = item("b", "negative_balance_risk", "warning", { confidence: 0.99 });
  const infoRisk = item("c", "negative_balance_risk", "info");
  const ordered = sortFinancialInsightsByPriority(
    [infoRisk, warningHighConfidence, criticalLowConfidence],
    (entry) => entry,
  );
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["a", "b", "c"],
  );
}

function typePrecedenceIsFixedWithinSameSeverity(): void {
  const items = [
    item("summary", "monthly_summary", "info"),
    item("subscription", "probable_subscription", "info"),
    item("merchant", "merchant_spending_increase", "info"),
    item("category", "category_spending_increase", "info"),
    item("budget", "budget_exceeded", "info"),
    item("risk", "negative_balance_risk", "info"),
  ];
  assert.deepEqual(
    sortFinancialInsightsByPriority(items, (entry) => entry).map((entry) => entry.id),
    ["risk", "budget", "category", "merchant", "subscription", "summary"],
  );
}

function orderIsIndependentFromPersistenceOrder(): void {
  const items = [
    item("1", "budget_exceeded", "warning", { createdAt: "2026-06-01T00:00:00Z" }),
    item("2", "category_spending_increase", "warning", { createdAt: "2026-06-02T00:00:00Z" }),
    item("3", "negative_balance_risk", "critical", { createdAt: "2026-06-03T00:00:00Z" }),
    item("4", "monthly_summary", "info", { createdAt: "2026-06-04T00:00:00Z" }),
    item("5", "probable_subscription", "info", { createdAt: "2026-06-05T00:00:00Z" }),
  ];
  const forward = sortFinancialInsightsByPriority(items, (entry) => entry).map((e) => e.id);
  const reversed = sortFinancialInsightsByPriority([...items].reverse(), (entry) => entry).map(
    (e) => e.id,
  );
  assert.deepEqual(forward, ["3", "1", "2", "5", "4"]);
  assert.deepEqual(reversed, forward);
}

function residualTieUsesStableIdentity(): void {
  const usd = item("usd", "category_spending_increase", "info", {
    currency: "USD",
    insightKey: "category_spending_increase:USD:cat:-",
  });
  const brl = item("brl", "category_spending_increase", "info", {
    currency: "BRL",
    insightKey: "category_spending_increase:BRL:cat:-",
  });
  assert.ok(compareFinancialInsightPriority(brl, usd) < 0);
  assert.ok(compareFinancialInsightPriority(usd, brl) > 0);
  assert.equal(compareFinancialInsightPriority(brl, { ...brl }), 0);
}

function equivalentSnapshotsAreDeduplicatedWithoutCrossTypeSuppression(): void {
  const budget = item("row-b", "budget_exceeded", "warning", {
    insightKey: "budget_exceeded:BRL:market:-",
    dataFingerprint: "fp-1",
  });
  const budgetCopy = { ...budget, id: "row-a" };
  const increase = item("row-c", "category_spending_increase", "info", {
    insightKey: "category_spending_increase:BRL:market:-",
    dataFingerprint: "fp-1",
  });
  const newerSnapshot = { ...budget, id: "row-d", dataFingerprint: "fp-2" };
  const keyOf = (entry: Item) => ({ ...entry, snapshotId: entry.id });
  const deduplicated = deduplicateEquivalentFinancialInsights(
    [budget, increase, budgetCopy, newerSnapshot],
    keyOf,
  );
  assert.deepEqual(deduplicated.map((entry) => entry.id).sort(), ["row-a", "row-c", "row-d"]);
  const reversed = deduplicateEquivalentFinancialInsights(
    [newerSnapshot, budgetCopy, increase, budget],
    keyOf,
  );
  assert.deepEqual(reversed.map((entry) => entry.id).sort(), ["row-a", "row-c", "row-d"]);
}

function policyIsVersionedAndCoversEveryActionableKind(): void {
  assert.equal(FINANCIAL_INSIGHT_PRIORITY_POLICY_VERSION, "financial-insight-priority-v1");
  assert.deepEqual(Object.keys(FINANCIAL_INSIGHT_TYPE_PRECEDENCE).sort(), [
    "budget_exceeded",
    "category_spending_increase",
    "merchant_spending_increase",
    "monthly_summary",
    "negative_balance_risk",
    "probable_subscription",
  ]);
  const legacyWithoutSeverity = item("legacy", "budget_exceeded", undefined);
  const info = item("info", "negative_balance_risk", "info");
  assert.ok(compareFinancialInsightPriority(legacyWithoutSeverity, info) < 0);
}

function item(
  id: string,
  insightKind: FinancialInsightPriorityKey["insightKind"],
  severity: FinancialInsightPriorityKey["severity"],
  overrides: Partial<Item> = {},
): Item {
  return {
    id,
    insightKind,
    ...(severity === undefined ? {} : { severity }),
    currency: "BRL",
    periodStartOn: "2026-06-01",
    insightKey: `${insightKind}:BRL:-:-`,
    dataFingerprint: `fp-${id}`,
    confidence: 0.5,
    createdAt: "2026-06-01T00:00:00Z",
    calculationVersion: "financial-insights-v3",
    ...overrides,
  };
}
