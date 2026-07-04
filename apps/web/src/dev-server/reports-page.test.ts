import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderReportsPage } from "./reports-page.js";

const originalFetch = globalThis.fetch;

describe("dev-server reports page", () => {
  it("renders consolidated installment metrics, groupings and read-only rows", async () => {
    const calledPaths: string[] = [];

    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      calledPaths.push(`${url.pathname}${url.search}`);

      if (url.pathname === "/api/installments") {
        assert.equal(url.searchParams.get("status"), "all");
        assert.equal(url.searchParams.get("dueFrom"), "2099-08-01");
        assert.equal(url.searchParams.get("dueTo"), "2099-08-31");
        assert.equal(url.searchParams.get("cardId"), "card-1");
        assert.equal(url.searchParams.get("categoryId"), "category-1");

        return jsonResponse({
          installments: [
            {
              id: "installment-planned",
              status: "planned",
              sequenceNumber: 1,
              totalInstallments: 3,
              dueOn: "2099-08-05",
              amountMinor: 15000,
              currency: "BRL",
              transaction: { id: "transaction-1", description: "Notebook", status: "planned" },
              invoice: {
                id: "invoice-open",
                status: "open",
                periodStartOn: "2099-08-01",
                periodEndOn: "2099-08-31",
              },
              card: { id: "card-1", name: "Cartão Principal", status: "active" },
              category: { id: "category-1", name: "Tecnologia", kind: "expense", status: "active" },
            },
            {
              id: "installment-posted",
              status: "posted",
              sequenceNumber: 2,
              totalInstallments: 6,
              dueOn: "2099-08-10",
              amountMinor: 10000,
              currency: "BRL",
              recurrence: { id: "recurrence-1", description: "Assinatura", status: "active" },
              invoice: {
                id: "invoice-paid",
                status: "paid",
                periodStartOn: "2099-08-01",
                periodEndOn: "2099-08-31",
              },
              card: { id: "card-1", name: "Cartão Principal", status: "active" },
              category: { id: "category-1", name: "Tecnologia", kind: "expense", status: "active" },
            },
            {
              id: "installment-cancelled",
              status: "cancelled",
              sequenceNumber: 3,
              totalInstallments: 3,
              dueOn: "2099-08-15",
              amountMinor: 9999,
              currency: "BRL",
              transaction: { id: "transaction-2", description: "Compra cancelada", status: "cancelled" },
              invoice: {
                id: "invoice-cancelled",
                status: "cancelled",
                periodStartOn: "2099-08-01",
                periodEndOn: "2099-08-31",
              },
              card: { id: "card-1", name: "Cartão Principal", status: "active" },
              category: { id: "category-1", name: "Tecnologia", kind: "expense", status: "active" },
            },
          ],
        });
      }

      if (url.pathname === "/api/cards") {
        assert.equal(url.searchParams.get("status"), "all");
        return jsonResponse({ cards: [{ id: "card-1", name: "Cartão Principal" }] });
      }

      if (url.pathname === "/api/categories") {
        assert.equal(url.searchParams.get("kind"), "expense");
        return jsonResponse({ categories: [{ id: "category-1", name: "Tecnologia" }] });
      }

      return jsonResponse({});
    };

    const html = await renderReportsPage(
      "session-token",
      new URL("http://localhost/relatorios?month=2099-08&cardId=card-1&categoryId=category-1&status=all"),
    );

    assert.equal(
      calledPaths.includes(
        "/api/installments?status=all&dueFrom=2099-08-01&dueTo=2099-08-31&cardId=card-1&categoryId=category-1",
      ),
      true,
    );
    assert.match(html, /Parcelas consolidadas/);
    assert.match(html, /Somente leitura/);
    assert.match(html, /<input type="month" name="month" value="2099-08"/);
    assert.match(html, /<option value="card-1" selected>Cartão Principal<\/option>/);
    assert.match(html, /<option value="category-1" selected>Tecnologia<\/option>/);
    assert.match(html, /Abertas\/planejadas/);
    assert.match(html, /Postadas\/fechadas/);
    assert.match(html, /Futuras/);
    assert.match(html, /Total mensal/);
    assert.match(html, /R\$\s*150,00/);
    assert.match(html, /R\$\s*100,00/);
    assert.match(html, /R\$\s*250,00/);
    assert.match(html, /Agosto de 2099/);
    assert.match(html, /Cartão Principal/);
    assert.match(html, /Tecnologia/);
    assert.match(html, /Notebook/);
    assert.match(html, /1\/3/);
    assert.match(html, /Assinatura/);
    assert.match(html, /Fatura paga/);
    assert.match(html, /Compra cancelada/);
    assert.doesNotMatch(html, /data-api-form/);
    assert.doesNotMatch(html, /Salvar/);

    globalThis.fetch = originalFetch;
  });

  it("shows an empty state for periods without installments", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));

      if (url.pathname === "/api/installments") {
        return jsonResponse({ installments: [] });
      }

      if (url.pathname === "/api/cards") {
        return jsonResponse({ cards: [] });
      }

      if (url.pathname === "/api/categories") {
        return jsonResponse({ categories: [] });
      }

      return jsonResponse({});
    };

    const html = await renderReportsPage(
      "session-token",
      new URL("http://localhost/relatorios?month=2099-09"),
    );

    assert.match(html, /Nenhuma parcela no período\./);
    assert.match(html, /Ajuste mês, cartão, categoria ou status/);

    globalThis.fetch = originalFetch;
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
