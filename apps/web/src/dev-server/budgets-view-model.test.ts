import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBudgetsPageViewModel,
  type BudgetRecord,
  type BudgetUsageLoad,
  type BudgetUsageRecord,
  type CategoryRecord,
} from "./budgets-view-model.js";

const categories: CategoryRecord[] = [
  { id: "parent", name: "Casa", kind: "expense", status: "active" },
  {
    id: "child",
    name: "Mercado",
    kind: "expense",
    status: "active",
    parentCategoryId: "parent",
  },
  { id: "health", name: "Saúde", kind: "expense", status: "active" },
];

const brlBudget: BudgetRecord = {
  id: "brl",
  status: "active",
  categoryId: "child",
  periodStartOn: "2026-09-01",
  periodEndOn: "2026-09-30",
  plannedAmountMinor: 100_000,
  currency: "BRL",
};

const usdBudget: BudgetRecord = {
  ...brlBudget,
  id: "usd",
  plannedAmountMinor: 20_000,
  currency: "USD",
};

function usage(budget: BudgetRecord, realized: number, committed = 0): BudgetUsageLoad {
  const projected = realized + committed;
  return {
    ok: true,
    usage: {
      source: "budget",
      budgetId: budget.id,
      categoryId: budget.categoryId,
      periodStartOn: budget.periodStartOn,
      periodEndOn: budget.periodEndOn,
      plannedAmountMinor: budget.plannedAmountMinor,
      actualAmountMinor: realized,
      realizedAmountMinor: realized,
      committedAmountMinor: committed,
      projectedAmountMinor: projected,
      remainingAmountMinor: budget.plannedAmountMinor - realized,
      availableAmountMinor: budget.plannedAmountMinor - projected,
      overBudgetAmountMinor: Math.max(0, projected - budget.plannedAmountMinor),
      usedPercent: (realized / budget.plannedAmountMinor) * 100,
      alertThresholdPercent: 80,
      status: realized > budget.plannedAmountMinor ? "exceeded" : "on_track",
      currency: budget.currency ?? "BRL",
      realizedItems: [],
      committedItems: [],
    },
  };
}

function dashboardUsage(
  source: "unbudgeted" | "uncategorized",
  currency = "BRL",
): BudgetUsageRecord {
  return {
    source,
    ...(source === "unbudgeted" ? { categoryId: "health" } : {}),
    periodStartOn: "2026-09-01",
    periodEndOn: "2026-09-30",
    plannedAmountMinor: null,
    actualAmountMinor: 12_500,
    realizedAmountMinor: 12_500,
    committedAmountMinor: 2_500,
    projectedAmountMinor: 15_000,
    remainingAmountMinor: null,
    availableAmountMinor: null,
    overBudgetAmountMinor: null,
    usedPercent: null,
    alertThresholdPercent: null,
    status: source,
    currency,
    realizedItems: [],
    committedItems: [],
  };
}

describe("budgets view-model issue 619", () => {
  it("preserves backend realized, committed, projected and available values by currency", () => {
    const loads = new Map<string, BudgetUsageLoad>([
      [brlBudget.id, usage(brlBudget, 30_000, 20_000)],
      [usdBudget.id, usage(usdBudget, 500, 1_000)],
    ]);
    const result = buildBudgetsPageViewModel([brlBudget, usdBudget], categories, loads);

    assert.deepEqual(result.currencies, ["BRL", "USD"]);
    assert.deepEqual(
      result.rows.map((row) => [
        row.currency,
        row.plannedAmountMinor,
        row.actualAmountMinor,
        row.committedAmountMinor,
        row.projectedAmountMinor,
        row.availableAmountMinor,
      ]),
      [
        ["BRL", 100_000, 30_000, 20_000, 50_000, 50_000],
        ["USD", 20_000, 500, 1_000, 1_500, 18_500],
      ],
    );
    assert.equal(result.rows[0]?.categoryName, "Casa › Mercado");
  });

  it("fails closed when usage currency or period does not match the budget", () => {
    const mismatched = usage(brlBudget, 30_000, 20_000);
    if (!mismatched.usage) throw new Error("fixture missing usage");
    mismatched.usage.currency = "USD";
    mismatched.usage.periodEndOn = "2026-10-31";

    const result = buildBudgetsPageViewModel(
      [brlBudget],
      categories,
      new Map([[brlBudget.id, mismatched]]),
    );

    assert.equal(result.rows[0]?.actualAmountMinor, null);
    assert.equal(result.rows[0]?.committedAmountMinor, null);
    assert.equal(result.rows[0]?.projectedAmountMinor, null);
    assert.equal(result.rows[0]?.availableAmountMinor, null);
    assert.equal(result.rows[0]?.usageStatus, "unavailable");
  });

  it("keeps unbudgeted and uncategorized rows distinct without fabricating planned zero", () => {
    const result = buildBudgetsPageViewModel(
      [brlBudget],
      categories,
      new Map([[brlBudget.id, usage(brlBudget, 30_000, 20_000)]]),
      {},
      [dashboardUsage("unbudgeted"), dashboardUsage("uncategorized")],
    );
    const unbudgeted = result.rows.find((candidate) => candidate.source === "unbudgeted");
    const uncategorized = result.rows.find((candidate) => candidate.source === "uncategorized");

    assert.ok(unbudgeted);
    assert.equal(unbudgeted.categoryName, "Saúde");
    assert.equal(unbudgeted.plannedAmountMinor, null);
    assert.equal(unbudgeted.availableAmountMinor, null);
    assert.equal(unbudgeted.projectedAmountMinor, 15_000);

    assert.ok(uncategorized);
    assert.equal(uncategorized.categoryName, "Sem categoria");
    assert.equal(uncategorized.plannedAmountMinor, null);
    assert.equal(uncategorized.availableAmountMinor, null);
    assert.equal(uncategorized.projectedAmountMinor, 15_000);
    assert.equal(result.unbudgetedCount, 1);
    assert.equal(result.uncategorizedCount, 1);
  });

  it("filters every source by native currency without relabeling", () => {
    const result = buildBudgetsPageViewModel(
      [brlBudget, usdBudget],
      categories,
      new Map([
        [brlBudget.id, usage(brlBudget, 30_000)],
        [usdBudget.id, usage(usdBudget, 500)],
      ]),
      { currency: "USD" },
      [dashboardUsage("unbudgeted", "BRL"), dashboardUsage("uncategorized", "USD")],
    );

    assert.equal(
      result.rows.every((row) => row.currency === "USD"),
      true,
    );
    assert.equal(
      result.rows.some((row) => row.source === "uncategorized"),
      true,
    );
    assert.equal(
      result.rows.some((row) => row.source === "unbudgeted"),
      false,
    );
  });
});
