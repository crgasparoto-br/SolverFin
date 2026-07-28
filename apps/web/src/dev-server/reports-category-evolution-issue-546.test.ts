import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("reports category evolution issue 546", () => {
  it("preserves the selected active account and renders independent accessible tree controls", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/api/accounts") {
        return json({
          accounts: [
            { id: ACCOUNT_ID, name: "Conta principal", status: "active" },
            { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Reserva", status: "active" },
            { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Arquivada", status: "archived" },
          ],
        });
      }
      assert.equal(url.searchParams.get("accountId"), ACCOUNT_ID);
      return json({ report: nestedReport() });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        `http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2&profileId=profile-1&accountId=${ACCOUNT_ID}`,
      ),
    );

    assert.equal(calls.length, 2);
    assert.match(
      html,
      new RegExp(`<option value="${ACCOUNT_ID}" selected>Conta principal</option>`),
    );
    assert.match(html, /<option value="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb">Reserva<\/option>/);
    assert.doesNotMatch(html, />Arquivada<\/option>/);
    assert.match(
      html,
      new RegExp(
        `href="/relatorios\\?view=category-evolution&interval=annual&profileId=profile-1&accountId=${ACCOUNT_ID}"`,
      ),
    );

    const toggles = html.match(/data-category-toggle=/g) ?? [];
    assert.equal(toggles.length, 4);
    assert.match(html, /aria-expanded="true"/);
    assert.match(
      html,
      /aria-controls="report-category-0-income-0-0 report-category-0-income-0-0-0"/,
    );
    assert.match(
      html,
      /data-tree-ancestors="report-category-0-income-0 report-category-0-income-0-0"/,
    );
    assert.match(html, /data-category-tree="0"/);
    assert.match(html, /data-category-tree="1"/);
    assert.match(html, /Recolher Receitas operacionais/);
    assert.doesNotMatch(html, /data-category-name="Folha"/);
    assert.doesNotMatch(html, /data-category-name="Resultado"/);
    assert.match(html, /const collapsed = new Set\(\)/);
  });

  it("styles only negative result cells while preserving their textual sign", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/accounts") return json({ accounts: [] });
      return json({ report: negativeReport() });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2",
      ),
    );

    const negativeCells =
      html.match(/class="report-value-negative" data-negative-value="true"/g) ?? [];
    assert.equal(negativeCells.length, 3);
    assert.match(html, /report-value-negative[^>]*><strong>-R\$\s*50,00<\/strong>/);
    assert.match(html, /report-value-negative[^>]*><strong>-R\$\s*25,00<\/strong>/);
    assert.match(html, /report-value-negative[^>]*><strong>-R\$\s*50,00<\/strong>/);
    const expenseRow =
      html.match(
        /<tr class="report-row report-row-expense report-section-row">[\s\S]*?<\/tr>/,
      )?.[0] ?? "";
    assert.doesNotMatch(expenseRow, /report-value-negative/);
    assert.match(html, /<strong>R\$\s*0,00<\/strong>/);
  });
});

function nestedReport() {
  const leaf = node("income-leaf", "Folha", [1000, 2000], []);
  const child = node("income-child", "Serviços", [1000, 2000], [leaf]);
  const root = node("income-root", "Receitas operacionais", [1000, 2000], [child]);
  const expenseChild = node("expense-child", "Hospedagem", [200, 300], []);
  const expenseRoot = node("expense-root", "Tecnologia", [200, 300], [expenseChild]);
  const secondCurrencyRoot = node(
    "usd-root",
    "Receita exterior",
    [500, 500],
    [node("usd-child", "Consultoria", [500, 500], [])],
  );
  return {
    interval: "monthly",
    start: "2026-07",
    periodCount: 2,
    periods: periods(),
    currencyBlocks: [
      block("BRL", [1000, 2000], [200, 300], [800, 1700], [root], [expenseRoot]),
      block("USD", [500, 500], [0, 0], [500, 500], [secondCurrencyRoot], []),
    ],
  };
}

function negativeReport() {
  return {
    interval: "monthly",
    start: "2026-07",
    periodCount: 2,
    periods: periods(),
    currencyBlocks: [block("BRL", [10000, 10000], [15000, 10000], [-5000, 0], [], [])],
  };
}

function block(
  currency: string,
  income: number[],
  expense: number[],
  result: number[],
  incomeCategories: unknown[],
  expenseCategories: unknown[],
) {
  return {
    currency,
    income: series(income),
    incomeCategories,
    expense: series(expense),
    expenseCategories,
    result: series(result),
  };
}

function node(categoryId: string, name: string, amounts: number[], children: unknown[]) {
  return { categoryId, name, status: "active", series: series(amounts), children };
}

function series(amounts: number[]) {
  const totalMinor = amounts.reduce((total, amount) => total + amount, 0);
  return {
    cells: amounts.map((amountMinor) => ({ amountMinor, percentage: null })),
    totalMinor,
    totalPercentage: null,
    averageMinor: Math.round(totalMinor / amounts.length),
    averagePercentage: null,
  };
}

function periods() {
  return [
    {
      key: "2026-07",
      label: "Jul/26",
      accessibleLabel: "Julho de 2026",
      startsOn: "2026-07-01",
      endsOn: "2026-07-31",
    },
    {
      key: "2026-08",
      label: "Ago/26",
      accessibleLabel: "Agosto de 2026",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
    },
  ];
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
