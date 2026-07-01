import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardPage } from "./pages.js";

const originalFetch = globalThis.fetch;

describe("dev-server dashboard page", () => {
  it("highlights pending payables/receivables, inbox review items and open invoices with quick links", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));

      if (url.pathname === "/api/financial-summary") {
        return jsonResponse({
          availableBalanceMinor: 500000,
          incomeMinor: 300000,
          expensesMinor: 150000,
          plannedCommitmentsMinor: 20000,
          recentItems: [],
        });
      }

      if (url.pathname === "/api/payables-receivables") {
        assert.equal(url.searchParams.get("status"), "pending");
        return jsonResponse({
          payablesReceivables: [
            { kind: "payable", dueOn: "2026-07-10" },
            { kind: "receivable", dueOn: "2026-07-05" },
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

    assert.match(html, /Próximas ações/);
    assert.match(html, /2 contas a pagar ou receber pendentes/);
    assert.match(html, /Próximo vencimento em 05\/07\/2026/);
    assert.match(html, /1 item aguardando revisão na inbox/);
    assert.match(html, /1 fatura de cartão em aberto/);
    assert.match(html, /href="\/pagar-receber">Ver pagar e receber/);
    assert.match(html, /href="\/inbox">Abrir inbox/);
    assert.match(html, /href="\/cartoes">Ver cartões/);
    assert.match(html, /class="quick-links"/);
    assert.match(html, /href="\/lancamentos">Extrato/);

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

      if (url.pathname === "/api/payables-receivables") {
        return jsonResponse({ payablesReceivables: [] });
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

    globalThis.fetch = originalFetch;
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
