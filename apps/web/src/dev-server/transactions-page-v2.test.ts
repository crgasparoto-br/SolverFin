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

test("A2 transfer form exposes native destination value and derived rate controls", async () => {
  globalThis.fetch = mockFetch([]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08"),
    );

    assert.match(
      html,
      /<span class="field-label">Valor origem <span class="nowrap">\(<span data-source-currency>USD<\/span>\)<\/span><\/span>/,
    );
    assert.match(html, /name="destinationAmountMinor"/);
    assert.match(html, /data-effective-rate/);
    assert.match(html, /data-currency="BRL">Conta principal · BRL<\/option>/);
    assert.match(html, /isCrossCurrencyTransfer/);
    assert.match(html, /BigInt\(destinationMinor\) \* scale/);
    assert.doesNotMatch(html, /destinationMinor \/ sourceMinor/);
    assert.match(html, /data-cross-currency-repeat-hint/);
    assert.match(html, /recorrência e parcelamento não estão disponíveis/);
    assert.match(html, /event\.target\.name === "accountId"/);
    assert.match(html, /installmentOption\.disabled = crossCurrency/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 transfer form shows the statement account as read-only source next to the destination (#677)", async () => {
  globalThis.fetch = mockFetch([]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08"),
    );
    const form = html.slice(
      html.indexOf("<form data-form"),
      html.indexOf("</form>", html.indexOf("<form data-form")),
    );

    const source =
      /<label data-field="sourceAccount" hidden><span class="field-label">Conta origem<\/span><input ([^>]*)\/><\/label>/.exec(
        form,
      );
    assert.ok(source, "source account field is rendered in the form body");
    assert.match(source[1] ?? "", /data-source-account-display/);
    assert.match(source[1] ?? "", /value="Conta internacional · USD"/, "name and currency");
    assert.match(source[1] ?? "", /readonly aria-readonly="true"/);
    assert.doesNotMatch(
      source[1] ?? "",
      /name=/,
      "read-only display never submits a second source",
    );
    assert.equal((form.match(/name="accountId"/g) ?? []).length, 1, "single source of accountId");
    assert.doesNotMatch(
      form,
      /<select name="accountId"/,
      "creation has no editable source selector",
    );

    assert.match(
      form,
      /<label data-field="destinationAccountId" hidden><span class="field-label">Conta destino<\/span><select name="destinationAccountId" data-destination-account-select disabled><option value="" data-currency="">Selecione a conta destino<\/option>/,
    );
    assert.ok(
      form.indexOf('data-field="sourceAccount"') <
        form.indexOf('data-field="destinationAccountId"') &&
        form.indexOf('data-field="destinationAccountId"') < form.indexOf('name="amountMinor"'),
      "source and destination are adjacent and precede the amounts",
    );
    assert.match(
      form,
      /<span class="field-label">Valor destino <span class="nowrap">\(<span data-destination-currency>moeda destino<\/span>\)<\/span><\/span>/,
    );
    assert.match(form, /<span class="rate-value"><output data-effective-rate>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 transfer script keeps source/destination single-sourced and allows fixed same-currency transfers (#677)", async () => {
  globalThis.fetch = mockFetch([]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08"),
    );

    assert.match(
      html,
      /const accountLabels = new Map\(\[\["account-usd","Conta internacional · USD"\]/,
    );
    assert.match(
      html,
      /const sourceAccountId = \(\) => String\(Array\.from\(form\.querySelectorAll\('\[name="accountId"\]'\)\)\.find\(\(field\) => !field\.disabled\)/,
    );
    assert.match(
      html,
      /destinationSelect\.disabled = !transfer;/,
      "non-transfer kinds never submit a destination",
    );
    assert.match(
      html,
      /option\.disabled = option\.value === sourceId/,
      "source is unavailable as destination",
    );
    assert.match(html, /Escolha uma conta destino diferente da conta origem\./);
    assert.match(
      html,
      /if \(!transfer\) \{\s*destinationSelect\.value = "";/,
      "leaving transfer clears residual state",
    );
    assert.match(
      html,
      /fixedOption\.disabled = crossCurrency;/,
      "fixed is blocked only for cross-currency",
    );
    assert.doesNotMatch(html, /fixedOption\.disabled = kind === "transfer"/);
    assert.match(
      html,
      /if \(destinationAccountId && result\.kind === "transfer"\) result\.destinationAccountId/,
    );
    assert.match(
      html,
      /accountId: item\.accountId, destinationAccountId: item\.destinationAccountId/,
    );
    assert.match(html, /if \(!form\.checkValidity\(\)\) \{ form\.reportValidity\(\); return; \}/);
    assert.match(html, /RECURRENCE_TRANSFER_CURRENCY_UNSUPPORTED: "Transferências fixas exigem/);
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
          {
            id: "account-brl",
            name: "Conta principal",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "BRL",
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
