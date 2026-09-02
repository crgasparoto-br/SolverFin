import assert from "node:assert/strict";

import { renderCardsPageV2 } from "./cards-page-v2.js";

const originalFetch = globalThis.fetch;

try {
  await cardsA3FailsClosedWhenPurchasesCannotLoad();
  await cardsA3FailsClosedWhenSummaryCannotLoad();
  await cardsA3FailsClosedWhenFinancialActionDependenciesCannotLoad();
  await cardsA3KeepsInstrumentLimitsCurrencyExplicit();
  await cardsA3PreservesProfileAcrossInvoiceNavigation();
} finally {
  globalThis.fetch = originalFetch;
}

async function cardsA3FailsClosedWhenPurchasesCannotLoad(): Promise<void> {
  globalThis.fetch = createCardsFetchMock({
    failurePath: "/api/invoices/invoice-aug/purchases",
    failureMessage: "Falha simulada nas compras",
  });

  const html = await renderCardsPageV2("session-token", selectedInvoiceUrl());

  assert.match(html, /data-cards-load-error/);
  assert.match(html, /Falha simulada nas compras/);
  assert.doesNotMatch(html, /Nenhuma compra encontrada/);
  assert.doesNotMatch(html, /data-purchase-filter-empty/);
}

async function cardsA3FailsClosedWhenSummaryCannotLoad(): Promise<void> {
  globalThis.fetch = createCardsFetchMock({
    failurePath: "/api/invoices/invoice-aug/summary",
    failureMessage: "Falha simulada no resumo",
  });

  const html = await renderCardsPageV2("session-token", selectedInvoiceUrl());

  assert.match(html, /data-cards-load-error/);
  assert.match(html, /Falha simulada no resumo/);
  assert.doesNotMatch(html, /cards-invoice-summary/);
  assert.doesNotMatch(html, /Nenhuma compra encontrada/);
}

async function cardsA3FailsClosedWhenFinancialActionDependenciesCannotLoad(): Promise<void> {
  for (const scenario of [
    { path: "/api/accounts", message: "Falha simulada nas contas" },
    {
      path: "/api/credit-card-accounts/card-usd/instruments",
      message: "Falha simulada nos instrumentos",
    },
    { path: "/api/recurrences", message: "Falha simulada nas recorrências" },
    { path: "/api/categories", message: "Falha simulada nas categorias" },
  ]) {
    globalThis.fetch = createCardsFetchMock({
      failurePath: scenario.path,
      failureMessage: scenario.message,
    });

    const html = await renderCardsPageV2("session-token", selectedInvoiceUrl());

    assert.match(html, /data-cards-load-error/, `${scenario.path} deve renderizar erro explícito`);
    assert.match(html, new RegExp(scenario.message));
    assert.doesNotMatch(html, /Nenhuma compra encontrada/);
  }
}

async function cardsA3KeepsInstrumentLimitsCurrencyExplicit(): Promise<void> {
  globalThis.fetch = createCardsFetchMock();

  const html = await renderCardsPageV2("session-token", selectedInvoiceUrl());

  assert.match(html, /limite USD 1\.000,00/);
  assert.match(html, /Limite disponível/);
  assert.match(html, /data-currency="USD"/);
  assert.doesNotMatch(html, /limite 1\.000,00/);
  assert.doesNotMatch(html, /limite 500,00/);
}

async function cardsA3PreservesProfileAcrossInvoiceNavigation(): Promise<void> {
  globalThis.fetch = createCardsFetchMock();

  const html = await renderCardsPageV2(
    "session-token",
    new URL(
      "http://solverfin.local/cartoes?profileId=profile-explicit&cardId=card-usd&invoiceId=invoice-aug&reconciliation=unreconciled",
    ),
  );

  assert.match(html, /name="profileId" value="profile-explicit"/);
  assert.match(
    html,
    /invoiceId=invoice-jul[^\"]*profileId=profile-explicit|profileId=profile-explicit[^\"]*invoiceId=invoice-jul/,
  );
  assert.match(html, /data-reconciliation-toggle="unreconciled" aria-current="page"/);
  assert.doesNotMatch(html, /data-reconciliation-toggle="[^"]+" aria-pressed=/);
}

function selectedInvoiceUrl(): URL {
  return new URL(
    "http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&reconciliation=all",
  );
}

function createCardsFetchMock(
  input: {
    failurePath?: string;
    failureMessage?: string;
  } = {},
): typeof fetch {
  return async (request: string | URL | Request): Promise<Response> => {
    const url = new URL(String(request));
    if (url.pathname === input.failurePath) {
      return jsonResponse({ error: { message: input.failureMessage ?? "Falha simulada" } }, 503);
    }

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-usd",
            name: "Cartão Viagem",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            maskedIdentifier: "final 4242",
            institutionKey: "itau",
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          {
            id: "invoice-aug",
            cardId: "card-usd",
            status: "open",
            periodStartOn: "2026-08-01",
            periodEndOn: "2026-08-20",
            dueOn: "2026-09-10",
            totalAmountMinor: 27550,
            currency: "USD",
          },
          {
            id: "invoice-jul",
            cardId: "card-usd",
            status: "paid",
            periodStartOn: "2026-07-01",
            periodEndOn: "2026-07-20",
            dueOn: "2026-08-10",
            totalAmountMinor: 11000,
            currency: "USD",
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-usd",
            name: "Conta Dólar",
            status: "active",
            currency: "USD",
          },
          {
            id: "account-brl",
            name: "Conta Real",
            status: "active",
            currency: "BRL",
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [{ id: "category-food", name: "Alimentação", status: "active" }],
      });
    }

    if (url.pathname === "/api/credit-card-accounts/card-usd/instruments") {
      return jsonResponse({
        instruments: [
          {
            id: "instrument-main",
            type: "physical",
            holder: "primary",
            status: "active",
            isDefault: true,
            maskedIdentifier: "final 4242",
            effectiveCreditLimitMinor: 100000,
          },
          {
            id: "instrument-virtual",
            type: "virtual",
            holder: "primary",
            status: "active",
            isDefault: false,
            maskedIdentifier: "final 9001",
            effectiveCreditLimitMinor: 50000,
          },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [] });
    }

    if (url.pathname === "/api/invoices/invoice-aug/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-aug",
          financialProfileId: "profile-1",
          cardId: "card-usd",
          cardName: "Cartão Viagem",
          cardMaskedIdentifier: "final 4242",
          status: "open",
          periodStartOn: "2026-08-01",
          closingOn: "2026-08-20",
          dueOn: "2026-09-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 27550,
          totalPaidMinor: 0,
          amountDueMinor: 27550,
          reconciledExpensesMinor: 21000,
          unreconciledExpensesMinor: 6550,
          purchasesCount: 2,
          cardTotals: [
            {
              cardId: "card-usd",
              cardName: "Cartão Viagem",
              maskedIdentifier: "final 4242",
              limitTotalMinor: 150000,
              limitUsedMinor: 27550,
              limitAvailableMinor: 122450,
              invoiceTotalMinor: 27550,
              invoiceAmountDueMinor: 27550,
            },
          ],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-aug/purchases") {
      return jsonResponse({
        purchases: [
          {
            id: "purchase-hotel",
            financialProfileId: "profile-1",
            cardId: "card-usd",
            cardInstrumentId: "instrument-main",
            invoiceId: "invoice-aug",
            categoryId: "category-food",
            occurredOn: "2026-08-18",
            description: "Hotel",
            amountMinor: 21000,
            currency: "USD",
            status: "reconciled",
          },
          {
            id: "purchase-taxi",
            financialProfileId: "profile-1",
            cardId: "card-usd",
            cardInstrumentId: "instrument-virtual",
            invoiceId: "invoice-aug",
            occurredOn: "2026-08-19",
            description: "Táxi aeroporto",
            amountMinor: 6550,
            currency: "USD",
            status: "posted",
          },
        ],
      });
    }

    return jsonResponse({});
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
