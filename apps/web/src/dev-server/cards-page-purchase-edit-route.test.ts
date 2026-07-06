import assert from "node:assert/strict";

import { renderCardsPage } from "./cards-page.js";

const originalFetch = globalThis.fetch;

try {
  await cardsPageRoutesCardPurchaseEditsThroughPurchaseEndpoint();
} finally {
  globalThis.fetch = originalFetch;
}

async function cardsPageRoutesCardPurchaseEditsThroughPurchaseEndpoint(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-1",
            name: "Cartao Principal",
            status: "active",
            closingDay: 20,
            dueDay: 10,
          },
        ],
      });
    }

    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") {
      return jsonResponse({
        instruments: [
          {
            id: "instrument-main",
            type: "physical",
            holder: "primary",
            status: "active",
            isDefault: true,
            maskedIdentifier: "final 1234",
          },
          {
            id: "instrument-virtual",
            type: "virtual",
            holder: "primary",
            status: "active",
            isDefault: false,
            maskedIdentifier: "virtual 4321",
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
            totalAmountMinor: 12990,
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices/invoice-1/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-1",
          financialProfileId: "profile-1",
          cardId: "card-1",
          cardName: "Cartao Principal",
          status: "open",
          periodStartOn: "2026-06-01",
          closingOn: "2026-06-20",
          dueOn: "2026-07-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 12990,
          totalPaidMinor: 0,
          amountDueMinor: 12990,
          reconciledExpensesMinor: 0,
          unreconciledExpensesMinor: 12990,
          purchasesCount: 1,
          cardTotals: [],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-1/purchases") {
      return jsonResponse({
        purchases: [
          {
            id: "purchase-edit-route",
            financialProfileId: "profile-1",
            cardId: "card-1",
            invoiceId: "invoice-1",
            cardInstrumentId: "instrument-main",
            occurredOn: "2026-06-18",
            description: "Compra editavel",
            amountMinor: 12990,
            currency: "BRL",
            status: "posted",
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [] });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }

    if (url.pathname === "/api/installments") {
      return jsonResponse({ installments: [] });
    }

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [] });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPage("session-token");

  assert.match(html, /data-edit-purchase="purchase-edit-route"/);
  assert.match(html, /"cardInstrumentId":"instrument-main"/);
  assert.match(
    html,
    /form\.dataset\.path = "\/api\/credit-card-accounts\/" \+ purchase\.cardId \+ "\/purchases\/" \+ purchase\.id;/,
  );
  assert.match(html, /const cardInstrumentId = String\(data\.get\("cardInstrumentId"\) \|\| ""\);/);
  assert.match(html, /if \(cardInstrumentId\) basePayload\.cardInstrumentId = cardInstrumentId;/);
  assert.doesNotMatch(html, /setupCardPurchaseEditOverride/);
  assert.match(html, /if \(purchaseInstrumentLabel\) purchaseInstrumentLabel\.hidden = false;/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
