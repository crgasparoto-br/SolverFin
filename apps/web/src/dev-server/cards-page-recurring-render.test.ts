import assert from "node:assert/strict";

import { renderCardsPage } from "./cards-page.js";

const category = { id: "cat-streaming", kind: "expense", name: "Streaming", status: "active" };
const cardInstrument = {
  holder: "primary",
  id: "instrument-1",
  isDefault: true,
  maskedIdentifier: "**** 4242",
  name: "Fisico",
  status: "active",
  type: "physical",
};
const invoice = {
  cardId: "card-1",
  dueOn: "2028-02-10",
  id: "invoice-1",
  periodEndOn: "2028-01-31",
  periodStartOn: "2028-01-01",
  status: "open",
  totalAmountMinor: 1990,
};
const recurrence = {
  amountMinor: 1990,
  cardId: "card-1",
  cardInstrumentId: "instrument-1",
  categoryId: "cat-streaming",
  currency: "BRL",
  description: "Spotify recorrente",
  frequency: "monthly",
  id: "recurrence-1",
  kind: "expense",
  startOn: "2028-01-10",
  status: "active",
};
const purchase = {
  amountMinor: 1990,
  cardId: "card-1",
  cardInstrumentId: "instrument-1",
  categoryId: "cat-streaming",
  currency: "BRL",
  description: "Spotify recorrente",
  financialProfileId: "profile-1",
  id: "purchase-1",
  invoiceId: "invoice-1",
  occurredOn: "2028-01-10",
  recurrenceId: "recurrence-1",
  status: "posted",
};
const invoiceSummary = {
  amountDueMinor: 1990,
  cardId: "card-1",
  cardName: "Cartao principal",
  cardTotals: [
    {
      cardId: "card-1",
      cardName: "Cartao principal",
      invoiceAmountDueMinor: 1990,
      invoiceTotalMinor: 1990,
      limitAvailableMinor: 8010,
      limitTotalMinor: 10000,
      limitUsedMinor: 1990,
    },
  ],
  closingOn: "2028-01-31",
  dueOn: "2028-02-10",
  financialProfileId: "profile-1",
  invoiceId: "invoice-1",
  periodStartOn: "2028-01-01",
  previousBalanceMinor: 0,
  purchasesCount: 1,
  reconciledExpensesMinor: 0,
  status: "open",
  totalExpensesMinor: 1990,
  totalPaidMinor: 0,
  unreconciledExpensesMinor: 1990,
};
const responses: Record<string, unknown> = {
  "/api/accounts": { accounts: [] },
  "/api/cards": {
    cards: [
      {
        closingDay: 20,
        dueDay: 10,
        id: "card-1",
        name: "Cartao principal",
        status: "active",
      },
    ],
  },
  "/api/categories": { categories: [category] },
  "/api/credit-card-accounts/card-1/instruments": { instruments: [cardInstrument] },
  "/api/invoices": { invoices: [invoice] },
  "/api/invoices/invoice-1/purchases": { purchases: [purchase] },
  "/api/invoices/invoice-1/summary": { summary: invoiceSummary },
  "/api/recurrences": { recurrences: [recurrence] },
};

const purchaseRowMarker = '<article class="purchase-row" data-purchase-item';
const recurringPurchasePattern =
  /<article class="purchase-row" data-purchase-item[\s\S]*class="recurrence-indicator"/;

await cardsPageRendersRecurringPurchaseOnce();

async function cardsPageRendersRecurringPurchaseOnce(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = resolveFetchUrl(input);
    const path = `${url.pathname}${url.search}`;
    const body = responses[url.pathname];
    requestedPaths.push(path);

    if (body === undefined) {
      throw new Error(`Unexpected API path: ${path}`);
    }

    return jsonResponse(body);
  };

  try {
    const html = await renderCardsPage(
      "token",
      new URL("http://localhost/cartoes?cardId=card-1&invoiceId=invoice-1"),
    );

    assert.doesNotMatch(html, /Erro ao carregar dados/);
    assert.equal(countOccurrences(html, purchaseRowMarker), 1);
    assert.match(html, recurringPurchasePattern);
    assert.match(html, /data-edit-purchase="purchase-1"/);
    assert.doesNotMatch(html, /data-recurrence-edit="recurrence-1"/);
    assert.doesNotMatch(html, />Editar recorrência</);
    assert.match(html, /Pausar recorrência/);
    assert.match(html, /Cancelar recorrência/);
    assert.doesNotMatch(html, /installments-section/);
    assert.doesNotMatch(html, /Histórico da fatura/);
    assert.equal(
      requestedPaths.some((path) => path.startsWith("/api/installments")),
      false,
      "cards page must not query /api/installments after removing the standalone installments block",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function resolveFetchUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status: 200,
  });
}
