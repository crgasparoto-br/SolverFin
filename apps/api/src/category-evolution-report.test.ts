import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCategoryEvolutionReport,
  CategoryEvolutionFilterError,
  parseCategoryEvolutionFilters,
} from "./category-evolution-report.js";

describe("category evolution report", () => {
  it("builds monthly, annual and rolling periods from an injectable UTC reference", () => {
    const reference = new Date("2026-07-28T12:00:00.000Z");
    const monthly = parseCategoryEvolutionFilters(new URLSearchParams(), reference);
    assert.equal(monthly.start, "2025-08");
    assert.equal(monthly.periodCount, 12);
    assert.equal(monthly.periods[0]?.startsOn, "2025-08-01");
    assert.equal(monthly.periods[11]?.endsOn, "2026-07-31");

    const annual = parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "annual" }),
      reference,
    );
    assert.equal(annual.start, "2024");
    assert.deepEqual(
      annual.periods.map((period) => period.key),
      ["2024", "2025", "2026"],
    );

    const rolling = parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "rolling-year" }),
      reference,
    );
    assert.equal(rolling.start, "2023-08");
    assert.equal(rolling.periods[2]?.startsOn, "2025-08-01");
    assert.equal(rolling.periods[2]?.endsOn, "2026-07-31");

    const lowerYearMonthly = parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "monthly", start: "0001-01", periods: "1" }),
      reference,
    );
    assert.equal(lowerYearMonthly.periods[0]?.label, "Jan/01");

    const lowerYearRolling = parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "rolling-year", start: "0001-01", periods: "1" }),
      reference,
    );
    assert.equal(lowerYearRolling.periods[0]?.label, "Jan/01–Dez/01");
  });

  it("rejects sent invalid filters instead of silently applying defaults", () => {
    assert.throws(
      () => parseCategoryEvolutionFilters(new URLSearchParams({ interval: "quarterly" })),
      CategoryEvolutionFilterError,
    );
    assert.throws(
      () =>
        parseCategoryEvolutionFilters(
          new URLSearchParams({ interval: "monthly", start: "2026-13" }),
        ),
      /Início inválido/,
    );
    assert.throws(
      () =>
        parseCategoryEvolutionFilters(new URLSearchParams({ interval: "monthly", periods: "25" })),
      /entre 1 e 24/,
    );
  });

  it("aggregates hierarchy, uncategorized movements, currencies and percentages without double counting", () => {
    const filters = parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "monthly", start: "2026-06", periods: "2" }),
      new Date("2026-07-28T12:00:00.000Z"),
    );
    const report = buildCategoryEvolutionReport(filters, {
      categories: [
        {
          id: "income-root",
          parentCategoryId: null,
          name: "Trabalho",
          kind: "income",
          status: "active",
        },
        {
          id: "income-child",
          parentCategoryId: "income-root",
          name: "Projetos",
          kind: "income",
          status: "active",
        },
        {
          id: "expense-root",
          parentCategoryId: null,
          name: "Moradia",
          kind: "expense",
          status: "archived",
        },
        {
          id: "expense-child",
          parentCategoryId: "expense-root",
          name: "Energia",
          kind: "expense",
          status: "active",
        },
      ],
      movements: [
        {
          periodIndex: 0,
          kind: "income",
          currency: "BRL",
          categoryId: "income-root",
          amountMinor: 10000,
        },
        {
          periodIndex: 0,
          kind: "income",
          currency: "BRL",
          categoryId: "income-child",
          amountMinor: 5000,
        },
        {
          periodIndex: 1,
          kind: "income",
          currency: "BRL",
          categoryId: "income-child",
          amountMinor: 30000,
        },
        {
          periodIndex: 0,
          kind: "expense",
          currency: "BRL",
          categoryId: "expense-child",
          amountMinor: 6000,
        },
        { periodIndex: 1, kind: "expense", currency: "BRL", categoryId: null, amountMinor: 9000 },
        { periodIndex: 1, kind: "income", currency: "USD", categoryId: null, amountMinor: 2000 },
      ],
    });

    assert.deepEqual(
      report.currencyBlocks.map((block) => block.currency),
      ["BRL", "USD"],
    );
    const brl = report.currencyBlocks[0];
    assert.ok(brl);
    assert.deepEqual(
      brl.income.cells.map((cell) => cell.amountMinor),
      [15000, 30000],
    );
    assert.equal(brl.income.totalMinor, 45000);
    assert.equal(brl.income.averageMinor, 22500);
    assert.deepEqual(
      brl.expense.cells.map((cell) => cell.amountMinor),
      [6000, 9000],
    );
    assert.deepEqual(
      brl.result.cells.map((cell) => cell.amountMinor),
      [9000, 21000],
    );
    assert.equal(brl.expense.cells[0]?.percentage, 40);
    assert.equal(brl.result.cells[0]?.percentage, 60);

    const incomeRoot = brl.incomeCategories[0];
    assert.equal(incomeRoot?.name, "Trabalho");
    assert.equal(incomeRoot?.series.totalMinor, 45000);
    assert.equal(incomeRoot?.children[0]?.name, "Projetos");
    assert.equal(incomeRoot?.children[0]?.series.totalMinor, 35000);

    const expenseNames = brl.expenseCategories.map((node) => node.name);
    assert.deepEqual(expenseNames, ["Sem categoria", "Moradia"]);
    assert.equal(brl.expenseCategories[1]?.status, "archived");
  });

  it("rounds monetary averages half away from zero and returns null for zero denominators", () => {
    const filters = parseCategoryEvolutionFilters(
      new URLSearchParams({ interval: "monthly", start: "2026-06", periods: "2" }),
    );
    const report = buildCategoryEvolutionReport(filters, {
      categories: [],
      movements: [
        { periodIndex: 0, kind: "expense", currency: "BRL", categoryId: null, amountMinor: 1 },
      ],
    });
    const block = report.currencyBlocks[0];
    assert.equal(block?.expense.averageMinor, 1);
    assert.equal(block?.expense.cells[0]?.percentage, null);
    assert.equal(block?.result.cells[0]?.amountMinor, -1);
    assert.equal(block?.result.averageMinor, -1);
    assert.equal(block?.result.totalPercentage, null);
  });
});
