import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage, resolveReportsView } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("reports route page", () => {
  it("selects the compatible view and rejects mixed implicit filters", () => {
    assert.deepEqual(resolveReportsView(new URL("http://localhost/relatorios")), {
      view: "category-evolution",
    });
    assert.deepEqual(resolveReportsView(new URL("http://localhost/relatorios?month=2026-07")), {
      view: "installments",
    });
    assert.deepEqual(resolveReportsView(new URL("http://localhost/relatorios?interval=annual")), {
      view: "category-evolution",
    });
    assert.match(
      resolveReportsView(new URL("http://localhost/relatorios?month=2026-07&interval=annual"))
        .error ?? "",
      /misturados/,
    );
  });

  it("renders the category evolution matrix with explicit filters, tenant profile and accessible table", async () => {
    const paths: string[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      assert.equal(url.pathname, "/api/reports/category-evolution");
      assert.equal(url.searchParams.get("interval"), "monthly");
      assert.equal(url.searchParams.get("start"), "2026-06");
      assert.equal(url.searchParams.get("periods"), "2");
      assert.equal(url.searchParams.get("profileId"), "profile-1");
      return jsonResponse({
        report: {
          interval: "monthly",
          start: "2026-06",
          periodCount: 2,
          periods: [
            {
              key: "2026-06",
              label: "Jun/26",
              accessibleLabel: "Junho de 2026",
              startsOn: "2026-06-01",
              endsOn: "2026-06-30",
            },
            {
              key: "2026-07",
              label: "Jul/26",
              accessibleLabel: "Julho de 2026",
              startsOn: "2026-07-01",
              endsOn: "2026-07-31",
            },
          ],
          currencyBlocks: [
            {
              currency: "BRL",
              income: series([100000, 120000], [null, null]),
              incomeCategories: [
                {
                  categoryId: "income-1",
                  name: "Salário",
                  status: "active",
                  series: series([100000, 120000], [100, 100]),
                  children: [],
                },
              ],
              expense: series([40000, 30000], [40, 25]),
              expenseCategories: [
                {
                  categoryId: "expense-1",
                  name: "Moradia",
                  status: "archived",
                  series: series([40000, 30000], [100, 100]),
                  children: [],
                },
              ],
              result: series([60000, 90000], [60, 75]),
            },
          ],
        },
      });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=2&profileId=profile-1",
      ),
      new Date("2026-07-28T12:00:00.000Z"),
    );

    assert.equal(paths.length, 1);
    assert.match(html, /data-report-state="ready"/);
    assert.match(html, /<table class="evolution-table">/);
    assert.match(html, /scope="col"/);
    assert.match(html, /scope="row"/);
    assert.match(html, /Junho de 2026/);
    assert.match(html, /Salário/);
    assert.match(html, /Moradia/);
    assert.match(html, /Arquivada/);
    assert.match(html, /-R\$\s*400,00/);
    assert.match(html, /Resultado/);
    assert.match(html, /name="view" value="category-evolution"/);
    assert.match(html, /name="profileId" value="profile-1"/);
    assert.match(
      html,
      /href="\/relatorios\?view=category-evolution&interval=annual&profileId=profile-1"/,
    );
    assert.doesNotMatch(
      html,
      /href="\/relatorios\?view=category-evolution&interval=annual[^"]*(start|periods)=/,
    );
  });

  it("renders filter errors before requesting the API", async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls += 1;
      return jsonResponse({});
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-13&periods=12",
      ),
    );

    assert.equal(calls, 0);
    assert.match(html, /data-report-state="filter-error"/);
    assert.match(html, /Início inválido/);
  });

  it("preserves the installment report and emits view and profileId explicitly", async () => {
    const paths: string[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/api/installments") {
        assert.equal(url.searchParams.get("profileId"), "profile-1");
        return jsonResponse({
          installments: [
            {
              id: "i-1",
              status: "posted",
              sequenceNumber: 1,
              totalInstallments: 2,
              dueOn: "2026-07-10",
              amountMinor: 15000,
              currency: "BRL",
              transaction: { id: "t-1", description: "Notebook", status: "posted" },
              card: { id: "card-1", name: "Principal", status: "active" },
              category: { id: "cat-1", name: "Tecnologia", kind: "expense", status: "active" },
            },
          ],
        });
      }
      if (url.pathname === "/api/cards") return jsonResponse({ cards: [] });
      if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
      return jsonResponse({});
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL("http://localhost/relatorios?view=installments&month=2026-07&profileId=profile-1"),
    );

    assert.equal(paths.length, 3);
    assert.match(html, /Parcelas consolidadas/);
    assert.match(html, /Notebook/);
    assert.match(html, /name="view" value="installments"/);
    assert.match(html, /name="profileId" value="profile-1"/);
  });
});

function series(amounts: number[], percentages: Array<number | null>) {
  const totalMinor = amounts.reduce((sum, amount) => sum + amount, 0);
  return {
    cells: amounts.map((amountMinor, index) => ({
      amountMinor,
      percentage: percentages[index] ?? null,
    })),
    totalMinor,
    totalPercentage: percentages.find((value) => value !== null) ?? null,
    averageMinor: Math.round(totalMinor / amounts.length),
    averagePercentage: percentages.find((value) => value !== null) ?? null,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
