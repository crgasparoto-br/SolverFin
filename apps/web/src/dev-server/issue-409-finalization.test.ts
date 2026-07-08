import assert from "node:assert/strict";

import { renderCardsPage } from "./cards-page.js";
import { renderTransactionsPage } from "./transactions-page.js";

const originalFetch = globalThis.fetch;

await issue409KeepsStatementStatusChipsAsIndicators();
await issue409KeepsCardPurchasesInMainInvoiceListAndLocksClosedInvoiceEdits();

globalThis.fetch = originalFetch;

async function issue409KeepsStatementStatusChipsAsIndicators(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-409",
            name: "Conta issue 409",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("accountId"), "account-409");
      assert.equal(url.searchParams.get("status"), "all");
      return jsonResponse({ recurrences: [] });
    }

    if (url.pathname === "/api/transactions") {
      assert.equal(url.searchParams.get("accountId"), "account-409");
      assert.equal(url.searchParams.get("plannedTo"), "2026-07-31");
      return jsonResponse({
        transactions: [
          {
            id: "transaction-planned-409",
            description: "Conta futura",
            kind: "expense",
            status: "planned",
            amountMinor: 12000,
            occurredOn: "2026-07-15",
            plannedOn: "2026-07-15",
            accountId: "account-409",
          },
          {
            id: "transaction-posted-409",
            description: "Mercado efetivado",
            kind: "expense",
            status: "posted",
            amountMinor: 9000,
            occurredOn: "2026-07-16",
            plannedOn: "2026-07-16",
            effectiveOn: "2026-07-16",
            accountId: "account-409",
          },
          {
            id: "transaction-reconciled-409",
            description: "Salario conciliado",
            kind: "income",
            status: "reconciled",
            amountMinor: 300000,
            occurredOn: "2026-07-05",
            plannedOn: "2026-07-05",
            effectiveOn: "2026-07-05",
            accountId: "account-409",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderTransactionsPage(
    "session-token",
    new URL("http://solverfin.test/lancamentos?accountId=account-409&month=2026-07"),
  );

  assert.match(html, /Conta futura/);
  assert.match(html, /Mercado efetivado/);
  assert.match(html, /Salario conciliado/);
  assert.match(html, /<span class="chip chip-pending"><strong>1<\/strong>Pendentes<\/span>/);
  assert.match(html, /<span class="chip chip-posted"><strong>1<\/strong>Não conciliados<\/span>/);
  assert.match(html, /<span class="chip chip-ok"><strong>1<\/strong>Conciliados<\/span>/);
  assert.doesNotMatch(html, /data-status-filter/);
  assert.doesNotMatch(html, /Compromissos previsíveis/);
  assert.doesNotMatch(html, /Parcelas do período/);
}

async function issue409KeepsCardPurchasesInMainInvoiceListAndLocksClosedInvoiceEdits(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [
          {
            id: "card-409",
            name: "Cartao issue 409",
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
            id: "invoice-closed-409",
            cardId: "card-409",
            status: "closed",
            periodStartOn: "2026-06-21",
            periodEndOn: "2026-07-20",
            dueOn: "2026-08-10",
            totalAmountMinor: 45000,
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [{ id: "category-409", name: "Casa" }] });
    }

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [{ id: "account-409", name: "Conta pagamento" }] });
    }

    if (url.pathname === "/api/credit-card-accounts/card-409/instruments") {
      return jsonResponse({
        instruments: [
          {
            id: "instrument-409",
            type: "physical",
            holder: "primary",
            status: "active",
            isDefault: true,
          },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("cardId"), "card-409");
      return jsonResponse({ recurrences: [] });
    }

    if (url.pathname === "/api/invoices/invoice-closed-409/summary") {
      return jsonResponse({
        summary: {
          invoiceId: "invoice-closed-409",
          financialProfileId: "profile-409",
          cardId: "card-409",
          cardName: "Cartao issue 409",
          status: "closed",
          periodStartOn: "2026-06-21",
          closingOn: "2026-07-20",
          dueOn: "2026-08-10",
          previousBalanceMinor: 0,
          totalExpensesMinor: 45000,
          totalPaidMinor: 0,
          amountDueMinor: 45000,
          reconciledExpensesMinor: 0,
          unreconciledExpensesMinor: 45000,
          purchasesCount: 1,
          cardTotals: [],
        },
      });
    }

    if (url.pathname === "/api/invoices/invoice-closed-409/purchases") {
      return jsonResponse({
        purchases: [
          {
            id: "purchase-closed-409",
            financialProfileId: "profile-409",
            cardId: "card-409",
            cardInstrumentId: "instrument-409",
            invoiceId: "invoice-closed-409",
            categoryId: "category-409",
            occurredOn: "2026-07-10",
            description: "Compra em fatura fechada",
            amountMinor: 45000,
            currency: "BRL",
            status: "posted",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderCardsPage("session-token");

  assert.match(html, /Compras e parcelas/);
  assert.match(html, /Compra em fatura fechada/);
  assert.match(html, /value="instrument-409" selected/);
  assert.match(html, /data-edit-purchase="purchase-closed-409" disabled/);
  assert.doesNotMatch(html, /Histórico da fatura/);
  assert.doesNotMatch(html, /installments-section/);
  assert.doesNotMatch(html, /Recorrências deste cartão/);
  assert.doesNotMatch(html, /data-move-purchase/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
