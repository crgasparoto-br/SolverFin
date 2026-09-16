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

function usage(budget: BudgetRecord, actualAmountMinor: number): BudgetUsageLoad {
  return {
    ok: true,
    usage: {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      periodStartOn: budget.periodStartOn,
      periodEndOn: budget.periodEndOn,
      plannedAmountMinor: budget.plannedAmountMinor,
      actualAmountMinor,
      remainingAmountMinor: budget.plannedAmountMinor - actualAmountMinor,
      usedPercent: (actualAmountMinor / budget.plannedAmountMinor) * 100,
      alertThresholdPercent: 80,
      status: actualAmountMinor > budget.plannedAmountMinor ? "exceeded" : "on_track",
      currency: budget.currency ?? "BRL",
    },
  };
}

function unbudgeted(currency = "BRL"): BudgetUsageRecord {
  return {
    categoryId: "health",
    periodStartOn: "2026-09-01",
    periodEndOn: "2026-09-30",
    plannedAmountMinor: 0,
    actualAmountMinor: 12_500,
    remainingAmountMinor: -12_500,
    usedPercent: 100,
    alertThresholdPercent: 80,
    status: "unbudgeted",
    currency,
  };
}

describe("budgets view-model issue 613", () => {
  it("keeps currencies separated and preserves backend realized and remaining values", () => {
    const loads = new Map<string, BudgetUsageLoad>([
      [brlBudget.id, usage(brlBudget, 30_000)],
      [usdBudget.id, usage(usdBudget, 500)],
    ]);
    const result = buildBudgetsPageViewModel([brlBudget, usdBudget], categories, loads);

    assert.deepEqual(result.currencies, ["BRL", "USD"]);
    assert.deepEqual(
      result.rows.map((row) => [
        row.currency,
        row.plannedAmountMinor,
        row.actualAmountMinor,
        row.remainingAmountMinor,
      ]),
      [
        ["BRL", 100_000, 30_000, 70_000],
        ["USD", 20_000, 500, 19_500],
      ],
    );
    assert.equal(result.rows[0]?.categoryName, "Casa › Mercado");
  });

  it("fails closed when usage currency or period does not match the budget", () => {
    const mismatched = usage(brlBudget, 30_000);
    if (!mismatched.usage) throw new Error("fixture missing usage");
    mismatched.usage.currency = "USD";
    mismatched.usage.periodEndOn = "2026-10-31";

    const result = buildBudgetsPageViewModel(
      [brlBudget],
      categories,
      new Map([[brlBudget.id, mismatched]]),
    );

    assert.equal(result.rows[0]?.actualAmountMinor, null);
    assert.equal(result.rows[0]?.remainingAmountMinor, null);
    assert.equal(result.rows[0]?.usedPercent, null);
    assert.equal(result.rows[0]?.usageStatus, "unavailable");
  });

  it("filters currency without aggregating or relabeling another currency", () => {
    const result = buildBudgetsPageViewModel(
      [brlBudget, usdBudget],
      categories,
      new Map([
        [brlBudget.id, usage(brlBudget, 30_000)],
        [usdBudget.id, usage(usdBudget, 500)],
      ]),
      { currency: "usd" },
    );

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.id, "usd");
    assert.equal(result.rows[0]?.currency, "USD");
  });

  it("keeps unbudgeted usage distinct without fabricating a zero-value budget", () => {
    const result = buildBudgetsPageViewModel(
      [brlBudget],
      categories,
      new Map([[brlBudget.id, usage(brlBudget, 30_000)]]),
      {},
      [unbudgeted()],
    );
    const row = result.rows.find((candidate) => candidate.source === "unbudgeted");

    if (!row) throw new Error("unbudgeted row missing");
    assert.equal(row.categoryName, "Saúde");
    assert.equal(row.plannedAmountMinor, null);
    assert.equal(row.actualAmountMinor, 12_500);
    assert.equal(row.remainingAmountMinor, -12_500);
    assert.equal(row.usedPercent, 100);
    assert.equal(row.usageStatus, "unbudgeted");
    assert.equal(row.currency, "BRL");
    assert.equal(result.unbudgetedCount, 1);
  });

  it("applies currency filtering to unbudgeted rows without cross-currency relabeling", () => {
    const result = buildBudgetsPageViewModel([], categories, new Map(), { currency: "USD" }, [
      unbudgeted("BRL"),
      unbudgeted("USD"),
    ]);

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.source, "unbudgeted");
    assert.equal(result.rows[0]?.currency, "USD");
  });
});
