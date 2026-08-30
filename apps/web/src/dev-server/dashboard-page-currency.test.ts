import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardPage } from "./dashboard-page.js";

const originalFetch = globalThis.fetch;

describe("dashboard multi-currency contract", () => {
  it("renders ordered currency sections, explicit money and complete per-account evidence", async () => {
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
              netVariationMinor: 2_000,
              plannedCommitmentsMinor: 500,
              accounts: [
                { id: "brl-primary", name: "Conta BRL Principal", status: "active" },
                { id: "brl-reserve", name: "Conta BRL Reserva", status: "active" },
              ],
            },
            {
              currency: "USD",
              availableBalanceMinor: 20_000,
              incomeMinor: 4_000,
              expensesMinor: 2_000,
              netVariationMinor: 2_000,
              plannedCommitmentsMinor: 700,
              accounts: [{ id: "usd-primary", name: "Conta USD", status: "active" }],
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
      const html = await renderDashboardPage("session-token-multi-currency");
      const brlIndex = html.indexOf('aria-label="Indicadores em BRL"');
      const usdIndex = html.indexOf('aria-label="Indicadores em USD"');

      assert.ok(brlIndex >= 0);
      assert.ok(usdIndex > brlIndex);
      assert.match(html, /aria-label="Moedas disponíveis"/);
      assert.match(html, /href="#currency-BRL">BRL<\/a>/);
      assert.match(html, /href="#currency-USD">USD<\/a>/);

      for (const currency of ["BRL", "USD"]) {
        const normalized = currency.toLowerCase();
        for (const key of ["available", "variation", "income", "expense", "planned"]) {
          assert.match(html, new RegExp(`href="#dashboard-evidence-${normalized}-${key}"`));
        }
      }

      assert.match(
        html,
        /href="\/lancamentos\?currency=BRL&amp;accountId=brl-primary&amp;kind=income&amp;evidence=posted">Conta BRL Principal<\/a>/,
      );
      assert.match(
        html,
        /href="\/lancamentos\?currency=BRL&amp;accountId=brl-reserve&amp;kind=income&amp;evidence=posted">Conta BRL Reserva<\/a>/,
      );
      assert.match(
        html,
        /href="\/lancamentos\?currency=USD&amp;accountId=usd-primary&amp;kind=expense&amp;evidence=planned">Conta USD<\/a>/,
      );

      assert.match(html, /Variação líquida do mês/);
      assert.match(html, /Compra ficticia USD/);
      assert.match(html, /expense - posted - USD - 18\/08\/2026/);
      assert.equal((html.match(/class="currency-summary"/g) ?? []).length, 2);
      assert.equal((html.match(/class="sf-metric-card"/g) ?? []).length, 10);
      assert.equal((html.match(/class="evidence-detail"/g) ?? []).length, 10);
      assert.match(html, /class="sf-summary-grid"/);
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
