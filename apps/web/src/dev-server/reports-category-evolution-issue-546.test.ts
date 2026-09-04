import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderReportsRoutePage } from "./reports-route-page.js";

const originalFetch = globalThis.fetch;
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

interface MockOptions {
  accountStatus?: number;
  cardStatus?: number;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("reports category evolution issue 546", () => {
  it("preserves the selected account, groups financial sources and renders section controls", async () => {
    const calls: string[] = [];
    installFetchMock(calls);

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        `http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2&profileId=profile-1&accountId=${ACCOUNT_ID}`,
      ),
    );

    assert.equal(calls.length, 3);
    assert.match(html, /<label for="report-origin">Conta ou cartão/);
    assert.match(html, /<option value=""[^>]*>Todas as contas e cartões<\/option>/);
    assert.match(html, /<optgroup label="Contas">/);
    assert.match(html, /<optgroup label="Cartões de crédito">/);
    assert.match(
      html,
      new RegExp(`<option value="account:${ACCOUNT_ID}" selected>Conta principal</option>`),
    );
    assert.match(
      html,
      /<option value="account:cccccccc-cccc-4ccc-8ccc-cccccccccccc">Reserva<\/option>/,
    );
    assert.doesNotMatch(html, />Conta arquivada<\/option>/);
    assert.match(html, new RegExp(`<option value="card:${CARD_ID}">Cartão principal</option>`));
    assert.match(
      html,
      /<option value="card:dddddddd-dddd-4ddd-8ddd-dddddddddddd">Cartão bloqueado<\/option>/,
    );
    assert.doesNotMatch(html, />Cartão arquivado<\/option>/);
    assert.match(
      html,
      new RegExp(
        `href="/relatorios\\?view=category-evolution&interval=annual&profileId=profile-1&accountId=${ACCOUNT_ID}"`,
      ),
    );

    const toggles = html.match(/data-category-toggle=/g) ?? [];
    assert.equal(toggles.length, 7);
    assert.match(html, /data-section-toggle="income"/);
    assert.match(html, /data-section-toggle="expense"/);
    assert.match(html, /data-category-name="receitas"[^>]*aria-expanded="true"/);
    assert.match(html, /data-category-name="despesas"[^>]*aria-expanded="true"/);
    assert.match(html, /data-category-toggle-label>Recolher receitas<\/span>/);
    assert.match(html, /data-category-toggle-label>Recolher despesas<\/span>/);
    assert.match(
      html,
      /aria-controls="report-category-0-income-0 report-category-0-income-0-0 report-category-0-income-0-0-0"/,
    );
    assert.match(
      html,
      /data-tree-ancestors="report-section-0-income report-category-0-income-0 report-category-0-income-0-0"/,
    );
    assert.match(html, /data-category-tree="0"/);
    assert.match(html, /data-category-tree="1"/);
    assert.match(html, /Recolher Receitas operacionais/);
    assert.doesNotMatch(html, /data-category-name="Folha"/);
    assert.doesNotMatch(html, /data-category-name="Resultado"/);
    assert.match(html, /const collapsed = new Set\(\)/);
  });

  it("preserves a selected blocked card and sends only cardId to the report", async () => {
    const calls: string[] = [];
    installFetchMock(calls);

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2&profileId=profile-1&cardId=dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      ),
    );

    const reportCall = calls.find((call) => call.startsWith("/api/reports/category-evolution?"));
    assert.ok(reportCall);
    const reportUrl = new URL(reportCall, "http://localhost");
    assert.equal(reportUrl.searchParams.get("cardId"), "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    assert.equal(reportUrl.searchParams.has("accountId"), false);
    assert.match(
      html,
      /<option value="card:dddddddd-dddd-4ddd-8ddd-dddddddddddd" selected>Cartão bloqueado<\/option>/,
    );
    assert.match(
      html,
      /href="\/relatorios\?view=category-evolution&amp;interval=annual&amp;profileId=profile-1&amp;cardId=dddddddd-dddd-4ddd-8ddd-dddddddddddd"|href="\/relatorios\?view=category-evolution&interval=annual&profileId=profile-1&cardId=dddddddd-dddd-4ddd-8ddd-dddddddddddd"/,
    );
  });

  it("renders no partial source list when accounts or cards cannot be loaded", async () => {
    const calls: string[] = [];
    installFetchMock(calls, { cardStatus: 503 });

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2",
      ),
    );

    assert.match(html, /data-report-state="api-error"/);
    assert.match(html, /Não foi possível carregar contas e cartões/);
    assert.doesNotMatch(html, />Conta principal<\/option>/);
    assert.doesNotMatch(html, />Cartão principal<\/option>/);
    assert.equal(
      calls.some((call) => call.startsWith("/api/reports/category-evolution?")),
      false,
    );
  });

  it("styles only negative result cells while preserving their textual sign", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/accounts") return json({ accounts: [] });
      if (url.pathname === "/api/credit-card-accounts") {
        return json({ creditCardAccounts: [] });
      }
      return json({ report: negativeReport() });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2",
      ),
    );

    const negativeCells =
      html.match(/<td class="report-value-negative" data-negative-value="true">[\s\S]*?<\/td>/g) ??
      [];
    assert.equal(negativeCells.length, 3);
    assert.match(negativeCells[0] ?? "", /sf-money-value">-R\$\s*50,00<\/span>/);
    assert.match(negativeCells[1] ?? "", /sf-money-value">-R\$\s*25,00<\/span>/);
    assert.match(negativeCells[2] ?? "", /sf-money-value">-R\$\s*50,00<\/span>/);
    const expenseRow =
      html.match(
        /<tr class="report-row report-row-expense report-section-row"[\s\S]*?<\/tr>/,
      )?.[0] ?? "";
    assert.doesNotMatch(expenseRow, /report-value-negative/);
    assert.match(html, /sf-money-value">R\$\s*0,00<\/span>/);
  });

  it("rejects two source filters locally before loading source lists", async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls += 1;
      return json({});
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        `http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-07&periods=2&accountId=${ACCOUNT_ID}&cardId=${CARD_ID}`,
      ),
    );

    assert.equal(calls, 0);
    assert.match(html, /data-report-state="filter-error"/);
    assert.match(html, /somente uma conta ou um cartão de crédito/);
  });
});

function installFetchMock(calls: string[], options: MockOptions = {}): void {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === "/api/accounts") {
      if (options.accountStatus) return errorJson(options.accountStatus, "accounts unavailable");
      return json({
        accounts: [
          { id: ACCOUNT_ID, name: "Conta principal", status: "active" },
          { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Reserva", status: "active" },
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            name: "Conta arquivada",
            status: "archived",
          },
        ],
      });
    }
    if (url.pathname === "/api/credit-card-accounts") {
      if (options.cardStatus) return errorJson(options.cardStatus, "cards unavailable");
      return json({
        creditCardAccounts: [
          { id: CARD_ID, name: "Cartão principal", status: "active" },
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "Cartão bloqueado",
            status: "blocked",
          },
          {
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            name: "Cartão arquivado",
            status: "archived",
          },
        ],
      });
    }
    return json({ report: nestedReport() });
  };
}

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

function errorJson(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { code: "TEST_ERROR", message } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
