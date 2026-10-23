import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardPage } from "./dashboard-page.js";

const originalFetch = globalThis.fetch;

const brlAccounts = [
  { id: "brl-primary", name: "Conta Principal", status: "active" },
  { id: "brl-reserve", name: "Reserva BRL", status: "active" },
  { id: "brl-archived", name: "Conta Histórica", status: "archived" },
];

describe("dev-server dashboard page", () => {
  it("renders an actionable cockpit on Phase 3B primitives without loading every transaction", async () => {
    const calledPaths: string[] = [];

    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      calledPaths.push(`${url.pathname}${url.search}`);

      if (url.pathname === "/api/financial-summary") {
        return jsonResponse({
          currencyBlocks: [
            {
              currency: "BRL",
              availableBalanceMinor: 500000,
              incomeMinor: 300000,
              expensesMinor: 150000,
              netVariationMinor: 150000,
              plannedCommitmentsMinor: 20000,
              accounts: brlAccounts,
            },
          ],
          recentItems: [],
        });
      }

      if (url.pathname === "/api/cash-flow-projection") {
        assert.equal(url.searchParams.get("horizonDays"), "30");
        return jsonResponse({
          referenceDate: "2026-07-01",
          horizonDays: 30,
          from: "2026-07-02",
          to: "2026-07-31",
          currencyBlocks: [{ currency: "BRL", closingBalanceMinor: 480000 }],
          freeToSpend: {
            referenceDate: "2026-07-01",
            horizonDays: 30,
            currencyBlocks: [
              {
                currency: "BRL",
                status: "available",
                minimumProjectedBalanceMinor: 350000,
                minimumBalanceOn: "2026-07-12",
                freeToSpendMinor: 350000,
                projectedDeficitMinor: 0,
              },
            ],
          },
        });
      }

      if (url.pathname === "/api/bank-message-inbox") {
        assert.equal(url.searchParams.get("status"), "pending_review");
        return jsonResponse({ messages: [{ id: "message-1" }] });
      }

      if (url.pathname === "/api/invoices") {
        assert.equal(url.searchParams.get("status"), "open");
        return jsonResponse({ invoices: [{ dueOn: "2026-07-12" }] });
      }

      throw new Error(`Endpoint inesperado no Dashboard: ${url.pathname}${url.search}`);
    };

    try {
      const html = await renderDashboardPage("session-token-actionable");

      assert.match(html, /Cockpit financeiro/);
      assert.match(html, /Situação financeira atual/);
      assert.match(html, /sem misturar moedas/);
      assert.match(html, /data-quality="complete"/);
      assert.match(html, /Variação líquida do mês/);
      assert.match(
        html,
        /href="#dashboard-evidence-brl-variation" aria-label="Ver evidências em BRL"/,
      );
      assert.match(html, /Compromissos previstos em BRL/);
      assert.match(html, /Projeção de caixa — 30 dias/);
      assert.match(html, /Saldo projetado no fim do horizonte/);
      assert.match(html, /R\$\s*4\.800,00/);
      assert.match(html, /Livre para gastar hoje/);
      assert.match(html, /R\$\s*3\.500,00/);
      assert.match(html, /Déficit projetado/);
      assert.match(html, /Menor saldo projetado em 12\/07\/2026/);
      assert.match(html, /view=cash-flow/);
      assert.match(
        html,
        /href="#dashboard-evidence-brl-available" aria-label="Ver evidências em BRL"/,
      );
      assert.match(
        html,
        /href="\/lancamentos\?currency=BRL&amp;accountId=brl-primary&amp;kind=income&amp;evidence=posted">Conta Principal<\/a>/,
      );
      assert.match(
        html,
        /href="\/lancamentos\?currency=BRL&amp;accountId=brl-reserve&amp;kind=income&amp;evidence=posted">Reserva BRL<\/a>/,
      );
      assert.match(
        html,
        /<span class="evidence-static"><strong>Conta Histórica \(inativa\)<\/strong><small>Conta histórica incluída no agregado; sem ação operacional neste fluxo\.<\/small><\/span>/,
      );
      assert.doesNotMatch(html, /accountId=brl-archived/);
      const availableEvidence =
        html.match(/<details id="dashboard-evidence-brl-available"[\s\S]*?<\/details>/)?.[0] ?? "";
      assert.match(availableEvidence, /accountId=brl-primary/);
      assert.match(availableEvidence, /accountId=brl-reserve/);
      assert.doesNotMatch(availableEvidence, /Conta Histórica/);
      assert.match(html, /1 item aguardando revisão na inbox/);
      assert.match(html, /1 fatura de cartão em aberto/);
      assert.match(html, /href="\/inbox">Abrir inbox/);
      assert.match(html, /href="\/cartoes">Ver cartões/);
      assert.match(html, /Ferramentas de decisão/);
      assertCockpitHierarchy(html);
      assert.equal((html.match(/class="sf-metric-card"/g) ?? []).length, 2);
      assert.equal((html.match(/class="dashboard-supporting-metric"/g) ?? []).length, 3);
      assert.ok(
        html.indexOf('class="next-actions"') < html.indexOf('class="dashboard-supporting-section"'),
      );
      assert.match(html, /\.dashboard-metric \.sf-metric-card \{ display: grid;/);
      assert.match(html, /text-align: left; white-space: nowrap;/);
      assert.equal((html.match(/class="evidence-detail"/g) ?? []).length, 5);
      const intrusive = html.replace(
        '<section class="next-actions"',
        '<section class="decision-section" aria-label="Painel intrusivo"></section><section class="next-actions"',
      );
      assert.throws(() => assertCockpitHierarchy(intrusive));
      assert.match(html, /Planejamento financeiro/);
      assert.match(html, /Tendências e períodos/);
      assert.match(html, /Assistente financeiro/);
      assert.match(html, /href="\/planejamento">Abrir planejamento/);
      assert.match(html, /href="\/relatorios">Abrir relatórios/);
      assert.match(html, /href="\/assistente">Abrir assistente/);
      assert.equal(
        calledPaths.some((path) => path.startsWith("/api/transactions")),
        false,
      );
      assert.equal(calledPaths.includes("/api/payables-receivables"), false);

      assert.match(html, /class="sf-page-container dashboard-page"/);
      assert.match(html, /class="sf-page-header"/);
      assert.match(html, /class="sf-summary-grid"/);
      assert.match(html, /class="sf-metric-card"/);
      assert.match(html, /class="evidence-detail"/);
      assert.match(html, /@media \(max-width: 760px\)/);
      assert.match(html, /\.metric-drilldown:focus-visible/);
      assert.match(
        html,
        /\.currency-summary \.sf-summary-grid, \.dashboard-supporting-metrics, \.decision-grid, \.cash-flow-dashboard-grid \{ grid-template-columns: 1fr;/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("renders a reachable loading state when dashboard sources are still pending", async () => {
    globalThis.fetch = async (): Promise<Response> => new Promise<Response>(() => undefined);

    try {
      const html = await renderDashboardPage("session-token-loading");
      assert.match(html, /data-state="loading"/);
      assert.match(html, /Carregando resumo financeiro/);
      assert.match(html, /window\.setTimeout\(\(\) => window\.location\.reload\(\), 250\)/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows a canonical empty state when there are no pending actions", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));

      if (url.pathname === "/api/financial-summary") {
        return jsonResponse({
          currencyBlocks: [
            {
              currency: "BRL",
              availableBalanceMinor: 500000,
              incomeMinor: 300000,
              expensesMinor: 150000,
              netVariationMinor: 150000,
              plannedCommitmentsMinor: 0,
              accounts: brlAccounts,
            },
          ],
          recentItems: [],
        });
      }

      if (url.pathname === "/api/cash-flow-projection") {
        assert.equal(url.searchParams.get("horizonDays"), "30");
        return jsonResponse({
          referenceDate: "2026-07-01",
          horizonDays: 30,
          from: "2026-07-02",
          to: "2026-07-31",
          currencyBlocks: [{ currency: "BRL", closingBalanceMinor: 480000 }],
        });
      }

      if (url.pathname === "/api/bank-message-inbox") return jsonResponse({ messages: [] });
      if (url.pathname === "/api/invoices") return jsonResponse({ invoices: [] });
      throw new Error(`Endpoint inesperado no Dashboard: ${url.pathname}${url.search}`);
    };

    try {
      const html = await renderDashboardPage("session-token-empty");
      assert.match(html, /Nenhuma pendência agora\./);
      assert.match(html, /class="sf-state-panel" data-state="empty"/);
      assert.doesNotMatch(html, /\/pagar-receber/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces a partial state when an optional operational source fails", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === "/api/financial-summary") {
        return jsonResponse({
          currencyBlocks: [
            {
              currency: "BRL",
              availableBalanceMinor: 500000,
              incomeMinor: 300000,
              expensesMinor: 150000,
              netVariationMinor: 150000,
              plannedCommitmentsMinor: 0,
              accounts: brlAccounts,
            },
          ],
          recentItems: [],
        });
      }
      if (url.pathname === "/api/cash-flow-projection") {
        assert.equal(url.searchParams.get("horizonDays"), "30");
        return jsonResponse({
          referenceDate: "2026-07-01",
          horizonDays: 30,
          from: "2026-07-02",
          to: "2026-07-31",
          currencyBlocks: [{ currency: "BRL", closingBalanceMinor: 480000 }],
        });
      }

      if (url.pathname === "/api/bank-message-inbox") {
        return new Response(JSON.stringify({ error: "temporarily unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      if (url.pathname === "/api/invoices") return jsonResponse({ invoices: [] });
      throw new Error(`Endpoint inesperado no Dashboard: ${url.pathname}${url.search}`);
    };

    try {
      const html = await renderDashboardPage("session-token-partial");
      assert.match(html, /data-quality="partial"/);
      assert.match(html, /Dados parciais/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function assertCockpitHierarchy(html: string): void {
  const position = html.indexOf('id="currency-BRL"');
  const action = html.indexOf('<section class="next-actions"');
  const horizon = html.indexOf('class="cash-flow-section"');
  const secondary = html.indexOf('class="decision-section"');
  const supporting = html.indexOf('class="dashboard-supporting-section"');
  const evidence = html.indexOf('class="dashboard-evidence-index"');
  assert.ok(position >= 0, "Posição por moeda deve existir");
  assert.ok(action > position, "Próxima ação deve seguir o saldo e a variação");
  assert.ok(supporting > action, "Indicadores complementares não podem preceder a próxima ação");
  assert.ok(horizon > supporting, "Horizonte não pode encobrir os complementos");
  assert.ok(secondary > horizon, "Módulos secundários devem ficar após o horizonte");
  assert.ok(evidence > secondary, "Índice de evidências não pode ocupar a dobra inicial");
}
