import assert from "node:assert/strict";

import {
  renderCardsPageWithMonthNavigation,
  resolveInvoiceDay,
} from "./cards-page-month-navigation.js";

const invoice = {
  id: "invoice-1",
  cardId: "card-1",
  periodStartOn: "2028-01-01",
  periodEndOn: "2028-01-31",
};

assert.equal(resolveInvoiceDay("2028-01-01", invoice), "2028-01-01");
assert.equal(resolveInvoiceDay("2028-01-31", invoice), "2028-01-31");
assert.equal(resolveInvoiceDay("2028-01-10", invoice), "2028-01-10");
assert.equal(resolveInvoiceDay("2027-12-31", invoice), undefined);
assert.equal(resolveInvoiceDay("2028-02-01", invoice), undefined);
assert.equal(resolveInvoiceDay("2028-02-30", invoice), undefined);
assert.equal(resolveInvoiceDay("not-a-date", invoice), undefined);
assert.equal(resolveInvoiceDay(undefined, invoice), undefined);
assert.equal(resolveInvoiceDay("2028-01-10", undefined), undefined);

const originalFetch = globalThis.fetch;
try {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "token",
    new URL(
      "http://localhost/cartoes?cardId=card-1&month=2028-01&day=2028-01-10&sort=amount_desc",
    ),
  );

  const dayInput = /<input[^>]*name="day"[^>]*>/i.exec(html)?.[0] ?? "";
  assert.match(dayInput, /value="2028-01-10"/);
  assert.match(dayInput, /min="2028-01-01"/);
  assert.match(dayInput, /max="2028-01-31"/);
  assert.match(dayInput, /data-card-day-input/);

  assert.match(html, /Compra do dia selecionado/);
  assert.doesNotMatch(html, /Compra de outro dia/);
  assert.match(html, /data-card-day-summary/);
  assert.match(html, /Resumo do dia/);
  assert.match(html, /10\/01\/2028/);
  assert.match(html, /Fatura completa/);

  const clearLink = /<a[^>]*data-clear-card-day[^>]*>/i.exec(html)?.[0] ?? "";
  assert.match(clearLink, /cardId=card-1/);
  assert.match(clearLink, /month=2028-01/);
  assert.match(clearLink, /sort=amount_desc/);
  assert.doesNotMatch(clearLink, /(?:\?|&amp;)day=/);

  assert.match(html, /Total conciliado/);
  assert.match(html, /Total não conciliado/);
  assert.match(html, /100,00/);
  assert.match(html, /\.card-filter \.sort-field\{grid-column:6;min-width:0\}/);
} finally {
  globalThis.fetch = originalFetch;
}

function installFetch(): void {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-1",
            name: "Cartão principal",
            status: "active",
            closingDay: 31,
            dueDay: 10,
          },
        ],
      });
    }
    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          {
            ...invoice,
            status: "open",
            dueOn: "2028-02-10",
            totalAmountMinor: 12500,
          },
        ],
      });
    }
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") {
      return jsonResponse({ instruments: [] });
    }
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    if (url.pathname === "/api/invoices/invoice-1/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-1",
          financialProfileId: "profile-1",
          cardId: "card-1",
          cardName: "Cartão principal",
          status: "open",
          periodStartOn: "2028-01-01",
          closingOn: "2028-01-31",
          dueOn: "2028-02-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 12500,
          totalPaidMinor: 0,
          amountDueMinor: 12500,
          reconciledExpensesMinor: 10000,
          unreconciledExpensesMinor: 2500,
          purchasesCount: 2,
          cardTotals: [],
        },
      });
    }
    if (url.pathname === "/api/invoices/invoice-1/purchases") {
      return jsonResponse({
        purchases: [
          purchase(
            "purchase-selected",
            "2028-01-10",
            "Compra do dia selecionado",
            10000,
            "reconciled",
          ),
          purchase("purchase-other", "2028-01-11", "Compra de outro dia", 2500, "posted"),
        ],
      });
    }

    throw new Error(`Unexpected API path: ${url.pathname}${url.search}`);
  };
}

function purchase(
  id: string,
  occurredOn: string,
  description: string,
  amountMinor: number,
  status: string,
): Record<string, unknown> {
  return {
    id,
    financialProfileId: "profile-1",
    cardId: "card-1",
    invoiceId: "invoice-1",
    occurredOn,
    description,
    amountMinor,
    currency: "BRL",
    status,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
