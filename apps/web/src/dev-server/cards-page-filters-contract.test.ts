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
  totalAmountMinor: 3990,
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
const installment = {
  amountMinor: 2000,
  card: { id: "card-1", name: "Cartao principal", status: "active" },
  cardInstrument,
  category,
  currency: "BRL",
  dueOn: "2028-01-12",
  editBlockedReason: "installment_status_locked",
  editable: false,
  financialProfileId: "profile-1",
  id: "installment-1",
  invoice,
  sequenceNumber: 2,
  status: "reconciled",
  totalInstallments: 3,
  transaction: {
    categoryId: "cat-streaming",
    description: "Parcela avulsa",
    id: "purchase-2",
    invoiceId: "invoice-1",
    status: "reconciled",
  },
};
const invoiceSummary = {
  amountDueMinor: 3990,
  cardId: "card-1",
  cardName: "Cartao principal",
  cardTotals: [
    {
      cardId: "card-1",
      cardName: "Cartao principal",
      invoiceAmountDueMinor: 3990,
      invoiceTotalMinor: 3990,
      limitAvailableMinor: 6010,
      limitTotalMinor: 10000,
      limitUsedMinor: 3990,
    },
  ],
  closingOn: "2028-01-31",
  dueOn: "2028-02-10",
  financialProfileId: "profile-1",
  invoiceId: "invoice-1",
  periodStartOn: "2028-01-01",
  previousBalanceMinor: 0,
  purchasesCount: 1,
  reconciledExpensesMinor: 2000,
  status: "open",
  totalExpensesMinor: 3990,
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
  "/api/installments": { installments: [installment] },
  "/api/invoices": { invoices: [invoice] },
  "/api/invoices/invoice-1/purchases": { purchases: [purchase] },
  "/api/invoices/invoice-1/summary": { summary: invoiceSummary },
  "/api/recurrences": { recurrences: [] },
};

const filterTargetSelector =
  /document\.querySelectorAll\("\[data-purchase-item\], \[data-installment-item\]"\)/;
const purchaseFilterContract =
  /<article class="purchase-row" data-purchase-item data-reconciliation="unreconciled" data-search="[^"]*spotify recorrente[^"]*streaming[^"]*"/;
const installmentFilterContract =
  /<article class="installment-row" data-installment-item data-reconciliation="reconciled" data-search="[^"]*parcela avulsa[^"]*streaming[^"]*"/;

await cardsPageFiltersPurchasesAndInstallments();

async function cardsPageFiltersPurchasesAndInstallments(): Promise<void> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = resolveFetchUrl(input);
    const body = responses[url.pathname];

    if (body === undefined) {
      throw new Error(`Unexpected API path: ${url.pathname}${url.search}`);
    }

    return jsonResponse(body);
  };

  try {
    const html = await renderCardsPage(
      "token",
      new URL("http://localhost/cartoes?cardId=card-1&invoiceId=invoice-1"),
    );

    assert.doesNotMatch(html, /Erro ao carregar dados/);
    assert.match(html, /data-purchase-search/);
    assert.match(html, /data-reconciliation-toggle="unreconciled"/);
    assert.match(html, /data-reconciliation-toggle="reconciled"/);
    assert.match(html, filterTargetSelector);
    assert.match(html, purchaseFilterContract);
    assert.match(html, installmentFilterContract);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function resolveFetchUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status: 200,
  });
}
