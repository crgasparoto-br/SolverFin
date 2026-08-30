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
        /href="\/lancamentos\?currency=BRL&amp;accountId=brl-archived&amp;kind=income&amp;evidence=posted">Conta Histórica \(inativa\)<\/a>/,
      );
      const availableEvidence =
        html.match(/<details id="dashboard-evidence-brl-available"[\s\S]*?<\/details>/)?.[0] ?? "";
      assert.match(availableEvidence, /accountId=brl-primary/);
      assert.match(availableEvidence, /accountId=brl-reserve/);
      assert.doesNotMatch(availableEvidence, /accountId=brl-archived/);
      assert.match(html, /1 item aguardando revisão na inbox/);
      assert.match(html, /1 fatura de cartão em aberto/);
      assert.match(html, /href="\/inbox">Abrir inbox/);
      assert.match(html, /href="\/cartoes">Ver cartões/);
      assert.match(html, /Ferramentas de decisão/);
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
        /\.currency-summary \.sf-summary-grid, \.decision-grid \{ grid-template-columns: 1fr;/,
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