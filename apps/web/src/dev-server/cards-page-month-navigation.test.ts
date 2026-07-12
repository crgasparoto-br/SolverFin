import assert from "node:assert/strict";

import {
  formatInvoiceMonth,
  renderCardsPageWithMonthNavigation,
  shiftInvoiceMonth,
} from "./cards-page-month-navigation.js";

const originalFetch = globalThis.fetch;

try {
  assert.equal(shiftInvoiceMonth("2026-07", -1), "2026-06");
  assert.equal(shiftInvoiceMonth("2026-07", 1), "2026-08");
  assert.equal(shiftInvoiceMonth("2026-01", -1), "2025-12");
  assert.equal(shiftInvoiceMonth("2026-12", 1), "2027-01");
  assert.equal(formatInvoiceMonth("2026-07"), "Julho de 2026");

  await assertExistingInvoiceMonth();
  await assertMissingInvoiceMonth();
  await assertInitialMonthState();
} finally {
  globalThis.fetch = originalFetch;
}

async function assertExistingInvoiceMonth(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2026-06&sort=amount_desc"),
  );

  assert.match(html, /name="month" value="2026-06" data-invoice-month-input/);
  assert.match(html, /Compra de junho/);
  assert.doesNotMatch(html, /Compra de julho/);
  assertMonthNavigation(html, "2026-05", "2026-07", "amount_desc");
}

async function assertMissingInvoiceMonth(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-1&month=2026-08"),
  );

  assert.match(html, /name="month" value="2026-08" data-invoice-month-input/);
  assert.match(html, /Nenhuma fatura em Agosto de 2026/);
  assert.doesNotMatch(html, /data-modal="payment"/);
  assert.match(html, /name="invoiceId" value="" data-invoice-input/);
  assertMonthNavigation(html, "2026-07", "2026-09");
}

async function assertInitialMonthState(): Promise<void> {
  installFetch();
  const html = await renderCardsPageWithMonthNavigation(
    "session-token",
    new URL("http://localhost/cartoes?cardId=card-1"),
  );

  assert.match(html, /name="month" value="2026-07" data-invoice-month-input/);
  assertMonthNavigation(html, "2026-06", "2026-08");
}

function assertMonthNavigation(
  html: string,
  previousMonth: string,
  nextMonth: string,
  sort?: string,
): void {
  const sortSuffix = sort ? `&amp;sort=${sort}` : "";

  assert.match(
    html,
    /<div class="month-nav">[\s\S]*?<a class="icon-btn month-nav-link"[\s\S]*?&#8249;<\/a>[\s\S]*?<input[^>]*type="month"[^>]*data-invoice-month-input[\s\S]*?<a class="icon-btn month-nav-link"[\s\S]*?&#8250;<\/a>[\s\S]*?<\/div>/,
  );
  assert.doesNotMatch(html, /month-picker-button|data-open-month-picker|Abrir calendário da fatura/);
  assert.match(
    html,
    new RegExp(
      `href="/cartoes\\?cardId=card-1&amp;month=${previousMonth}${sortSuffix}" aria-label="Fatura anterior"`,
    ),
  );
  assert.match(
    html,
    new RegExp(
      `href="/cartoes\\?cardId=card-1&amp;month=${nextMonth}${sortSuffix}" aria-label="Próxima fatura"`,
    ),
  );
  assert.equal((html.match(/data-invoice-current/g) ?? []).length, 1);
  assert.match(
    html,
    new RegExp(
      `class="ghost-btn month-current-link" href="/cartoes\\?cardId=card-1&amp;month=\\d{4}-\\d{2}${sortSuffix}" data-invoice-current role="button">Mês atual</a>`,
    ),
  );
  assert.doesNotMatch(html, /data-invoice-step=|data-month-step=/);
  assert.match(html, /data-invoice-month-navigation-controller/);
  assert.doesNotMatch(html, /showPicker|querySelector\('\[data-open-month-picker\]'\)/);
  assert.match(html, /invoiceInput\.disabled = true/);
  assert.match(html, /form\.requestSubmit\(\)/);

  assert.match(
    html,
    /\.card-filter \.month-nav\{align-items:center;background:var\(--bg\);border:1px solid var\(--line\);border-radius:var\(--radius\);display:grid;gap:4px;grid-template-columns:auto minmax\(0,1fr\) auto;padding:3px\}/,
  );
  assert.match(
    html,
    /\.card-filter \.month-nav input\[data-invoice-month-input\]\{background:transparent!important;border:0!important;[^}]*font-size:\.875rem;[^}]*min-height:30px;/,
  );
  assert.match(html, /::-webkit-calendar-picker-indicator\{cursor:pointer;display:block;opacity:1\}/);
  assert.match(
    html,
    /\.card-filter \.month-current-link\{[^}]*background:var\(--surface\);[^}]*border:1px solid var\(--line\);[^}]*color:var\(--primary\);/,
  );
  assert.doesNotMatch(html, /-webkit-appearance:none|calendar-picker-indicator\{display:none\}/);
  assert.doesNotMatch(html, /invoiceId=[^"&]+/);
}

function installFetch(): void {
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/api/cards") {
      return jsonResponse({
        cards: [{ id: "card-1", name: "Cartão Principal", status: "active", closingDay: 20, dueDay: 10 }],
      });
    }
    if (url.pathname === "/api/invoices") {
      return jsonResponse({
        invoices: [
          invoice("invoice-july", "open", "2026-07-20", "2026-08-10", 7000),
          invoice("invoice-june", "closed", "2026-06-20", "2026-07-10", 6000),
        ],
      });
    }
    if (url.pathname === "/api/categories") return jsonResponse({ categories: [] });
    if (url.pathname === "/api/accounts") return jsonResponse({ accounts: [] });
    if (url.pathname === "/api/credit-card-accounts/card-1/instruments") return jsonResponse({ instruments: [] });
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    if (url.pathname === "/api/invoices/invoice-july/summary") {
      return jsonResponse({ summary: summary("invoice-july", "open", "2026-07-20", "2026-08-10", 7000) });
    }
    if (url.pathname === "/api/invoices/invoice-june/summary") {
      return jsonResponse({ summary: summary("invoice-june", "closed", "2026-06-20", "2026-07-10", 6000) });
    }
    if (url.pathname === "/api/invoices/invoice-july/purchases") {
      return jsonResponse({ purchases: [purchase("purchase-july", "invoice-july", "2026-07-15", "Compra de julho", 7000)] });
    }
    if (url.pathname === "/api/invoices/invoice-june/purchases") {
      return jsonResponse({ purchases: [purchase("purchase-june", "invoice-june", "2026-06-15", "Compra de junho", 6000)] });
    }
    return jsonResponse({});
  };
}

function invoice(id: string, status: string, periodEndOn: string, dueOn: string, totalAmountMinor: number): Record<string, unknown> {
  return { id, cardId: "card-1", status, periodStartOn: `${periodEndOn.slice(0, 8)}01`, periodEndOn, dueOn, totalAmountMinor };
}

function summary(invoiceId: string, status: string, closingOn: string, dueOn: string, totalExpensesMinor: number): Record<string, unknown> {
  return { invoiceId, financialProfileId: "profile-1", cardId: "card-1", cardName: "Cartão Principal", status, periodStartOn: `${closingOn.slice(0, 8)}01`, closingOn, dueOn, previousBalanceMinor: 0, totalExpensesMinor, totalPaidMinor: 0, amountDueMinor: totalExpensesMinor, reconciledExpensesMinor: 0, unreconciledExpensesMinor: totalExpensesMinor, purchasesCount: 1, cardTotals: [] };
}

function purchase(id: string, invoiceId: string, occurredOn: string, description: string, amountMinor: number): Record<string, unknown> {
  return { id, financialProfileId: "profile-1", cardId: "card-1", invoiceId, occurredOn, description, amountMinor, currency: "BRL", status: "posted" };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
