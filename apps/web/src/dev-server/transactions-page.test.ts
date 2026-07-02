import assert from "node:assert/strict";

import { renderTransactionsPage } from "./transactions-page.js";

const originalFetch = globalThis.fetch;

await transactionsPageShowsRecurringTransactionInsideMovimentacoes();
await transactionsPageShowsPlannedIncomeAndExpenseCommitments();
await transactionsPageHasNoSeparateRecurrencesBlock();
await transactionsPageUsesPreviousMonthEndingBalance();

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
            occurredOn: "2026-07-10",
            plannedOn: "2026-07-10",
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
            startOn: "2026-07-10",
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

async function transactionsPageShowsPlannedIncomeAndExpenseCommitments(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-1",
            name: "Conta principal",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 100000,
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [
          { id: "category-income", name: "Clientes", kind: "income", status: "active" },
          { id: "category-expense", name: "Moradia", kind: "expense", status: "active" },
        ],
      });
    }

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [] });
    }

    if (url.pathname === "/api/transactions") {
      assert.equal(url.searchParams.get("accountId"), "account-1");
      assert.equal(url.searchParams.get("status"), "all");
      assert.equal(url.searchParams.get("plannedTo"), "2026-08-31");

      return jsonResponse({
        transactions: [
          {
            id: "planned-expense",
            description: "Aluguel futuro",
            kind: "expense",
            status: "planned",
            amountMinor: 120000,
            occurredOn: "2026-08-10",
            plannedOn: "2026-08-10",
            accountId: "account-1",
            categoryId: "category-expense",
          },
          {
            id: "planned-income",
            description: "Cliente futuro",
            kind: "income",
            status: "planned",
            amountMinor: 350000,
            occurredOn: "2026-08-18",
            plannedOn: "2026-08-18",
            accountId: "account-1",
            categoryId: "category-income",
          },
          {
            id: "posted-expense",
            description: "Mercado efetivado",
            kind: "expense",
            status: "posted",
            amountMinor: 40000,
            occurredOn: "2026-08-05",
            plannedOn: "2026-08-05",
            effectiveOn: "2026-08-05",
            accountId: "account-1",
            categoryId: "category-expense",
          },
          {
            id: "reconciled-income",
            description: "Salário conciliado",
            kind: "income",
            status: "reconciled",
            amountMinor: 500000,
            occurredOn: "2026-08-07",
            plannedOn: "2026-08-07",
            effectiveOn: "2026-08-07",
            accountId: "account-1",
            categoryId: "category-income",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderTransactionsPage(
    "session-token",
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-08"),
  );

  assert.match(html, /Aluguel futuro/);
  assert.match(html, /Cliente futuro/);
  assert.match(html, /Mercado efetivado/);
  assert.match(html, /Salário conciliado/);
  assert.match(html, /Previsto/);
  assert.match(html, /Efetivado/);
  assert.match(html, /Conciliado/);
  assert.match(html, /Pendentes/);
  assert.match(html, /Marcar como conciliado/);
  assert.doesNotMatch(html, /\/pagar-receber/);
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

async function transactionsPageUsesPreviousMonthEndingBalance(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");

    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-1",
            name: "Conta principal",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 50000,
          },
        ],
      });
    }

    if (url.pathname === "/api/categories") {
      return jsonResponse({ categories: [] });
    }

    if (url.pathname === "/api/recurrences") {
      return jsonResponse({ recurrences: [] });
    }

    if (url.pathname === "/api/transactions") {
      assert.equal(url.searchParams.get("accountId"), "account-1");
      assert.equal(url.searchParams.get("plannedFrom"), null);
      assert.equal(url.searchParams.get("plannedTo"), "2026-06-30");

      return jsonResponse({
        transactions: [
          {
            id: "previous-effective-income",
            description: "Salário maio",
            kind: "income",
            status: "posted",
            amountMinor: 100000,
            occurredOn: "2026-05-20",
            plannedOn: "2026-05-20",
            effectiveOn: "2026-05-20",
            accountId: "account-1",
          },
          {
            id: "previous-planned-expense",
            description: "Despesa prevista maio",
            kind: "expense",
            status: "planned",
            amountMinor: 999999,
            occurredOn: "2026-05-25",
            plannedOn: "2026-05-25",
            accountId: "account-1",
          },
          {
            id: "current-effective-expense",
            description: "Mercado junho",
            kind: "expense",
            status: "posted",
            amountMinor: 25000,
            occurredOn: "2026-06-02",
            plannedOn: "2026-06-02",
            effectiveOn: "2026-06-02",
            accountId: "account-1",
          },
        ],
      });
    }

    return jsonResponse({});
  };

  const html = await renderTransactionsPage(
    "session-token",
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06"),
  );

  assert.match(html, /Mercado junho/);
  assert.match(html, /R\$\s*1\.250,00/);
  assert.doesNotMatch(html, /Salário maio/);
  assert.doesNotMatch(html, /Despesa prevista maio/);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
