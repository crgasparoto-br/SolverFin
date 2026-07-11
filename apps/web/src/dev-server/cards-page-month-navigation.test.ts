import assert from "node:assert/strict";

import {
  formatInvoiceMonth,
  renderCardsPageWithMonthNavigation,
  shiftInvoiceMonth,
} from "./cards-page-month-navigation.js";

const originalFetch = globalThis.fetch;

try {
  assert.equal(shiftInvoiceMonth("2026-07", -1), "2026-06");
  assert.equal(shiftInvoiceMonth("2026-07", 1), "2026-08");
  assert.equal(shiftInvoiceMonth("2026-01", -1), "2025-12");
  assert.equal(shiftInvoiceMonth("2026-12", 1), "2027-01");
  assert.equal(formatInvoiceMonth("2026-07"), "Julho de 2026");

  await assertExistingInvoiceMonth();
  await assertMissingInvoiceMonth();
  await assertInitialMonthState();
} finally {
  globalThis.fetch = originalFetch;
}

async function assertExistingInvoiceMonth(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2026-06"),
  );

  assert.match(html, /Junho de 2026/);
  assert.match(html, /name="month" value="2026-06" data-invoice-month-input/);
  assert.match(html, /Compra de junho/);
  assert.doesNotMatch(html, /Compra de julho/);
  assert.match(html, /data-invoice-month-navigation-controller/);
}

async function assertMissingInvoiceMonth(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2026-08"),
  );

  assert.match(html, /Agosto de 2026/);
  assert.match(html, /name="month" value="2026-08" data-invoice-month-input/);
  assert.match(html, /Nenhuma fatura em Agosto de 2026/);
  assert.match(html, /O mês selecionado ainda não possui uma fatura materializada/);
  assert.doesNotMatch(html, /Compra de julho/);
  assert.doesNotMatch(html, /data-modal="payment"/);
  assert.match(html, /name="invoiceId" value="" data-invoice-input/);
}

async function assertInitialMonthState(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-1"),
  );

  assert.match(html, /Julho de 2026/);
  assert.match(html, /name="month" value="2026-07" data-invoice-month-input/);
}

function installFetch(): void {
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
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          invoice("invoice-july", "open", "2026-07-20", "2026-08-10", 7000),
          invoice("invoice-june", "closed", "2026-06-20", "2026-07-10", 6000),
        ],
      });
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

    if (url.pathname === "/api/invoices/invoice-july/summary") {
      return jsonResponse({ summary: summary("invoice-july", "open", "2026-07-20", "2026-08-10", 7000) });
    }

    if (url.pathname === "/api/invoices/invoice-june/summary") {
      return jsonResponse({ summary: summary("invoice-june", "closed", "2026-06-20", "2026-07-10", 6000) });
    }

    if (url.pathname === "/api/invoices/invoice-july/purchases") {
      return jsonResponse({ purchases: [purchase("purchase-july", "invoice-july", "2026-07-15", "Compra de julho", 7000)] });
    }

    if (url.pathname === "/api/invoices/invoice-june/purchases") {
      return jsonResponse({ purchases: [purchase("purchase-june", "invoice-june", "2026-06-15", "Compra de junho", 6000)] });
    }

    return jsonResponse({});
  };
}

function invoice(
  id: string,
  status: string,
  periodEndOn: string,
  dueOn: string,
  totalAmountMinor: number,
): Record<string, unknown> {
  return {
    id,
    cardId: "card-1",
    status,
    periodStartOn: `${periodEndOn.slice(0, 8)}01`,
    periodEndOn,
    dueOn,
    totalAmountMinor,
  };
}

function summary(
  invoiceId: string,
  status: string,
  closingOn: string,
  dueOn: string,
  totalExpensesMinor: number,
): Record<string, unknown> {
  return {
    invoiceId,
    financialProfileId: "profile-1",
    cardId: "card-1",
    cardName: "Cartão Principal",
    status,
    periodStartOn: `${closingOn.slice(0, 8)}01`,
    closingOn,
    dueOn,
    previousBalanceMinor: 0,
    totalExpensesMinor,
    totalPaidMinor: 0,
    amountDueMinor: totalExpensesMinor,
    reconciledExpensesMinor: 0,
    unreconciledExpensesMinor: totalExpensesMinor,
    purchasesCount: 1,
    cardTotals: [],
  };
}

function purchase(
  id: string,
  invoiceId: string,
  occurredOn: string,
  description: string,
  amountMinor: number,
): Record<string, unknown> {
  return {
    id,
    financialProfileId: "profile-1",
    cardId: "card-1",
    invoiceId,
    occurredOn,
    description,
    amountMinor,
    currency: "BRL",
    status: "posted",
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
