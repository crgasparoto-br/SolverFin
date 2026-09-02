import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("issue 611 reports analysis archetype", () => {
  it("renders summary, visualization, highlights and detail for a 24-period multi-currency report", async () => {
    const periods = buildPeriods(24);
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
      if (url.pathname === "/api/credit-card-accounts") {
        return jsonResponse({ creditCardAccounts: [] });
      }
      assert.equal(url.pathname, "/api/reports/category-evolution");
      assert.equal(url.searchParams.get("periods"), "24");
      return jsonResponse({
        report: {
          interval: "monthly",
          start: "2024-08",
          periodCount: 24,
          periods,
          currencyBlocks: [
            categoryBlock("BRL", periods.length, 100000, 45000),
            categoryBlock("USD", periods.length, 50000, 20000),
          ],
        },
      });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2024-08&periods=24",
      ),
      new Date("2026-07-31T12:00:00.000Z"),
    );

    process.stdout.write(
      `ISSUE611_DIAG ${JSON.stringify({
        a5Count: (html.match(/data-report-analysis="a5"/g) ?? []).length,
        matrixCount: (html.match(/class="evolution-table"/g) ?? []).length,
        currencies: html.match(/data-currency="[^"]+"/g) ?? [],
      })}\n`,
    );

    assert.equal((html.match(/data-report-analysis="a5"/g) ?? []).length, 2);
    assert.match(html, /data-currency="BRL"/);
    assert.match(html, /data-currency="USD"/);
    assert.equal((html.match(/class="evolution-table"/g) ?? []).length, 2);
    assert.match(html, /tabindex="0" aria-label="Matriz de evolução em BRL"/);

    const summary = html.indexOf('data-analysis-layer="summary"');
    const visualization = html.indexOf('data-analysis-layer="visualization"');
    const highlights = html.indexOf('data-analysis-layer="highlights"');
    const detail = html.indexOf('data-analysis-layer="detail"');
    assert.ok(summary >= 0 && summary < visualization);
    assert.ok(visualization < highlights);
    assert.ok(highlights < detail);
  });

  it("keeps installment summaries separated by currency and uses semantic detail tables", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/installments") {
        return jsonResponse({
          installments: [installment("brl", "BRL", 10000), installment("usd", "USD", 5000)],
        });
      }
      if (url.pathname === "/api/cards") return jsonResponse({ cards: [] });
      if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
      return jsonResponse({});
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL("http://localhost/relatorios?view=installments&month=2026-07"),
    );

    assert.equal((html.match(/data-report-analysis="a5"/g) ?? []).length, 2);
    assert.match(html, /data-currency="BRL"/);
    assert.match(html, /data-currency="USD"/);
    assert.equal((html.match(/<table class="sf-table">/g) ?? []).length, 2);
    assert.match(html, /<th scope="col"[^>]*>Valor<\/th>/);
    assert.match(html, /data-money-availability="available"/);
    assert.doesNotMatch(html, /data-currency="BRL"[^]*19\.500/);
  });
});

function categoryBlock(
  currency: string,
  periodCount: number,
  incomeMinor: number,
  expenseMinor: number,
) {
  const income = Array.from({ length: periodCount }, () => Math.round(incomeMinor / periodCount));
  const expense = Array.from({ length: periodCount }, () => Math.round(expenseMinor / periodCount));
  const result = income.map((value, index) => value - (expense[index] ?? 0));
  return {
    currency,
    income: series(income),
    incomeCategories: [],
    expense: series(expense),
    expenseCategories: [],
    result: series(result),
  };
}

function series(amounts: number[]) {
  const totalMinor = amounts.reduce((sum, amount) => sum + amount, 0);
  return {
    cells: amounts.map((amountMinor) => ({ amountMinor, percentage: null })),
    totalMinor,
    totalPercentage: null,
    averageMinor: Math.round(totalMinor / amounts.length),
    averagePercentage: null,
  };
}

function buildPeriods(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const absoluteMonth = 2024 * 12 + 7 + index;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    return {
      key,
      label: key,
      accessibleLabel: `Período ${index + 1}`,
      startsOn: `${key}-01`,
      endsOn: `${key}-28`,
    };
  });
}

function installment(id: string, currency: string, amountMinor: number) {
  return {
    id,
    status: "planned",
    sequenceNumber: 1,
    totalInstallments: 1,
    dueOn: "2026-07-15",
    amountMinor,
    currency,
    transaction: { id: `t-${id}`, description: `Parcela ${id}`, status: "planned" },
    card: { id: `card-${id}`, name: `Cartão ${id}`, status: "active" },
    category: { id: `category-${id}`, name: `Categoria ${id}`, kind: "expense", status: "active" },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
