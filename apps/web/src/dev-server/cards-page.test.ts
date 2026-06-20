import assert from "node:assert/strict";

import { renderCardsPage } from "./cards-page.js";

const originalFetch = globalThis.fetch;

await cardsPageRendersInvoiceWorkspace();

globalThis.fetch = originalFetch;

async function cardsPageRendersInvoiceWorkspace(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-1",
            name: "Cartão Principal",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            maskedIdentifier: "final 9876",
          },
          {
            id: "card-2",
            name: "Cartão Reserva",
            status: "active",
            closingDay: 5,
            dueDay: 15,
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          {
            id: "invoice-1",
            cardId: "card-1",
            status: "open",
            periodStartOn: "2026-06-01",
            periodEndOn: "2026-06-20",
            dueOn: "2026-07-10",
            totalAmountMinor: 17345,
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [{ id: "account-1", name: "Conta Principal" }] });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [{ id: "category-1", name: "Mercado" }] });
    }

    if (url.pathname === "/api/invoices/invoice-1/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-1",
          financialProfileId: "profile-1",
          cardId: "card-1",
          cardName: "Cartão Principal",
          cardMaskedIdentifier: "final 9876",
          status: "open",
          periodStartOn: "2026-06-01",
          closingOn: "2026-06-20",
          dueOn: "2026-07-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 17345,
          totalPaidMinor: 0,
          amountDueMinor: 17345,
          reconciledExpensesMinor: 10000,
          unreconciledExpensesMinor: 7345,
          purchasesCount: 2,
          cardTotals: [
            {
              cardId: "card-1",
              cardName: "Cartão Principal",
              maskedIdentifier: "final 9876",
              limitTotalMinor: 200000,
              limitUsedMinor: 17345,
              limitAvailableMinor: 182655,
              invoiceTotalMinor: 17345,
              invoiceAmountDueMinor: 17345,
            },
          ],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-1/purchases") {
      return jsonResponse({
        purchases: [
          {
            id: "purchase-1",
            financialProfileId: "profile-1",
            cardId: "card-1",
            invoiceId: "invoice-1",
            categoryId: "category-1",
            occurredOn: "2026-06-19",
            description: "Supermercado",
            amountMinor: 10000,
            currency: "BRL",
            status: "reconciled",
          },
          {
            id: "purchase-2",
            financialProfileId: "profile-1",
            cardId: "card-1",
            invoiceId: "invoice-1",
            occurredOn: "2026-06-18",
            description: "Aplicativo de transporte",
            amountMinor: 7345,
            currency: "BRL",
            status: "posted",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPage("session-token");

  assert.match(html, /Faturas e compras/);
  assert.match(html, /Cartão Principal/);
  assert.match(html, /final 9876/);
  assert.match(html, /Vencimento/);
  assert.match(html, /Saldo anterior/);
  assert.match(html, /Conciliado/);
  assert.match(html, /Não conciliado/);
  assert.match(html, /Disponível/);
  assert.match(html, /Supermercado/);
  assert.match(html, /Aplicativo de transporte/);
  assert.match(html, /data-reconciliation-filter/);
  assert.match(html, /data-purchase-search/);
  assert.match(html, /\/api\/invoices\/invoice-1\/close/);
  assert.match(html, /\/api\/invoices\/invoice-1\/pay/);
  assert.match(html, /\/api\/transactions\/purchase-1/);
  assert.doesNotMatch(html, /Novo cartão/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
