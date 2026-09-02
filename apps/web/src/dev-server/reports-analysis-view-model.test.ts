import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCategoryEvolutionAnalysisViewModel,
  buildInstallmentAnalysisViewModel,
} from "./reports-analysis-view-model.js";

describe("reports analysis view-model", () => {
  it("keeps an extended category evolution period intact", () => {
    const periods = Array.from({ length: 24 }, (_, index) => ({
      label: `P${index + 1}`,
      accessibleLabel: `Período ${index + 1}`,
    }));
    const values = periods.map((_, index) =>
      index % 2 === 0 ? 1000 + index : -500 - index,
    );
    const total = values.reduce((sum, value) => sum + value, 0);

    const viewModel = buildCategoryEvolutionAnalysisViewModel(
      { periodCount: periods.length, periods },
      {
        currency: "usd",
        income: {
          cells: values.map(() => ({ amountMinor: 2000 })),
          totalMinor: 48000,
          averageMinor: 2000,
        },
        expense: {
          cells: values.map(() => ({ amountMinor: 1000 })),
          totalMinor: 24000,
          averageMinor: 1000,
        },
        result: {
          cells: values.map((amountMinor) => ({ amountMinor })),
          totalMinor: total,
          averageMinor: Math.round(total / periods.length),
        },
      },
    );

    assert.equal(viewModel.currency, "USD");
    assert.equal(viewModel.periodCount, 24);
    assert.equal(viewModel.trend.length, 24);
    assert.equal(viewModel.summary.incomeMinor, 48000);
    assert.equal(viewModel.summary.expenseMinor, -24000);
    assert.equal(viewModel.highlights.negativePeriodCount, 12);
  });

  it("partitions installment aggregates by currency before summing", () => {
    const items = [
      installment("brl-1", "BRL", 10000, "planned"),
      installment("brl-2", "brl", 2500, "posted"),
      installment("usd-1", "USD", 7000, "planned"),
    ];

    const blocks = buildInstallmentAnalysisViewModel(
      items,
      "2026-07-10",
      (month) => month,
    );

    assert.deepEqual(
      blocks.map((block) => block.currency),
      ["BRL", "USD"],
    );
    assert.equal(blocks[0]?.summary.totalMinor, 12500);
    assert.equal(blocks[1]?.summary.totalMinor, 7000);
    assert.equal(blocks[0]?.groups.categories[0]?.amountMinor, 12500);
    assert.equal(blocks[1]?.groups.categories[0]?.amountMinor, 7000);
    assert.notEqual(blocks[0]?.summary.totalMinor, 19500);
    assert.notEqual(blocks[1]?.summary.totalMinor, 19500);
  });
});

function installment(
  id: string,
  currency: string,
  amountMinor: number,
  status: string,
) {
  return {
    id,
    currency,
    amountMinor,
    status,
    dueOn: "2026-07-15",
    card: { name: "Cartão fictício" },
    category: { name: "Categoria fictícia" },
  };
}
