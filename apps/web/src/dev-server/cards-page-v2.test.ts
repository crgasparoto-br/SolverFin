import assert from "node:assert/strict";

import { renderCardsPageV2 } from "./cards-page-v2.js";

const originalFetch = globalThis.fetch;

await cardsA3KeepsHierarchyCurrencyAndSettlementDistinct();
await cardsA3RendersEmptyStateWithoutCardContext();

globalThis.fetch = originalFetch;

async function cardsA3KeepsHierarchyCurrencyAndSettlementDistinct(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calledPaths.push(`${url.pathname}${url.search}`);

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
          {
            id: "card-reserve",
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
          { id: "account-usd", name: "Conta Dólar", status: "active", currency: "USD" },
          { id: "account-brl", name: "Conta Real", status: "active", currency: "BRL" },
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
      assert.equal(url.searchParams.get("cardId"), "card-usd");
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
          purchasesCount: 3,
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
            plannedOn: "2026-08-18",
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
            plannedOn: "2026-08-19",
            description: "Táxi aeroporto",
            amountMinor: 5000,
            currency: "USD",
            status: "posted",
          },
          {
            id: "purchase-coffee",
            financialProfileId: "profile-1",
            cardId: "card-usd",
            cardInstrumentId: "instrument-virtual",
            invoiceId: "invoice-aug",
            occurredOn: "2026-08-20",
            plannedOn: "2026-08-20",
            description: "Café",
            amountMinor: 1550,
            currency: "USD",
            status: "posted",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPageV2(
    "session-token",
    new URL(
      "http://solverfin.local/cartoes?cardId=card-usd&invoiceId=invoice-aug&q=a&sort=amount_desc&reconciliation=all",
    ),
  );

  assert.match(html, /data-cards-archetype="A3"/);
  assert.match(html, /sf-detail-layout/);
  assert.match(html, /Cartão Viagem/);
  assert.match(html, /Fatura selecionada/);
  assert.match(html, /Itens da fatura/);
  assert.match(html, /name="cardId" data-card-select/);
  assert.match(html, /type="month" name="month"/);
  assert.match(html, /invoiceId=invoice-jul/);
  assert.match(html, /data-currency="USD"/);
  assert.match(html, /Moeda da fatura<\/dt><dd>USD/);
  assert.match(html, /name="currency" value="USD"/);
  assert.match(html, /Conta Dólar · USD/);
  assert.doesNotMatch(html, /Conta Real · BRL/);
  assert.match(html, /Liquidação não é uma nova compra/);
  assert.match(html, /Ele não cria outra compra nem duplica a despesa já reconhecida/);
  assert.match(html, /data-path="\/api\/invoices\/invoice-aug\/pay"/);
  assert.match(html, /Liquidar fatura/);
  assert.match(html, /Fechar fatura/);
  assert.match(html, /Físico - Titular principal · final 4242/);
  assert.match(html, /Virtual - Titular principal · final 9001/);
  assert.match(html, /Hotel/);
  assert.match(html, /Táxi aeroporto/);
  assert.match(html, /Café/);
  assert.match(html, /data-reconciliation-toggle="reconciled"/);
  assert.match(html, /data-reconciliation-toggle="unreconciled"/);
  assert.match(html, /data-purchase-search/);
  assert.match(html, /value="amount_desc" selected/);

  const recurrencesIndex = calledPaths.findIndex((path) => path.startsWith("/api/recurrences"));
  const purchasesIndex = calledPaths.indexOf("/api/invoices/invoice-aug/purchases");
  assert.ok(
    recurrencesIndex >= 0 && purchasesIndex >= 0 && recurrencesIndex < purchasesIndex,
    "recurrences must be fetched before purchases so materialized purchases can appear in the same render",
  );
}

async function cardsA3RendersEmptyStateWithoutCardContext(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calledPaths.push(`${url.pathname}${url.search}`);

    if (url.pathname === "/api/cards") return jsonResponse({ cards: [] });
    if (url.pathname === "/api/invoices") return jsonResponse({ invoices: [] });
    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    return jsonResponse({});
  };

  const html = await renderCardsPageV2("session-token");

  assert.match(html, /Nenhum cartão cadastrado/);
  assert.match(html, /Cadastre um cartão para acompanhar faturas, limites e compras/);
  assert.match(html, /Selecione um cartão/);
  assert.match(html, /href="\/contas-cartoes"/);
  assert.equal(
    calledPaths.some(
      (path) => path.includes("/instruments") || path.startsWith("/api/recurrences"),
    ),
    false,
    "empty card state must not query card-scoped resources",
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
