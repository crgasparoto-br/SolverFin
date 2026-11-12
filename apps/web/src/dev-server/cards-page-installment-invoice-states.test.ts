import assert from "node:assert/strict";
import test from "node:test";

import { renderCardsPage } from "./cards-page.js";

const originalFetch = globalThis.fetch;

for (const scenario of [
  { status: "open", editDisabled: false },
  { status: "overdue", editDisabled: false },
  { status: "closed", editDisabled: true },
  { status: "paid", editDisabled: true },
  { status: "cancelled", editDisabled: true },
] as const) {
  test(`keeps installment purchase editing consistent for ${scenario.status} invoices`, async () => {
    globalThis.fetch = createFetchMock(scenario.status);
    try {
      const html = await renderCardsPage(
        "session-token",
        new URL("http://solverfin.test/cartoes?cardId=card-1&invoiceId=invoice-1"),
      );
      const editButton = html.match(/<button[^>]+data-edit-purchase="purchase-1"[^>]*>/)?.[0];
      assert.ok(editButton, `missing purchase edit button for ${scenario.status}`);
      assert.equal(
        /\sdisabled(?:\s|>)/.test(editButton),
        scenario.editDisabled,
        `unexpected edit state for ${scenario.status}`,
      );
      assert.match(html, /invoice_linked/);
      assert.match(html, /data-edit-purchase/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

function createFetchMock(invoiceStatus: string): typeof fetch {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-1",
            name: "Cartão de teste",
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
          {
            id: "invoice-1",
            cardId: "card-1",
            status: invoiceStatus,
            periodStartOn: "2026-07-01",
            periodEndOn: "2026-07-20",
            dueOn: "2026-08-10",
            totalAmountMinor: 12345,
          },
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
      return jsonResponse({
        instruments: [
          {
            id: "instrument-1",
            type: "physical",
            holder: "primary",
            status: "active",
            isDefault: true,
          },
        ],
      });
    }
    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [] });
    }
    if (url.pathname === "/api/invoices/invoice-1/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-1",
          financialProfileId: "profile-1",
          cardId: "card-1",
          cardName: "Cartão de teste",
          status: invoiceStatus,
          periodStartOn: "2026-07-01",
          closingOn: "2026-07-20",
          dueOn: "2026-08-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 12345,
          totalPaidMinor: 0,
          amountDueMinor: 12345,
          reconciledExpensesMinor: 0,
          unreconciledExpensesMinor: 12345,
          purchasesCount: 1,
          cardTotals: [],
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
            cardInstrumentId: "instrument-1",
            invoiceId: "invoice-1",
            installmentId: "installment-1",
            occurredOn: "2026-07-15",
            plannedOn: "2026-07-15",
            description: "Compra parcelada fictícia",
            amountMinor: 12345,
            currency: "BRL",
            status: "posted",
          },
        ],
      });
    }

    return jsonResponse({});
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
