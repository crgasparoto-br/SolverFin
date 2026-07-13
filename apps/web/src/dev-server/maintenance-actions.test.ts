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
  await cardsExposeBlockArchivePurchaseAndInvoiceActions();
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

  assert.match(
    html,
    /data-api-method="POST" data-api-path="\/api\/categories\/category-1\/archive"/,
  );
  assert.match(html, /Arquivar categoria/);
  assert.match(html, /Restaurar categoria/);
}

async function transactionsKeepStatementAndExposeMaintenanceActions(): Promise<void> {
  const html = await renderTransactionsPage(
    "token",
    new URL("/lancamentos?month=2026-06", "http://solverfin.test"),
  );

  assert.match(html, /<h1>Extrato Bancário<\/h1>/);
  assert.match(html, /Movimentações/);
  assert.match(html, /<label for="filter-month">Mês<\/label>/);
  assert.match(html, /id="filter-month" name="month" type="month" value="2026-06"/);
  assert.match(html, /01\/06\/2026 até 30\/06\/2026/);
  assert.match(html, /statement-layout/);
  assert.match(html, /grid-template-columns:\s*minmax\(260px,\s*320px\)\s+minmax\(0,1fr\)/);
  assert.match(html, /Resumo da Conta/);
  assert.doesNotMatch(html, /summary-grid/);
  assert.match(
    html,
    /data-action data-method="PATCH" data-path="\/api\/transactions\/transaction-1"/,
  );
  assert.match(html, /Excluir/);
}

async function cardsExposeBlockArchivePurchaseAndInvoiceActions(): Promise<void> {
  const html = await renderCardsPage("token");

  assert.match(html, /Cartões de Crédito/);
  assert.match(html, /Salvar compra/);
  assert.match(html, /data-path="\/api\/credit-card-accounts\/card-1\/purchases"/);
  assert.match(html, /Fechar fatura/);
  assert.match(html, /data-api-path="\/api\/invoices\/invoice-1\/close"/);
  assert.match(html, /data-path="\/api\/invoices\/invoice-1\/pay"/);
  assert.match(html, /Lançar pagamento/);
}

async function budgetsExposeUsageAndArchiveActions(): Promise<void> {
  const html = await renderBudgetsPage("token");

  assert.match(
    html,
    /data-api-path="\/api\/budgets\/budget-1\/usage" title="Ver uso do orçamento">[\s\S]*?Uso<\/button>/,
  );
  assert.match(
    html,
    /data-api-path="\/api\/budgets\/budget-1\/archive" data-api-confirm="Arquivar este orçamento\?"/,
  );
  assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/budgets\/budget-1"/);
  assert.match(html, /data-open-dialog="new-budget-dialog"/);
  assert.match(html, /id="edit-budget-dialog-budget-1"/);
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
      categories:
        searchParams.get("status") === "all"
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

  if (pathname === "/api/invoices") {
    return {
      invoices: [
        {
          id: "invoice-1",
          cardId: "card-1",
          status: "open",
          periodStartOn: "2026-06-01",
          periodEndOn: "2026-06-30",
          dueOn: "2026-07-10",
          totalAmountMinor: 45000,
        },
      ],
    };
  }

  if (pathname === "/api/invoices/invoice-1/summary") {
    return {
      summary: {
        invoiceId: "invoice-1",
        financialProfileId: "profile-1",
        cardId: "card-1",
        cardName: "Cartão principal",
        status: "open",
        periodStartOn: "2026-06-01",
        closingOn: "2026-06-10",
        dueOn: "2026-07-10",
        previousBalanceMinor: 0,
        totalExpensesMinor: 45000,
        totalPaidMinor: 0,
        amountDueMinor: 45000,
        reconciledExpensesMinor: 0,
        unreconciledExpensesMinor: 45000,
        purchasesCount: 0,
        cardTotals: [],
      },
    };
  }

  if (pathname === "/api/invoices/invoice-1/purchases") {
    return { purchases: [] };
  }

  if (pathname === "/api/recurrences") {
    return { recurrences: [] };
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
