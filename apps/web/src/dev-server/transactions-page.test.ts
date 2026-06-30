import assert from "node:assert/strict";

import { renderTransactionsPage } from "./transactions-page.js";

const originalFetch = globalThis.fetch;

await transactionsPageShowsRecurringTransactionInsideMovimentacoes();
await transactionsPageHasNoSeparateRecurrencesBlock();

globalThis.fetch = originalFetch;

async function transactionsPageShowsRecurringTransactionInsideMovimentacoes(): Promise<void> {
  const calledPaths: string[] = [];

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");
    calledPaths.push(url.pathname);

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-1",
            name: "Conta principal",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [{ id: "category-1", name: "Salário", kind: "income", status: "active" }],
      });
    }

    if (url.pathname === "/api/transactions") {
      return jsonResponse({
        transactions: [
          {
            id: "transaction-1",
            description: "Salário",
            kind: "income",
            status: "planned",
            amountMinor: 500000,
            occurredOn: "2026-06-10",
            plannedOn: "2026-06-10",
            accountId: "account-1",
            categoryId: "category-1",
            recurrenceId: "recurrence-active",
          },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      assert.equal(url.searchParams.get("accountId"), "account-1");
      assert.equal(url.searchParams.get("status"), "all");

      return jsonResponse({
        recurrences: [
          {
            id: "recurrence-active",
            status: "active",
            frequency: "monthly",
            interval: 1,
            startOn: "2026-06-10",
            amountMinor: 500000,
            currency: "BRL",
            description: "Salário",
            kind: "income",
            accountId: "account-1",
            categoryId: "category-1",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderTransactionsPage("session-token");

  assert.match(html, /Movimentações/);
  assert.doesNotMatch(html, /Compromissos previsíveis/);
  assert.doesNotMatch(html, /Recorrências desta conta/);
  assert.match(html, /data-recurrence-edit="recurrence-active"/);
  assert.match(html, /data-recurrence-action-path="\/api\/recurrences\/recurrence-active\/pause"/);
  assert.match(html, /recurrence-indicator/);
  assert.match(html, /data-recurrence-edit-form/);
  assert.match(html, /data-recurrence-installments-form/);
  assert.match(html, /Tipo<select name="kind">/);
  assert.match(html, /kind: item\.kind/);
  assert.doesNotMatch(html, /\/recorrencias/);

  const recurrencesIndex = calledPaths.indexOf("/api/recurrences");
  const transactionsIndex = calledPaths.indexOf("/api/transactions");
  assert.ok(
    recurrencesIndex >= 0 && transactionsIndex >= 0 && recurrencesIndex < transactionsIndex,
    "recurrences must be fetched before transactions so catch-up materialization shows up in the same render",
  );
}

async function transactionsPageHasNoSeparateRecurrencesBlock(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");

    if (url.pathname === "/api/accounts") {
      return jsonResponse({ accounts: [] });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }

    return jsonResponse({});
  };

  const html = await renderTransactionsPage("session-token");

  assert.doesNotMatch(html, /Compromissos previsíveis/);
  assert.doesNotMatch(html, /Recorrências desta conta/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
