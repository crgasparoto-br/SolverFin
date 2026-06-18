import assert from "node:assert/strict";

import {
  renderAccountsPage,
  renderBudgetsPage,
  renderCardsPage,
  renderCategoriesPage,
  renderTransactionsPage,
} from "../dev-server.js";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input), "http://solverfin.test");
  const body = JSON.stringify(resolveMockBody(url.pathname, url.searchParams));

  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });

async function main(): Promise<void> {
  await accountsExposeEditAndArchiveActions();
  await categoriesExposeRestoreAction();
  await transactionsKeepStatementAndExposeMaintenanceActions();
  await cardsExposeBlockArchiveAndPurchaseActions();
  await budgetsExposeUsageAndArchiveActions();
}

async function accountsExposeEditAndArchiveActions(): Promise<void> {
  const html = await renderAccountsPage("token");

  assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/accounts\/account-1"/);
  assert.match(html, /Arquivar conta/);
  assert.match(html, /Abrir detalhe/);
}

async function categoriesExposeRestoreAction(): Promise<void> {
  const html = await renderCategoriesPage("token");

  assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/categories\/category-1"/);
  assert.match(html, /Arquivar categoria/);
  assert.match(html, /Restaurar categoria/);
}

async function transactionsKeepStatementAndExposeMaintenanceActions(): Promise<void> {
  const html = await renderTransactionsPage("token");

  assert.match(html, /<h1>Extrato da conta<\/h1>/);
  assert.match(html, /Movimentações/);
  assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/transactions\/transaction-1"/);
  assert.match(html, /Cancelar lançamento/);
}

async function cardsExposeBlockArchiveAndPurchaseActions(): Promise<void> {
  const html = await renderCardsPage("token");

  assert.match(html, /Bloquear cartão/);
  assert.match(html, /Arquivar cartão/);
  assert.match(html, /Registrar compra/);
  assert.match(html, /\/api\/cards\/card-1\/purchases/);
}

async function budgetsExposeUsageAndArchiveActions(): Promise<void> {
  const html = await renderBudgetsPage("token");

  assert.match(html, /Consultar uso/);
  assert.match(html, /Arquivar orçamento/);
  assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/budgets\/budget-1"/);
}

function resolveMockBody(pathname: string, searchParams: URLSearchParams): unknown {
  if (pathname === "/api/accounts") {
    return {
      accounts: [
        {
          id: "account-1",
          name: "Conta principal",
          kind: "checking",
          status: "active",
          openingBalanceMinor: 100000,
        },
      ],
    };
  }

  if (pathname === "/api/categories") {
    return {
      categories: searchParams.get("status") === "all"
        ? [
            { id: "category-1", name: "Mercado", kind: "expense", status: "active" },
            { id: "category-2", name: "Antiga", kind: "expense", status: "archived" },
          ]
        : [{ id: "category-1", name: "Mercado", kind: "expense", status: "active" }],
    };
  }

  if (pathname === "/api/transactions") {
    return {
      transactions: [
        {
          id: "transaction-1",
          description: "Compra no mercado",
          kind: "expense",
          status: "posted",
          amountMinor: 12345,
          occurredOn: "2026-06-18",
          accountId: "account-1",
          categoryId: "category-1",
        },
      ],
    };
  }

  if (pathname === "/api/cards") {
    return {
      cards: [
        {
          id: "card-1",
          name: "Cartão principal",
          status: "active",
          closingDay: 10,
          dueDay: 20,
          paymentAccountId: "account-1",
        },
      ],
    };
  }

  if (pathname === "/api/budgets") {
    return {
      budgets: [
        {
          id: "budget-1",
          status: "active",
          categoryId: "category-1",
          periodStartOn: "2026-06-01",
          periodEndOn: "2026-06-30",
          plannedAmountMinor: 90000,
        },
      ],
    };
  }

  return {};
}
