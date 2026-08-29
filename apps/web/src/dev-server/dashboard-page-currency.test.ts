import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardPage } from "./dashboard-page.js";

const originalFetch = globalThis.fetch;

describe("dashboard multi-currency contract", () => {
  it(
    "renders ordered currency sections, explicit money and currency-scoped drilldowns",
    async () => {
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        const url = new URL(String(input));
        if (url.pathname === "/api/financial-summary") {
          return jsonResponse({
            currencyBlocks: [
              {
                currency: "BRL",
                availableBalanceMinor: 10_000,
                incomeMinor: 3_000,
                expensesMinor: 1_000,
                plannedCommitmentsMinor: 500,
              },
              {
                currency: "USD",
                availableBalanceMinor: 20_000,
                incomeMinor: 4_000,
                expensesMinor: 2_000,
                plannedCommitmentsMinor: 700,
              },
            ],
            recentItems: [
              {
                description: "Compra ficticia USD",
                kind: "expense",
                amountMinor: 2_000,
                currency: "USD",
                occurredOn: "2026-08-18",
                status: "posted",
              },
            ],
          });
        }
        if (url.pathname === "/api/bank-message-inbox") return jsonResponse({ messages: [] });
        if (url.pathname === "/api/invoices") return jsonResponse({ invoices: [] });
        throw new Error(`Endpoint inesperado no Dashboard: ${url.pathname}${url.search}`);
      };

      try {
        const html = await renderDashboardPage("session-token");
        const brlIndex = html.indexOf('aria-label="Indicadores em BRL"');
        const usdIndex = html.indexOf('aria-label="Indicadores em USD"');

        assert.ok(brlIndex >= 0);
        assert.ok(usdIndex > brlIndex);
        assert.match(html, /aria-label="Moedas disponíveis"/);
        assert.match(html, /href="#currency-BRL">BRL<\/a>/);
        assert.match(html, /href="#currency-USD">USD<\/a>/);
        assert.match(
          html,
          /href="\/lancamentos\?currency=BRL" aria-label="Ver lançamentos em BRL">Ver evidências<\/a>/,
        );
        assert.match(
          html,
          /href="\/lancamentos\?currency=USD" aria-label="Ver lançamentos em USD">Ver evidências<\/a>/,
        );
        assert.match(html, /Compra ficticia USD/);
        assert.match(html, /expense - posted - USD - 18\/08\/2026/);
        assert.equal((html.match(/class="currency-summary"/g) ?? []).length, 2);
        assert.equal((html.match(/href="\/lancamentos\?currency=BRL"/g) ?? []).length >= 4, true);
        assert.equal((html.match(/href="\/lancamentos\?currency=USD"/g) ?? []).length >= 4, true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
