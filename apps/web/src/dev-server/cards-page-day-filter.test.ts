import assert from "node:assert/strict";

import {
  renderCardsPageWithMonthNavigation,
  resolveInvoiceDay,
} from "./cards-page-month-navigation.js";

const originalFetch = globalThis.fetch;

try {
  assert.equal(resolveInvoiceDay("2028-01-01", invoiceRecord()), "2028-01-01");
  assert.equal(resolveInvoiceDay("2028-01-31", invoiceRecord()), "2028-01-31");
  assert.equal(resolveInvoiceDay("2027-12-31", invoiceRecord()), undefined);
  assert.equal(resolveInvoiceDay("2028-02-01", invoiceRecord()), undefined);
  assert.equal(resolveInvoiceDay("2028-02-30", invoiceRecord()), undefined);

  await assertFullInvoice();
  await assertFilteredDay();
  await assertDayWithoutPurchases();
  await assertOutsidePeriodIsIgnored();
} finally {
  globalThis.fetch = originalFetch;
}

async function assertFullInvoice(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2028-01&sort=amount_desc"),
  );

  assert.match(html, /name="day" value="" min="2028-01-01" max="2028-01-31" data-card-day-input/);
  assert.match(html, /Compra do dia selecionado/);
  assert.match(html, /Compra de outro dia/);
  assert.doesNotMatch(html, /data-card-day-summary/);
  assert.doesNotMatch(html, /data-clear-card-day/);
  assert.match(html, /grid-template-columns:[^}]+!important/);
  assert.match(html, /\.card-filter \.sort-field\{grid-column:6;min-width:0\}/);
}

async function assertFilteredDay(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2028-01&day=2028-01-10&sort=amount_desc"),
  );

  assert.match(
    html,
    /name="day" value="2028-01-10" min="2028-01-01" max="2028-01-31" data-card-day-input/,
  );
  assert.match(html, /Compra do dia selecionado/);
  assert.doesNotMatch(html, /Compra de outro dia/);
  assert.match(html, /data-card-day-summary/);
  assert.match(html, /Resumo do dia/);
  assert.match(html, /10\/01\/2028/);
  assert.match(html, />Compras<\/dt><dd>1<\/dd>/);
  assert.match(html, />Total conciliado<\/dt><dd class="debit">-R\$[^<]*100,00<\/dd>/);
  assert.match(html, />Total não conciliado<\/dt><dd class="debit">-R\$[^<]*0,00<\/dd>/);
  assert.match(html, /data-card-day-period>Compras de 10\/01\/2028/);
  assert.match(
    html,
    /href="\/cartoes\?cardId=card-1&amp;month=2028-01&amp;sort=amount_desc&amp;invoiceId=invoice-1" data-clear-card-day role="button">Fatura completa<\/a>/,
  );
  assert.doesNotMatch(html, /href="[^"]*day=2028-01-10[^"]*" aria-label="Fatura anterior"/);
  assert.match(html, /clearDay\(\)/);
  assert.match(html, /dayInput\.disabled = true/);
}

async function assertDayWithoutPurchases(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2028-01&day=2028-01-15"),
  );

  assert.match(html, /Nenhuma compra neste dia\./);
  assert.doesNotMatch(html, /Compra do dia selecionado/);
  assert.doesNotMatch(html, /Compra de outro dia/);
  assert.match(html, />Compras<\/dt><dd>0<\/dd>/);
}

async function assertOutsidePeriodIsIgnored(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2028-01&day=2028-02-01"),
  );

  assert.match(html, /name="day" value="" min="2028-01-01" max="2028-01-31"/);
  assert.match(html, /Compra do dia selecionado/);
  assert.match(html, /Compra de outro dia/);
  assert.doesNotMatch(html, /data-card-day-summary/);
  assert.doesNotMatch(html, /data-clear-card-day/);
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
      return jsonResponse({ invoices: [invoiceRecord()] });
    }
    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }
    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [] });
    }
    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") {
      return jsonResponse({ instruments: [] });
    }
    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [] });
    }
    if (url.pathname === "/api/invoices/invoice-1/summary") {
      return jsonResponse({ summary: invoiceSummary() });
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

function invoiceRecord(): {
  id: string;
  cardId: string;
  status: string;
  periodStartOn: string;
  periodEndOn: string;
  dueOn: string;
  totalAmountMinor: number;
} {
  return {
    id: "invoice-1",
    cardId: "card-1",
    status: "open",
    periodStartOn: "2028-01-01",
    periodEndOn: "2028-01-31",
    dueOn: "2028-02-10",
    totalAmountMinor: 12500,
  };
}

function invoiceSummary(): Record<string, unknown> {
  return {
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
