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
    return jsonResponse({});
  };

  const html = await renderCardsPageV2(
    "session-token",
    new URL(`http://solverfin.local/cartoes?cardId=card-1&month=${currentMonth}`),
  );

  const navigation =
    /<div class="cards-invoice-navigation"[\s\S]*?<\/div>\s*<\/div>/.exec(html)?.[0] ?? html;
  const currentIndex = navigation.indexOf("Sem fatura");
  const nextIndex = navigation.indexOf("invoice-next");
  const laterIndex = navigation.indexOf("invoice-later");

  assert.ok(currentIndex >= 0, "mês corrente deve aparecer mesmo sem fatura criada");
  assert.ok(nextIndex > currentIndex, "próximo mês deve aparecer à direita do mês corrente");
  assert.ok(laterIndex > nextIndex, "meses futuros devem seguir ordem cronológica crescente");
  assert.equal(
    navigation.includes("invoice-previous"),
    false,
    "meses anteriores ao corrente não devem preceder a navegação futura",
  );
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
