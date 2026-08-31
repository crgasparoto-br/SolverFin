import assert from "node:assert/strict";
import test from "node:test";

import { renderTransactionsPageV2 } from "./transactions-page-v2.js";

const originalFetch = globalThis.fetch;

test("A2 statement keeps account and USD currency explicit while sorting before render", async () => {
  globalThis.fetch = mockFetch([
    transaction("older", "Assinatura", 2500, "2026-08-02"),
    transaction("newer", "Receita exterior", 15000, "2026-08-20", "income"),
  ]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL(
        "http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08&sort=date_desc",
      ),
    );

    assert.match(html, /data-statement-archetype="A2"/);
    assert.match(html, /class="sf-page-header"/);
    assert.match(html, /class="sf-filter-bar"/);
    assert.match(html, /Conta internacional/);
    assert.match(html, /data-context="currency">USD</);
    assert.match(html, /US\$|USD/);
    assert.doesNotMatch(html, /Valor \(R\$\)/);
    assert.ok(html.indexOf("Receita exterior") < html.indexOf("Assinatura"));
    assert.match(html, /data-statement-date-group="2026-08-20"/);
    assert.match(html, /name="q" type="search"/);
    assert.match(html, /name="sort"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 statement applies insight and text filters before rendering rows", async () => {
  globalThis.fetch = mockFetch([
    transaction("matching", "Mercado Central 123", 4000, "2026-08-04", "expense", "category-food"),
    transaction("other", "Farmácia", 1800, "2026-08-05", "expense", "category-health"),
  ]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL(
        "http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08&categoryId=category-food&merchantKey=mercado%20central&q=mercado",
      ),
    );

    assert.match(html, /Filtro do insight ativo/);
    assert.match(html, /Mercado Central 123/);
    assert.doesNotMatch(html, /Farmácia/);
    assert.match(html, /name="categoryId" value="category-food"/);
    assert.match(html, /name="merchantKey" value="mercado central"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function mockFetch(transactions: Record<string, unknown>[]) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");
    if (url.pathname === "/api/accounts") {
      return jsonResponse({
        accounts: [
          {
            id: "account-usd",
            name: "Conta internacional",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 10000,
            currency: "USD",
          },
        ],
      });
    }
    if (url.pathname === "/api/categories") {
      return jsonResponse({
        categories: [
          { id: "category-food", name: "Alimentação", kind: "expense", status: "active" },
          { id: "category-health", name: "Saúde", kind: "expense", status: "active" },
        ],
      });
    }
    if (url.pathname === "/api/recurrences") return jsonResponse({ recurrences: [] });
    if (url.pathname === "/api/transaction-groups") return jsonResponse({ groups: [] });
    if (url.pathname === "/api/transactions") return jsonResponse({ transactions });
    return jsonResponse({});
  };
}

function transaction(
  id: string,
  description: string,
  amountMinor: number,
  date: string,
  kind: "income" | "expense" = "expense",
  categoryId?: string,
): Record<string, unknown> {
  return {
    id,
    description,
    kind,
    status: "posted",
    amountMinor,
    currency: "USD",
    occurredOn: date,
    plannedOn: date,
    effectiveOn: date,
    accountId: "account-usd",
    ...(categoryId ? { categoryId } : {}),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
