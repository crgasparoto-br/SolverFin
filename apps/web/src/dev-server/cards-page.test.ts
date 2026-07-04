import assert from "node:assert/strict";

import { renderCardsPage } from "./cards-page.js";

const originalFetch = globalThis.fetch;

await cardsPageRendersInvoiceWorkspace();
await cardsPageDisablesPaymentForSettledInvoices();
await cardsPageUsesOnlySelectedCardInvoice();

globalThis.fetch = originalFetch;

async function cardsPageRendersInvoiceWorkspace(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calledPaths.push(`${url.pathname}${url.search}`);

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-1",
            name: "Cartão Principal",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            maskedIdentifier: "final 9876",
          },
          {
            id: "card-2",
            name: "Cartão Reserva",
            status: "active",
            closingDay: 5,
            dueDay: 15,
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
            effectiveCreditLimitMinor: 200000,
          },
          {
            id: "instrument-archived",
            type: "virtual",
            holder: "additional",
            status: "archived",
            isDefault: false,
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
            totalAmountMinor: 17345,
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [{ id: "account-1", name: "Conta Principal" }] });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [{ id: "category-1", name: "Mercado" }] });
    }

    if (url.pathname === "/api/invoices/invoice-1/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-1",
          financialProfileId: "profile-1",
          cardId: "card-1",
          cardName: "Cartão Principal",
          cardMaskedIdentifier: "final 9876",
          status: "open",
          periodStartOn: "2026-06-01",
          closingOn: "2026-06-20",
          dueOn: "2026-07-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 17345,
          totalPaidMinor: 0,
          amountDueMinor: 17345,
          reconciledExpensesMinor: 10000,
          unreconciledExpensesMinor: 7345,
          purchasesCount: 2,
          cardTotals: [
            {
              cardId: "card-1",
              cardName: "Cartão Principal",
              maskedIdentifier: "final 9876",
              limitTotalMinor: 200000,
              limitUsedMinor: 17345,
              limitAvailableMinor: 182655,
              invoiceTotalMinor: 17345,
              invoiceAmountDueMinor: 17345,
            },
          ],
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
            invoiceId: "invoice-1",
            categoryId: "category-1",
            recurrenceId: "recurrence-card-1",
            occurredOn: "2026-06-19",
            description: "Supermercado",
            amountMinor: 10000,
            currency: "BRL",
            status: "reconciled",
          },
          {
            id: "purchase-2",
            financialProfileId: "profile-1",
            cardId: "card-1",
            invoiceId: "invoice-1",
            occurredOn: "2026-06-18",
            description: "Aplicativo de transporte",
            amountMinor: 7345,
            currency: "BRL",
            status: "posted",
          },
        ],
      });
    }

    if (url.pathname === "/api/installments") {
      assert.equal(url.searchParams.get("cardId"), "card-1");
      assert.equal(url.searchParams.get("status"), "all");
      assert.equal(url.searchParams.get("dueFrom"), "2026-06-01");
      assert.equal(url.searchParams.get("dueTo"), "2026-06-20");

      return jsonResponse({
        installments: [
          {
            id: "installment-1",
            financialProfileId: "profile-1",
            status: "posted",
            sequenceNumber: 2,
            totalInstallments: 10,
            dueOn: "2026-06-10",
            amountMinor: 12000,
            currency: "BRL",
            transaction: { id: "purchase-3", status: "posted", description: "Notebook" },
            invoice: {
              id: "invoice-1",
              status: "open",
              cardId: "card-1",
              periodStartOn: "2026-06-01",
              periodEndOn: "2026-06-20",
              dueOn: "2026-07-10",
            },
            card: { id: "card-1", name: "Cartão Principal", status: "active" },
            cardInstrument: {
              id: "instrument-main",
              cardId: "card-1",
              type: "physical",
              holder: "primary",
              status: "active",
              isDefault: true,
              maskedIdentifier: "final 1234",
            },
            category: { id: "category-1", name: "Mercado", kind: "expense", status: "active" },
            editable: false,
            editBlockedReason: "invoice_linked",
          },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("cardId"), "card-1");

      return jsonResponse({
        recurrences: [
          {
            id: "recurrence-card-1",
            status: "active",
            frequency: "monthly",
            interval: 1,
            startOn: "2026-06-05",
            amountMinor: 2990,
            currency: "BRL",
            description: "Assinatura streaming",
            cardId: "card-1",
            categoryId: "category-1",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPage("session-token");

  assert.match(html, /Cartões de Crédito/);
  assert.match(html, /Cartão Principal/);
  assert.match(html, /final 9876/);
  assert.match(html, /Vencimento/);
  assert.match(html, /Valor a pagar/);
  assert.match(html, /Saldo anterior/);
  assert.match(html, /Total conciliado/);
  assert.match(html, /Total não conciliado/);
  assert.match(html, /Disponível/);
  assert.match(html, /Totais por cartão/);
  assert.match(html, /Limite \(Total\)/);
  assert.match(html, /Histórico da fatura/);
  assert.match(html, /Notebook/);
  assert.match(html, /2\/10/);
  assert.match(html, /Físico - Titular principal · final 1234/);
  assert.match(html, /Bloqueada pela fatura/);
  assert.match(html, /Supermercado/);
  assert.match(html, /Aplicativo de transporte/);
  assert.match(html, /data-reconciliation-toggle="unreconciled"/);
  assert.match(html, /data-reconciliation-toggle="reconciled"/);
  assert.match(html, /data-purchase-search/);
  assert.match(html, /\/api\/invoices\/invoice-1\/close/);
  assert.match(html, /data-path="\/api\/invoices\/invoice-1\/pay"/);
  assert.match(html, /name="paymentAccountId"/);
  assert.match(html, /name="paidOn"/);
  assert.match(html, /Conta Principal/);
  assert.match(html, /Pagamento da fatura/);
  assert.match(html, /Confirmar pagamento/);
  assert.match(html, /data-edit-purchase="purchase-1"/);
  assert.match(html, /name="cardInstrumentId"/);
  assert.match(html, /value="instrument-main" selected/);
  assert.match(html, /Físico - Titular principal · final 1234 · limite R\$\s+2\.000,00/);
  assert.doesNotMatch(html, /instrument-archived/);
  assert.match(html, /data-path="\/api\/credit-card-accounts\/card-1\/purchases"/);
  assert.match(html, /name="repeatMode"/);
  assert.match(html, /<option value="installment">Parcelado<\/option>/);
  assert.match(html, /<option value="fixed">Fixo<\/option>/);
  assert.match(html, /data-purchase-field="totalInstallments"/);
  assert.match(html, /data-purchase-field="interval"/);
  assert.match(html, /data-purchase-field="frequency"/);
  assert.match(html, /data-purchase-field="endOn"/);
  assert.doesNotMatch(html, /Novo cartão/);
  assert.doesNotMatch(html, /<details class="purchase-group"/);
  assert.doesNotMatch(html, /Compromissos previsíveis/);
  assert.doesNotMatch(html, /Recorrências deste cartão/);
  assert.match(html, /recurrence-indicator/);
  assert.match(html, /data-recurrence-edit="recurrence-card-1"/);
  assert.doesNotMatch(html, /\/recorrencias/);
  assert.doesNotMatch(html, /\/pagar-receber/);
  assert.doesNotMatch(html, /name="kind"/, "card recurrences should not expose a kind field");
  assert.doesNotMatch(html, /name="purchaseCardId"/);
  assert.equal(calledPaths.includes("/api/card-additional-links"), false);
  assert.equal(calledPaths.includes("/api/credit-card-accounts/card-1/instruments"), true);
  assert.ok(
    calledPaths.includes(
      "/api/installments?cardId=card-1&status=all&dueFrom=2026-06-01&dueTo=2026-06-20",
    ),
  );

  const recurrencesIndex = calledPaths.findIndex((path) => path.startsWith("/api/recurrences"));
  const purchasesIndex = calledPaths.indexOf("/api/invoices/invoice-1/purchases");
  assert.ok(
    recurrencesIndex >= 0 && purchasesIndex >= 0 && recurrencesIndex < purchasesIndex,
    "recurrences must be fetched before purchases so catch-up materialization shows up in the same render",
  );
}

async function cardsPageDisablesPaymentForSettledInvoices(): Promise<void> {
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

    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") {
      return jsonResponse({ instruments: [] });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          {
            id: "invoice-paid",
            cardId: "card-1",
            status: "paid",
            periodStartOn: "2026-06-01",
            periodEndOn: "2026-06-20",
            dueOn: "2026-07-10",
            totalAmountMinor: 17345,
          },
        ],
      });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [{ id: "account-1", name: "Conta Principal" }] });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }

    if (url.pathname === "/api/invoices/invoice-paid/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-paid",
          financialProfileId: "profile-1",
          cardId: "card-1",
          cardName: "Cartão Principal",
          status: "paid",
          periodStartOn: "2026-06-01",
          closingOn: "2026-06-20",
          dueOn: "2026-07-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 17345,
          totalPaidMinor: 17345,
          amountDueMinor: 0,
          reconciledExpensesMinor: 17345,
          unreconciledExpensesMinor: 0,
          purchasesCount: 1,
          cardTotals: [],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-paid/purchases") {
      return jsonResponse({ purchases: [] });
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

  assert.match(html, /Fatura Paga/);
  assert.match(html, /Pagamento indisponível para faturas paga\./);
  assert.match(html, /Nenhuma parcela neste período/);
  assert.doesNotMatch(html, /\/pagar-receber/);
}

async function cardsPageUsesOnlySelectedCardInvoice(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    calledPaths.push(`${url.pathname}${url.search}`);

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          { id: "card-1", name: "Cartão Principal", status: "active", closingDay: 20, dueDay: 10 },
          { id: "card-2", name: "Cartão C6", status: "active", closingDay: 20, dueDay: 10 },
        ],
      });
    }

    if (url.pathname === "/api/credit-card-accounts/card-2/instruments") {
      return jsonResponse({
        instruments: [
          {
            id: "instrument-c6",
            type: "virtual",
            holder: "primary",
            status: "active",
            isDefault: true,
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
            totalAmountMinor: 5000,
          },
          {
            id: "invoice-2",
            cardId: "card-2",
            status: "open",
            periodStartOn: "2026-06-01",
            periodEndOn: "2026-06-20",
            dueOn: "2026-07-10",
            totalAmountMinor: 3000,
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices/invoice-2/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-2",
          financialProfileId: "profile-1",
          cardId: "card-2",
          cardName: "Cartão C6",
          status: "open",
          periodStartOn: "2026-06-01",
          closingOn: "2026-06-20",
          dueOn: "2026-07-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 3000,
          totalPaidMinor: 0,
          amountDueMinor: 3000,
          reconciledExpensesMinor: 0,
          unreconciledExpensesMinor: 3000,
          purchasesCount: 1,
          cardTotals: [
            {
              cardId: "card-2",
              cardName: "Cartão C6",
              limitTotalMinor: 50000,
              limitUsedMinor: 3000,
              limitAvailableMinor: 47000,
              invoiceTotalMinor: 3000,
              invoiceAmountDueMinor: 3000,
            },
          ],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-1/purchases") {
      throw new Error("Should not fetch purchases for another card invoice");
    }

    if (url.pathname === "/api/invoices/invoice-2/purchases") {
      return jsonResponse({
        purchases: [
          {
            id: "purchase-2",
            financialProfileId: "profile-1",
            cardId: "card-2",
            invoiceId: "invoice-2",
            occurredOn: "2026-06-12",
            description: "Compra no cartão selecionado",
            amountMinor: 3000,
            currency: "BRL",
            status: "posted",
          },
        ],
      });
    }

    if (url.pathname === "/api/installments") {
      assert.equal(url.searchParams.get("cardId"), "card-2");
      assert.equal(url.searchParams.get("dueFrom"), "2026-06-01");
      assert.equal(url.searchParams.get("dueTo"), "2026-06-20");
      return jsonResponse({ installments: [] });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [] });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("cardId"), "card-2");
      return jsonResponse({ recurrences: [] });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPage(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-2"),
  );

  assert.match(html, /Fatura de Cartão C6/);
  assert.match(html, /Compra no cartão selecionado/);
  assert.match(html, /value="instrument-c6" selected/);
  assert.match(html, /data-path="\/api\/credit-card-accounts\/card-2\/purchases"/);
  assert.match(html, /Nenhuma parcela neste período/);
  assert.doesNotMatch(html, /Compra no principal/);
  assert.doesNotMatch(html, /Fatura consolidada com os cartões adicionais do grupo/);
  assert.doesNotMatch(html, /name="purchaseCardId"/);
  assert.equal(calledPaths.includes("/api/card-additional-links"), false);
  assert.equal(calledPaths.includes("/api/invoices/invoice-1/purchases"), false);
  assert.equal(calledPaths.includes("/api/credit-card-accounts/card-2/instruments"), true);
  assert.ok(
    calledPaths.includes(
      "/api/installments?cardId=card-2&status=all&dueFrom=2026-06-01&dueTo=2026-06-20",
    ),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
