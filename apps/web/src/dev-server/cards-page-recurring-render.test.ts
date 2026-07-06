import assert from "node:assert/strict";

import { renderCardsPage } from "./cards-page.js";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input));
  const body = responseBodyFor(url.pathname + url.search);

  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status: 200,
  });
};

try {
  const html = await renderCardsPage(
    "token",
    new URL("http://localhost/cartoes?cardId=card-1&invoiceId=invoice-1"),
  );

  assert.equal(countOccurrences(html, "data-purchase-item"), 1);
  assert.equal(countOccurrences(html, "data-installment-item"), 1);
  assert.equal(countOccurrences(html, "recurrence-indicator"), 1);
  assert.match(html, /data-recurrence-edit="recurrence-1"/);
  assert.match(html, /Histórico da fatura/);
} finally {
  globalThis.fetch = originalFetch;
}

function responseBodyFor(path: string): unknown {
  if (path === "/api/cards?status=all") {
    return {
      cards: [
        {
          closingDay: 20,
          dueDay: 10,
          id: "card-1",
          name: "Cartao principal",
          status: "active",
        },
      ],
    };
  }

  if (path === "/api/invoices?status=all") {
    return { invoices: [invoice] };
  }

  if (path === "/api/categories?kind=expense") {
    return { categories: [category] };
  }

  if (path === "/api/accounts") {
    return { accounts: [] };
  }

  if (path === "/api/credit-card-accounts/card-1/instruments") {
    return { instruments: [cardInstrument] };
  }

  if (path === "/api/recurrences?cardId=card-1&status=all") {
    return { recurrences: [recurrence] };
  }

  if (path === "/api/invoices/invoice-1/summary") {
    return { summary: invoiceSummary };
  }

  if (path === "/api/invoices/invoice-1/purchases") {
    return { purchases: [purchase] };
  }

  if (
    path ===
    "/api/installments?cardId=card-1&status=all&dueFrom=2028-01-01&dueTo=2028-01-31"
  ) {
    return { installments: [installment] };
  }

  throw new Error(`Unexpected API path: ${path}`);
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

const category = {
  id: "cat-streaming",
  kind: "expense",
  name: "Streaming",
  status: "active",
};

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

const installment = {
  amountMinor: 1990,
  card: {
    id: "card-1",
    name: "Cartao principal",
    status: "active",
  },
  cardInstrument,
  category,
  currency: "BRL",
  dueOn: "2028-01-10",
  editBlockedReason: "invoice_linked",
  editable: false,
  financialProfileId: "profile-1",
  id: "installment-1",
  invoice,
  recurrence: {
    description: "Spotify recorrente",
    id: "recurrence-1",
    status: "active",
  },
  sequenceNumber: 1,
  status: "posted",
  totalInstallments: 1,
  transaction: {
    categoryId: "cat-streaming",
    description: "Spotify recorrente",
    id: "purchase-1",
    invoiceId: "invoice-1",
    recurrenceId: "recurrence-1",
    status: "posted",
  },
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
