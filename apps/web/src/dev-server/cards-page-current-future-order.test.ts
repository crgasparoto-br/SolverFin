import assert from "node:assert/strict";

import { renderCardsPageV2 } from "./cards-page-v2.js";

const originalFetch = globalThis.fetch;

try {
  await cardsNavigationStartsAtCurrentMonthAndMovesForward();
} finally {
  globalThis.fetch = originalFetch;
}

async function cardsNavigationStartsAtCurrentMonthAndMovesForward(): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const previousMonth = shiftMonth(currentMonth, -1);
  const olderMonth = shiftMonth(currentMonth, -2);
  const oldestMonth = shiftMonth(currentMonth, -3);
  const nextMonth = shiftMonth(currentMonth, 1);
  const laterMonth = shiftMonth(currentMonth, 2);

  const invoiceFor = (id: string, month: string) => ({
    id,
    cardId: "card-1",
    status: "open",
    periodStartOn: `${month}-01`,
    periodEndOn: `${month}-20`,
    dueOn: `${shiftMonth(month, 1)}-10`,
    totalAmountMinor: 0,
    currency: "BRL",
  });

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/credit-card-accounts") {
      return jsonResponse({
        creditCardAccounts: [
          {
            id: "card-1",
            name: "Cartão principal",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            currency: "BRL",
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          invoiceFor("invoice-later", laterMonth),
          invoiceFor("invoice-current", currentMonth),
          invoiceFor("invoice-previous", previousMonth),
          invoiceFor("invoice-next", nextMonth),
        ],
      });
    }

    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") {
      return jsonResponse({ instruments: [] });
    }
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    if (url.pathname === "/api/invoices/invoice-current/summary") {
      return jsonResponse({
        summary: {
          amountDueMinor: 0,
          cardId: "card-1",
          cardName: "Cartão principal",
          cardTotals: [],
          closingOn: `${currentMonth}-20`,
          dueOn: `${shiftMonth(currentMonth, 1)}-10`,
          financialProfileId: "profile-1",
          invoiceId: "invoice-current",
          periodStartOn: `${currentMonth}-01`,
          previousBalanceMinor: 0,
          purchasesCount: 0,
          reconciledExpensesMinor: 0,
          status: "open",
          totalExpensesMinor: 0,
          totalPaidMinor: 0,
          unreconciledExpensesMinor: 0,
        },
      });
    }
    if (url.pathname === "/api/invoices/invoice-current/purchases") {
      return jsonResponse({ purchases: [] });
    }
    if (url.pathname === "/api/invoices/invoice-previous/summary") {
      return jsonResponse({
        summary: {
          amountDueMinor: 0,
          cardId: "card-1",
          cardName: "Cartão principal",
          cardTotals: [],
          closingOn: `${previousMonth}-20`,
          dueOn: `${currentMonth}-10`,
          financialProfileId: "profile-1",
          invoiceId: "invoice-previous",
          periodStartOn: `${previousMonth}-01`,
          previousBalanceMinor: 0,
          purchasesCount: 0,
          reconciledExpensesMinor: 0,
          status: "open",
          totalExpensesMinor: 0,
          totalPaidMinor: 0,
          unreconciledExpensesMinor: 0,
        },
      });
    }
    if (url.pathname === "/api/invoices/invoice-previous/purchases") {
      return jsonResponse({ purchases: [] });
    }
    if (url.pathname === "/api/invoices/invoice-next/summary") {
      return jsonResponse({
        summary: {
          amountDueMinor: 0,
          cardId: "card-1",
          cardName: "Cartão principal",
          cardTotals: [],
          closingOn: `${nextMonth}-20`,
          dueOn: `${shiftMonth(nextMonth, 1)}-10`,
          financialProfileId: "profile-1",
          invoiceId: "invoice-next",
          periodStartOn: `${nextMonth}-01`,
          previousBalanceMinor: 0,
          purchasesCount: 0,
          reconciledExpensesMinor: 0,
          status: "open",
          totalExpensesMinor: 0,
          totalPaidMinor: 0,
          unreconciledExpensesMinor: 0,
        },
      });
    }
    if (url.pathname === "/api/invoices/invoice-next/purchases") {
      return jsonResponse({ purchases: [] });
    }
    if (url.pathname === "/api/installments") return jsonResponse({ installments: [] });
    return jsonResponse({});
  };

  const initialHtml = await renderCardsPageV2(
    "session-token",
    new URL("http://solverfin.local/cartoes?cardId=card-1"),
  );
  const initialNavigation = invoiceNavigation(initialHtml);
  assert.match(
    initialNavigation,
    new RegExp(`name="month" value="${currentMonth}"`),
    "entrada sem competência deve permanecer no mês corrente",
  );
  assert.equal(
    initialNavigation.includes("Sem fatura"),
    false,
    "fatura corrente existente deve ser selecionada na entrada implícita",
  );
  assert.equal(
    initialNavigation.includes("invoice-later"),
    false,
    "fatura aberta distante no futuro não pode virar a seleção inicial",
  );

  const historicalInvoiceHtml = await renderCardsPageV2(
    "session-token",
    new URL(
      `http://solverfin.local/cartoes?cardId=card-1&month=${previousMonth}&profileId=profile-1`,
    ),
  );
  const historicalInvoiceNavigation = invoiceNavigation(historicalInvoiceHtml);
  assert.match(
    historicalInvoiceNavigation,
    new RegExp(
      `href="[^"]*month=${olderMonth}[^"]*profileId=profile-1[^"]*" rel="prev"|href="[^"]*profileId=profile-1[^"]*month=${olderMonth}[^"]*" rel="prev"`,
    ),
    "consulta histórica deve permitir voltar exatamente um mês e preservar profileId",
  );
  assert.match(
    historicalInvoiceNavigation,
    new RegExp(
      `href="[^"]*invoiceId=invoice-current[^"]*month=${currentMonth}[^"]*" rel="next"`,
    ),
    "consulta histórica deve avançar exatamente um mês usando a fatura existente",
  );

  const historicalMissingHtml = await renderCardsPageV2(
    "session-token",
    new URL(`http://solverfin.local/cartoes?cardId=card-1&month=${olderMonth}`),
  );
  const historicalMissingNavigation = invoiceNavigation(historicalMissingHtml);
  assert.match(
    historicalMissingNavigation,
    new RegExp(`href="[^"]*month=${oldestMonth}[^"]*" rel="prev"`),
    "mês histórico sem fatura deve continuar permitindo voltar um mês",
  );
  assert.match(
    historicalMissingNavigation,
    new RegExp(
      `href="[^"]*invoiceId=invoice-previous[^"]*month=${previousMonth}[^"]*" rel="next"`,
    ),
    "mês histórico sem fatura deve avançar para a fatura histórica adjacente sem saltos",
  );

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/credit-card-accounts") {
      return jsonResponse({
        creditCardAccounts: [
          {
            id: "card-1",
            name: "Cartão principal",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            currency: "BRL",
          },
        ],
      });
    }

    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          invoiceFor("invoice-later", laterMonth),
          invoiceFor("invoice-previous", previousMonth),
          invoiceFor("invoice-next", nextMonth),
        ],
      });
    }

    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") {
      return jsonResponse({ instruments: [] });
    }
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    if (url.pathname === "/api/invoices/invoice-next/summary") {
      return jsonResponse({
        summary: {
          amountDueMinor: 0,
          cardId: "card-1",
          cardName: "Cartão principal",
          cardTotals: [],
          closingOn: `${nextMonth}-20`,
          dueOn: `${shiftMonth(nextMonth, 1)}-10`,
          financialProfileId: "profile-1",
          invoiceId: "invoice-next",
          periodStartOn: `${nextMonth}-01`,
          previousBalanceMinor: 0,
          purchasesCount: 0,
          reconciledExpensesMinor: 0,
          status: "open",
          totalExpensesMinor: 0,
          totalPaidMinor: 0,
          unreconciledExpensesMinor: 0,
        },
      });
    }
    if (url.pathname === "/api/invoices/invoice-next/purchases") {
      return jsonResponse({ purchases: [] });
    }
    if (url.pathname === "/api/installments") return jsonResponse({ installments: [] });
    return jsonResponse({});
  };

  const currentHtml = await renderCardsPageV2(
    "session-token",
    new URL("http://solverfin.local/cartoes?cardId=card-1"),
  );
  const currentNavigation = invoiceNavigation(currentHtml);

  assert.match(currentNavigation, /Sem fatura/, "mês corrente sem fatura deve manter o estado");
  assert.match(
    currentNavigation,
    /cards-invoice-period-link-previous is-disabled/,
    "mês corrente deve ser o primeiro período elegível",
  );
  assert.match(
    currentNavigation,
    /href="[^"]*invoiceId=invoice-next[^"]*" rel="next"/,
    "próxima deve apontar para a primeira fatura futura",
  );
  assert.equal(
    currentNavigation.includes("invoice-previous"),
    false,
    "faturas anteriores ao mês corrente não devem entrar na navegação",
  );
  assert.equal(
    currentNavigation.includes("invoice-later"),
    false,
    "a navegação compacta deve expor somente o vizinho imediato",
  );

  const nextHtml = await renderCardsPageV2(
    "session-token",
    new URL(
      `http://solverfin.local/cartoes?cardId=card-1&invoiceId=invoice-next&month=${nextMonth}`,
    ),
  );
  const nextNavigation = invoiceNavigation(nextHtml);

  assert.match(
    nextNavigation,
    new RegExp(`href="[^"]*month=${currentMonth}[^"]*" rel="prev"`),
    "ao avançar, Anterior deve retornar ao mês corrente",
  );
  assert.match(
    nextNavigation,
    /href="[^"]*invoiceId=invoice-later[^"]*" rel="next"/,
    "Próxima deve avançar cronologicamente para a fatura seguinte",
  );
  assert.match(
    nextNavigation,
    /data-invoice-month-input/,
    "seletor direto de mês deve continuar disponível",
  );
}

function invoiceNavigation(html: string): string {
  const navigation =
    /<div class="cards-invoice-navigation"[\s\S]*?<\/details>\s*<\/div>/.exec(html)?.[0] ?? html;
  return navigation;
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
