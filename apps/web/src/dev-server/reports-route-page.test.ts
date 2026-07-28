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

  it("renders the category evolution matrix with accounts, explicit filters and accessible table", async () => {
    const paths: string[] = [];
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/api/accounts") {
        assert.equal(url.searchParams.get("status"), "active");
        assert.equal(url.searchParams.get("profileId"), "profile-1");
        return jsonResponse({ accounts: [] });
      }
      assert.equal(url.pathname, "/api/reports/category-evolution");
      assert.equal(url.searchParams.get("interval"), "monthly");
      assert.equal(url.searchParams.get("start"), "2026-06");
      assert.equal(url.searchParams.get("periods"), "2");
      assert.equal(url.searchParams.get("profileId"), "profile-1");
      assert.equal(url.searchParams.has("accountId"), false);
      return jsonResponse({ report: readyReport() });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=2&profileId=profile-1",
      ),
      new Date("2026-07-28T12:00:00.000Z"),
    );

    assert.equal(paths.length, 2);
    assert.match(html, /data-report-state="ready"/);
    assert.match(html, /<table class="evolution-table"[^>]*>/);
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
    assert.match(html, /<select id="report-account" name="accountId"/);
    assert.match(html, /<option value="" selected>Todas as contas<\/option>/);
    assert.match(
      html,
      /href="\/relatorios\?view=category-evolution&interval=annual&profileId=profile-1"/,
    );
    assert.doesNotMatch(html, /href="\/relatorios\?view=category-evolution[^\"]*(start|periods)=/);
  });

  it("preserves raw invalid filters in the correction form without requesting the API", async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls += 1;
      return jsonResponse({});
    };

    const invalidInterval = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=quarterly&start=2026-06&periods=2",
      ),
    );
    assert.match(invalidInterval, /data-report-state="filter-error"/);
    assert.match(invalidInterval, /name="interval" value="quarterly"/);
    assert.match(invalidInterval, /data-invalid-filter="interval"/);
    assert.match(invalidInterval, /<code>quarterly<\/code>/);

    const invalidStart = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-13&periods=2",
      ),
    );
    assert.match(invalidStart, /data-report-state="filter-error"/);
    assert.match(
      invalidStart,
      /id="report-start" type="text" name="start" value="2026-13" aria-invalid="true" data-invalid-filter="start"/,
    );

    const invalidPeriods = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=abc",
      ),
    );
    assert.match(invalidPeriods, /data-report-state="filter-error"/);
    assert.match(
      invalidPeriods,
      /id="report-periods" type="text" name="periods" value="abc" aria-invalid="true" data-invalid-filter="periods"/,
    );

    const invalidAccount = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=2&accountId=invalid",
      ),
    );
    assert.match(invalidAccount, /data-report-state="filter-error"/);
    assert.match(invalidAccount, /value="invalid" selected>Conta selecionada indisponível/);
    assert.match(invalidAccount, /data-invalid-filter="accountId"/);
    assert.equal(calls, 0);
  });

  it("renders an accessible currency-neutral matrix when the period has no movements", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
      return jsonResponse({ report: emptyReport() });
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=2",
      ),
    );

    assert.match(html, /data-report-state="empty"/);
    assert.match(html, /Matriz sem movimentos e sem moeda definida/);
    assert.match(html, /aria-hidden="true">Jun\/26/);
    assert.match(html, /Junho de 2026/);
    assert.match(html, /Julho de 2026/);
    assert.match(html, /scope="row"[^>]*><span>Receitas<\/span>/);
    assert.match(html, /scope="row"[^>]*><span>Despesas<\/span>/);
    assert.match(html, /scope="row"[^>]*><span>Resultado<\/span>/);
    assert.doesNotMatch(html, /R\$|US\$/);
  });

  it("renders an API error without presenting a partial report", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
      return errorResponse();
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=2",
      ),
    );

    assert.match(html, /data-report-state="api-error"/);
    assert.doesNotMatch(html, /data-report-state="ready"/);
    assert.doesNotMatch(html, /class="currency-report-list"/);
  });

  it("stops safely when accounts cannot be loaded", async () => {
    let reportCalls = 0;
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/reports/category-evolution") reportCalls += 1;
      return errorResponse();
    };

    const html = await renderReportsRoutePage(
      "token",
      new URL(
        "http://localhost/relatorios?view=category-evolution&interval=monthly&start=2026-06&periods=2&accountId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    );

    assert.match(html, /Não foi possível carregar as contas/);
    assert.match(html, /value="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" selected/);
    assert.equal(reportCalls, 0);
  });

  it("preserves all consolidated installment indicators, groupings and explicit tenant navigation", async () => {
    const paths: string[] = [];
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/api/installments") {
        assert.equal(url.searchParams.get("profileId"), "profile-1");
        return jsonResponse({
          installments: [
            installment(
              "i-posted",
              "posted",
              yesterday,
              15000,
              "Notebook",
              "Principal",
              "Tecnologia",
            ),
            installment(
              "i-overdue",
              "planned",
              yesterday,
              5000,
              "Assinatura",
              "Principal",
              "Assinaturas",
              true,
            ),
            installment(
              "i-future",
              "planned",
              tomorrow,
              7000,
              "Curso",
              "Reserva",
              "Tecnologia",
              true,
            ),
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
    assert.match(html, /Abertas\/planejadas<\/span><strong>2<\/strong>/);
    assert.match(html, /Postadas\/fechadas<\/span><strong>1<\/strong>/);
    assert.match(html, /Vencidas<\/span><strong>1<\/strong>/);
    assert.match(html, /Futuras<\/span><strong>1<\/strong>/);
    assert.match(html, /Total mensal<\/span><strong>3<\/strong>/);
    assert.match(html, /Comprometimento por mês/);
    assert.match(html, /Por cartão/);
    assert.match(html, /Por categoria/);
    assert.match(html, /data-aggregate-kind="month"/);
    assert.match(html, /data-aggregate-kind="card"/);
    assert.match(html, /data-aggregate-kind="category"/);
    assert.match(html, /Principal/);
    assert.match(html, /Reserva/);
    assert.match(html, /Tecnologia/);
    assert.match(html, /Assinaturas/);
    assert.match(html, /Notebook/);
    assert.match(html, /3 registros/);
    assert.match(html, /name="view" value="installments"/);
    assert.match(html, /name="profileId" value="profile-1"/);
  });
});

function readyReport() {
  return {
    interval: "monthly",
    start: "2026-06",
    periodCount: 2,
    periods: periods(),
    currencyBlocks: [
      {
        currency: "BRL",
        income: series([100000, 120000], [null, null]),
        incomeCategories: [category("income-1", "Salário", "active", [100000, 120000], [100, 100])],
        expense: series([40000, 30000], [40, 25]),
        expenseCategories: [
          category("expense-1", "Moradia", "archived", [40000, 30000], [100, 100]),
        ],
        result: series([60000, 90000], [60, 75]),
      },
    ],
  };
}

function emptyReport() {
  return {
    interval: "monthly",
    start: "2026-06",
    periodCount: 2,
    periods: periods(),
    currencyBlocks: [],
  };
}

function periods() {
  return [
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
  ];
}

function category(
  categoryId: string,
  name: string,
  status: string,
  amounts: number[],
  percentages: Array<number | null>,
) {
  return { categoryId, name, status, series: series(amounts, percentages), children: [] };
}

function installment(
  id: string,
  status: string,
  dueOn: string,
  amountMinor: number,
  description: string,
  cardName: string,
  categoryName: string,
  recurring = false,
) {
  return {
    id,
    status,
    sequenceNumber: 1,
    totalInstallments: status === "posted" ? 2 : 1,
    dueOn,
    amountMinor,
    currency: "BRL",
    ...(recurring
      ? { recurrence: { id: `r-${id}`, description, status: "active" } }
      : { transaction: { id: `t-${id}`, description, status } }),
    card: { id: `card-${cardName}`, name: cardName, status: "active" },
    category: {
      id: `cat-${categoryName}`,
      name: categoryName,
      kind: "expense",
      status: "active",
    },
  };
}

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

function errorResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "API_UNEXPECTED_ERROR",
        message: "Não foi possível concluir a ação. Tente novamente.",
        correlationId: "corr-report-test",
      },
    }),
    { status: 500, headers: { "content-type": "application/json" } },
  );
}
