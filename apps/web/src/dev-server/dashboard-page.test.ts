import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardPage } from "./dashboard-page.js";

const originalFetch = globalThis.fetch;

describe("dev-server dashboard page", () => {
  it("highlights planned statement items, inbox review items and open invoices with quick links", async () => {
    const calledPaths: string[] = [];

    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      calledPaths.push(url.pathname);

      if (url.pathname === "/api/financial-summary") {
        return jsonResponse({
          availableBalanceMinor: 500000,
          incomeMinor: 300000,
          expensesMinor: 150000,
          plannedCommitmentsMinor: 20000,
          recentItems: [],
        });
      }

      if (url.pathname === "/api/transactions") {
        assert.equal(url.searchParams.get("status"), "all");
        return jsonResponse({
          transactions: [
            {
              id: "planned-expense",
              description: "Aluguel previsto",
              kind: "expense",
              status: "planned",
              amountMinor: 20000,
              occurredOn: "2026-07-10",
              plannedOn: "2026-07-10",
            },
            {
              id: "planned-income",
              description: "Receita prevista",
              kind: "income",
              status: "planned",
              amountMinor: 50000,
              occurredOn: "2026-07-05",
              plannedOn: "2026-07-05",
            },
          ],
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

      return jsonResponse({});
    };

    const html = await renderDashboardPage("session-token");

    assert.match(html, /Visão geral financeira/);
    assert.doesNotMatch(html, /Demo seguro|Perfil pessoal demo/);
    assert.match(html, /Próximas ações/);
    assert.match(html, /2 lançamentos previstos no Extrato/);
    assert.match(html, /Próximo vencimento em 05\/07\/2026/);
    assert.match(html, /1 item aguardando revisão na inbox/);
    assert.match(html, /1 fatura de cartão em aberto/);
    assert.match(html, /href="\/lancamentos">Ver extrato/);
    assert.match(html, /href="\/inbox">Abrir inbox/);
    assert.match(html, /href="\/cartoes">Ver cartões/);
    assert.match(html, /class="quick-links"/);
    assert.match(html, /href="\/lancamentos" title="Ver extrato da conta">[\s\S]*?Extrato<\/a>/);
    assert.doesNotMatch(html, /\/pagar-receber/);
    assert.equal(calledPaths.includes("/api/payables-receivables"), false);

    globalThis.fetch = originalFetch;
  });

  it("shows a compact positive state when there are no pending actions", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));

      if (url.pathname === "/api/financial-summary") {
        return jsonResponse({
          availableBalanceMinor: 500000,
          incomeMinor: 300000,
          expensesMinor: 150000,
          plannedCommitmentsMinor: 0,
          recentItems: [],
        });
      }

      if (url.pathname === "/api/transactions") {
        return jsonResponse({ transactions: [] });
      }

      if (url.pathname === "/api/bank-message-inbox") {
        return jsonResponse({ messages: [] });
      }

      if (url.pathname === "/api/invoices") {
        return jsonResponse({ invoices: [] });
      }

      return jsonResponse({});
    };

    const html = await renderDashboardPage("session-token");

    assert.match(html, /Nenhuma pendência agora\./);
    assert.doesNotMatch(html, /Demo seguro|Perfil pessoal demo/);
    assert.doesNotMatch(html, /\/pagar-receber/);

    globalThis.fetch = originalFetch;
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
