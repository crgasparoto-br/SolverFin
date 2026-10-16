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
    assert.match(
      html,
      /data-attachment-workspace data-entity-kind="transaction" data-entity-id="" data-pending-create/,
    );
    assert.match(
      html,
      /window\.SolverFinAttachments\.uploadPending\(attachmentWorkspace, linkedId\)/,
    );
    assert.match(html, /response\.clone\(\)\.json\(\)/);
    assert.match(html, /form\.dataset\.method = "PATCH"/);
    assert.match(html, /Em parcelas ou recorrências, anexe na edição de uma ocorrência/);
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

test("A2 transaction modal exposes status through tooltips and keeps Cancel and Save together", async () => {
  globalThis.fetch = mockFetch([]);
  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08"),
    );
    assert.match(html, /class="status-icons" role="radiogroup"/);
    assert.match(
      html,
      /data-status-option="planned"[^>]*aria-label="Previsto\/pendente" title="Previsto\/pendente"/,
    );
    assert.match(
      html,
      /data-status-option="posted"[^>]*aria-label="Efetivado não conciliado" title="Efetivado não conciliado"/,
    );
    assert.match(
      html,
      /data-status-option="reconciled"[^>]*aria-label="Conciliado" title="Conciliado"/,
    );
    assert.match(html, /data-status-label aria-live="polite"/);
    assert.match(
      html,
      /\.save-row \.status-label\{position:absolute;width:1px;height:1px;overflow:hidden/,
    );
    assert.match(
      html,
      /class="statement-save-actions"><button type="button" class="ghost-btn" data-transaction-cancel data-statement-entry-cancel>Cancelar<\/button><button type="submit"/,
    );
    assert.match(
      html,
      /\.statement-save-actions\{align-items:center;display:flex;flex:0 0 auto;flex-wrap:nowrap/,
    );
    assert.match(html, /\.save-row\{display:flex;flex-direction:row;flex-wrap:wrap/);
    assert.match(
      html,
      /\.statement-save-actions\{box-sizing:border-box;flex:1 1 100%;justify-content:stretch;margin-left:0;max-width:100%;width:100%\}/,
    );
    assert.match(html, /\.statement-save-actions>button\[type=submit\]\{flex:1 1 0\}/);
    assert.match(
      html,
      /\.statement-save-actions \[data-popup-action-icon\]\{display:none!important\}/,
    );
    assert.match(html, /\[data-transaction-cancel\].*addEventListener\("click"/s);
    assert.match(html, /button\.setAttribute\("aria-checked", String\(active\)\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 account picker allocates a wider responsive filter column (#708)", async () => {
  globalThis.fetch = mockFetch([]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08"),
    );

    assert.match(html, /grid-template-columns:minmax\(18rem,1\.35fr\) minmax\(12rem,\.75fr\)/);
    assert.match(
      html,
      /@media\(max-width:1279px\)\{\.statement-layout\{[^}]+\}\.account-summary\{[^}]+\}\.summary-totals\{[^}]+\}\.filter-form\{grid-template-columns:minmax\(18rem,1\.25fr\) minmax\(12rem,\.75fr\)\}/,
    );
    assert.match(html, /class="account-select-trigger"[^>]+aria-haspopup="listbox"/);
    assert.match(html, /class="account-select-menu" role="listbox"/);
    assert.match(html, /name="accountId"[^>]+data-account-input/);
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
    assert.match(
      html,
      /<option value="category-food" data-kind="expense" selected>Alimentação<\/option>/,
    );
    assert.match(html, /name="merchantKey" value="mercado central"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 category filter displays the same selectable parent-child hierarchy as the entry form", async () => {
  const categories = [
    {
      id: "restaurant",
      name: "Restaurantes",
      kind: "expense",
      status: "active",
      parentCategoryId: "food",
    },
    { id: "food", name: "Alimentação", kind: "expense", status: "active", parentCategoryId: null },
    {
      id: "delivery",
      name: "Delivery",
      kind: "expense",
      status: "active",
      parentCategoryId: "restaurant",
    },
    { id: "health", name: "Saúde", kind: "expense", status: "active" },
    {
      id: "orphan",
      name: "Sem pai cadastrado",
      kind: "expense",
      status: "active",
      parentCategoryId: "removed",
    },
  ];
  globalThis.fetch = mockFetch(
    [transaction("lunch", "Almoço", 2400, "2026-08-05", "expense", "delivery")],
    categories,
  );
  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL(
        "http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08&categoryId=delivery",
      ),
    );
    const select = /<select id="statement-category"[^>]*>([\s\S]*?)<\/select>/.exec(html)?.[1];
    assert.ok(select, "The category filter must render a native selectable combobox.");
    const root = select.indexOf('value="food"');
    const child = select.indexOf('value="restaurant"');
    const grandchild = select.indexOf('value="delivery"');
    assert.ok(
      root >= 0 && root < child && child < grandchild,
      "Parents must precede nested children.",
    );
    assert.match(select, /<option value="food" data-kind="expense">Alimentação<\/option>/);
    assert.match(
      select,
      /<option value="restaurant" data-kind="expense">\u00a0\u00a0↳ Restaurantes<\/option>/,
    );
    assert.match(
      select,
      /<option value="delivery" data-kind="expense" selected>\u00a0\u00a0\u00a0\u00a0↳ Delivery<\/option>/,
    );
    assert.match(select, /<option value="orphan" data-kind="expense">Sem pai cadastrado<\/option>/);
    assert.match(
      html,
      /Almoço/,
      "Choosing a nested category must keep its existing exact-ID filter.",
    );
    assert.ok(
      html.indexOf('value="food"') < html.indexOf('value="restaurant"'),
      "The dialog must share the same category hierarchy.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 statement filters type, effective status and reconciliation without changing totals", async () => {
  const income = transaction("income", "Receita exemplo", 9000, "2026-08-04", "income");
  const reconciled = {
    ...transaction("reconciled", "Despesa conciliada", 1200, "2026-08-05"),
    status: "reconciled",
  };
  const pending = {
    ...transaction("pending", "Despesa pendente", 1700, "2026-08-06"),
    status: "suggested",
    effectiveOn: undefined,
  };
  globalThis.fetch = mockFetch([income, reconciled, pending]);

  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL(
        "http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08&kind=expense&status=suggested&reconciliation=unreconciled",
      ),
    );
    assert.match(html, /Despesa pendente/);
    assert.doesNotMatch(html, /Receita exemplo/);
    assert.doesNotMatch(html, /Despesa conciliada/);
    assert.match(html, /<option value="expense" selected>Despesa<\/option>/);
    assert.match(html, /<option value="suggested" selected>Pendente<\/option>/);
    assert.match(html, /<option value="unreconciled" selected>Não conciliado<\/option>/);
    assert.match(html, /name="status"/);
    assert.match(html, /name="reconciliation"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function mockFetch(
  transactions: Record<string, unknown>[],
  categories: Record<string, unknown>[] = [
    { id: "category-food", name: "Alimentação", kind: "expense", status: "active" },
    { id: "category-health", name: "Saúde", kind: "expense", status: "active" },
  ],
) {
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
      return jsonResponse({ categories });
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

test("A2 consolidated BRL mode identifies each account and excludes USD without changing financial actions", async () => {
  globalThis.fetch = mockFetch([
    {
      ...transaction("brl-expense", "Mercado BRL", 2500, "2026-08-05"),
      currency: "BRL",
      accountId: "account-brl",
    },
    transaction("usd-income", "Receita USD", 5000, "2026-08-06", "income"),
  ]);
  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=BRL&month=2026-08"),
    );
    assert.match(html, /data-account-option="all"/);
    assert.match(html, /data-all-accounts/);
    assert.match(
      html,
      /<select id="statement-currency" name="currency" required data-auto-currency>/,
    );
    assert.match(html, /data-context="currency">BRL/);
    assert.match(html, /Todas as contas \(1\)/);
    assert.match(html, /Saldo consolidado/);
    assert.match(html, /Mercado BRL/);
    assert.match(html, /Conta: Conta principal/);
    assert.doesNotMatch(html, /Receita USD/);
    assert.match(html, /data-edit="brl-expense"/);
    assert.match(html, /Ver lançamento na conta/);
    assert.match(html, /data-clone="brl-expense"/);
    assert.match(
      html,
      /data-action data-method="PATCH" data-path="\/api\/transactions\/brl-expense"/,
    );
    assert.match(
      html,
      /data-action data-method="POST" data-path="\/api\/transactions\/brl-expense\/void"/,
    );
    assert.match(
      html,
      /<details class="actions col-actions"><summary aria-label="Ações do lançamento Mercado BRL"/,
    );
    assert.match(html, /<span>Ver na conta<\/span>/);
    assert.match(html, /rowSourceId = String\(transaction.accountId \|\| ""\)/);
    assert.match(html, /accountLabels.get\(rowSourceId\)/);
    assert.match(html, /submitButton.disabled = false/);
    assert.match(html, /submitButton.disabled = !accountCurrencies.get\(sourceAccountId\(\)\)/);
    assert.match(
      html,
      /accountId=account-brl&amp;month=2026-08|accountId=account-brl&month=2026-08/,
    );
    assert.match(html, /currencyInput\.setAttribute\('form', filterForm\.id\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 consolidated USD mode preserves USD and does not merge BRL totals", async () => {
  globalThis.fetch = mockFetch([
    {
      ...transaction("brl-income", "Receita BRL", 2500, "2026-08-05", "income"),
      currency: "BRL",
      accountId: "account-brl",
    },
    transaction("usd-expense", "Despesa USD", 900, "2026-08-06"),
  ]);
  try {
    const html = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=USD&month=2026-08"),
    );
    assert.match(html, /data-context="currency">USD/);
    assert.match(html, /Despesa USD/);
    assert.match(html, /Conta: Conta internacional/);
    assert.doesNotMatch(html, /Receita BRL/);
    assert.match(html, /data-edit="usd-expense"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 account and consolidated cards both include FX legs while same-currency transfers net out in All accounts", async () => {
  const movements: Record<string, unknown>[] = [
    {
      ...transaction("brl-out", "Transferência Bradesco → Mercado Livre", 500000, "2026-09-01"),
      kind: "transfer",
      currency: "BRL",
      accountId: "account-brl",
      destinationAccountId: "account-usd",
      destinationCurrency: "USD",
      destinationAmountMinor: 95000,
    },
    {
      ...transaction("deposit", "Depósito em Dinheiro", 35000, "2026-09-08", "income"),
      currency: "BRL",
      accountId: "account-brl",
    },
    {
      ...transaction("brl-in", "Transferência Mercado Livre → Bradesco", 100000, "2026-09-10"),
      kind: "transfer",
      currency: "USD",
      accountId: "account-usd",
      destinationAccountId: "account-brl",
      destinationCurrency: "BRL",
      destinationAmountMinor: 100000,
    },
  ];
  const baseFetch = mockFetch(movements);
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://solverfin.test");
    const accountId = url.searchParams.get("accountId");
    if (url.pathname === "/api/transactions" && accountId) {
      return jsonResponse({
        transactions: movements.filter(
          (transaction) =>
            transaction.accountId === accountId || transaction.destinationAccountId === accountId,
        ),
      });
    }
    return baseFetch(input);
  };
  const card = (html: string, name: string) => {
    const start = html.indexOf(`<div class="summary-total" data-summary-total="${name}">`);
    assert.ok(start >= 0, `Missing ${name} card`);
    return html.slice(start, html.indexOf("</div>", start));
  };
  try {
    const individual = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-brl&month=2026-09"),
    );
    assert.match(card(individual, "income"), /R\$\s1\.350,00/);
    assert.match(card(individual, "expense"), /R\$\s5\.000,00/);
    assert.match(individual, /Transferência Bradesco → Mercado Livre/);
    assert.match(individual, /Transferência Mercado Livre → Bradesco/);

    const consolidated = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=BRL&month=2026-09"),
    );
    assert.match(card(consolidated, "income"), /R\$\s1\.350,00/);
    assert.match(card(consolidated, "expense"), /R\$\s5\.000,00/);
    assert.match(consolidated, /Transferência Bradesco → Mercado Livre/);
    assert.match(consolidated, /Transferência Mercado Livre → Bradesco/);

    const usdConsolidated = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=USD&month=2026-09"),
    );
    assert.match(card(usdConsolidated, "income"), /US\$\s950,00/);
    assert.match(card(usdConsolidated, "expense"), /US\$\s1\.000,00/);

    const usdIndividual = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-09"),
    );
    assert.match(card(usdIndividual, "income"), /US\$\s950,00/);
    assert.match(card(usdIndividual, "expense"), /US\$\s1\.000,00/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 consolidated FX transfer opens the account of the displayed currency", async () => {
  globalThis.fetch = mockFetch([
    {
      ...transaction("fx-in", "Câmbio recebido", 10000, "2026-08-07"),
      kind: "transfer",
      destinationAccountId: "account-brl",
      destinationCurrency: "BRL",
      destinationAmountMinor: 48000,
    },
  ]);
  try {
    const brl = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=BRL&month=2026-08"),
    );
    assert.match(brl, /Conta: Conta internacional → Conta principal/);
    assert.match(brl, /Recebida de Conta internacional/);
    assert.match(brl, /data-edit="fx-in"/);
    assert.match(brl, /data-clone="fx-in"/);
    assert.match(brl, /data-method="PATCH" data-path="\/api\/transactions\/fx-in"/);
    assert.match(brl, /data-method="POST" data-path="\/api\/transactions\/fx-in\/void"/);
    assert.match(brl, /<span>Ver na conta<\/span>/);
    assert.match(brl, /"accountId":"account-usd"/);
    assert.match(
      brl,
      /href="\/lancamentos\?accountId=account-brl&month=2026-08" aria-label="Ver lançamento na conta"/,
      "BRL movement opens the destination, not the USD source",
    );
    assert.doesNotMatch(
      brl,
      /href="\/lancamentos\?accountId=account-usd&month=2026-08" aria-label="Ver lançamento na conta"/,
    );

    const usd = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=USD&month=2026-08"),
    );
    assert.match(
      usd,
      /href="\/lancamentos\?accountId=account-usd&month=2026-08" aria-label="Ver lançamento na conta"/,
      "USD movement opens the source",
    );
    assert.match(usd, /Enviada para Conta principal/);
    assert.match(usd, /data-edit="fx-in"/);
    assert.match(usd, /data-clone="fx-in"/);
    assert.match(usd, /data-transaction="fx-in"/);
    assert.match(usd, /"accountId":"account-usd"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("A2 currency selector is visible but locked for an individual account and editable for all accounts", async () => {
  globalThis.fetch = mockFetch([]);
  try {
    const individual = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=account-usd&month=2026-08"),
    );
    assert.match(individual, /data-currency-picker/);
    assert.match(individual, /Moeda: USD/);
    assert.doesNotMatch(individual, /<select id="statement-currency"/);
    assert.doesNotMatch(
      individual,
      /<div class="account-field" data-currency-picker data-all-accounts/,
    );

    const consolidated = await renderTransactionsPageV2(
      "session-token",
      new URL("http://solverfin.test/lancamentos?accountId=all&currency=BRL&month=2026-08"),
    );
    assert.match(consolidated, /data-all-accounts/);
    assert.match(
      consolidated,
      /<label class="statement-currency-field" for="statement-currency"><span>Moeda<\/span><select id="statement-currency" name="currency" required data-auto-currency>/,
    );
    assert.match(consolidated, /<option value="BRL" selected>BRL<\/option>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
