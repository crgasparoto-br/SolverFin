import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderBudgetsPage } from "./budgets-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("budgets page issue 619", () => {
  it("renders operational budget metrics without rebuilding projections", async () => {
    globalThis.fetch = baseFetch();

    const html = await renderBudgetsPage("token");

    assert.match(html, /data-budgets-archetype="A1"/);
    assert.match(html, /data-currency="BRL"/);
    assert.match(html, /data-currency="USD"/);
    assert.match(html, />Planejado</);
    assert.match(html, />Realizado</);
    assert.match(html, />Comprometido</);
    assert.match(html, />Projetado</);
    assert.match(html, />Disponível</);
    assert.match(html, /data-column="committed"/);
    assert.match(html, /data-column="projected"/);
    assert.match(html, /data-column="available"/);
    assert.doesNotMatch(html, /data-column="remaining"/);
    assert.doesNotMatch(html, /Valor planejado \(R\$\)/);
  });

  it("does not turn mismatched usage into synthetic realized or projected zero", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") return json({ usage: [] });
      if (url.pathname === "/api/budgets") {
        return json({ budgets: [budget("budget-brl", "BRL", 100_000)] });
      }
      if (url.pathname === "/api/categories") return categoriesJson();
      if (url.pathname === "/api/budgets/budget-brl/usage") {
        return json({
          usage: usage("budget-brl", "USD", 100_000, 40_000, 10_000),
        });
      }
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /data-money-availability="unavailable"/);
    assert.doesNotMatch(html, /data-column="realized"[^]*R\$\s*0,00/);
    assert.doesNotMatch(html, /data-column="committed"[^]*R\$\s*0,00/);
    assert.doesNotMatch(html, /data-column="projected"[^]*R\$\s*0,00/);
    assert.doesNotMatch(html, /data-column="available"[^]*R\$\s*0,00/);
  });

  it("renders unbudgeted usage without fabricating planned or available amounts", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            unbudgetedUsage({
              categoryId: "health",
              realizedAmountMinor: 12_500,
              committedAmountMinor: 2_500,
            }),
          ],
        });
      }
      if (url.pathname === "/api/budgets") {
        return json({ budgets: [budget("budget-brl", "BRL", 100_000)] });
      }
      if (url.pathname === "/api/categories") return categoriesJson();
      if (url.pathname === "/api/budgets/budget-brl/usage") {
        return json({
          usage: usage("budget-brl", "BRL", 100_000, 40_000, 10_000),
        });
      }
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /Saúde/);
    assert.match(html, /Sem orçamento/);
    assert.match(html, /Não se aplica sem orçamento/);
    assert.match(html, /Crie um orçamento para definir um valor planejado/);
    assert.match(html, /data-column="committed"/);
    assert.match(html, /data-column="projected"/);
    assert.doesNotMatch(html, /edit-budget-dialog-unbudgeted:/);
    assert.doesNotMatch(html, /\/api\/budgets\/unbudgeted:/);
  });

  it("renders uncategorized usage as a separate bucket with a categorization action", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            unbudgetedUsage({
              source: "uncategorized",
              realizedAmountMinor: 4_000,
              committedAmountMinor: 6_000,
            }),
          ],
        });
      }
      if (url.pathname === "/api/budgets") return json({ budgets: [] });
      if (url.pathname === "/api/categories") return categoriesJson();
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /Sem categoria/);
    assert.match(html, /Abrir Extrato para categorizar/);
    assert.match(html, /Não se aplica sem orçamento/);
    assert.doesNotMatch(html, /edit-budget-dialog-uncategorized:/);
  });

  it("keeps creation and editing contextual with explicit currency", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") return json({ usage: [] });
      if (url.pathname === "/api/budgets") {
        return json({ budgets: [budget("budget-brl", "BRL", 100_000)] });
      }
      if (url.pathname === "/api/categories") return categoriesJson();
      if (url.pathname === "/api/budgets/budget-brl/usage") {
        return json({
          usage: usage("budget-brl", "BRL", 100_000, 40_000, 10_000),
        });
      }
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /data-open-dialog="new-budget-dialog"/);
    assert.match(html, /id="edit-budget-dialog-budget-brl"/);
    assert.match(html, /name="currency"[^>]*value="BRL"/);
    assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/budgets\/budget-brl"/);
  });

  it("features a planned budget before unbudgeted spending in the same currency", async () => {
    const normalFetch = baseFetch();
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            unbudgetedUsage({
              categoryId: "health",
              realizedAmountMinor: 9_000,
              committedAmountMinor: 0,
            }),
          ],
        });
      }
      return normalFetch(input);
    };

    const html = await renderBudgetsPage("token");
    const focus = html.slice(
      html.indexOf('<section class="budget-focus"'),
      html.indexOf('<section class="budget-results panel"'),
    );
    assert.equal((focus.match(/class="budget-focus-item"/g) ?? []).length, 2);
    assert.doesNotMatch(focus, /budget-unbudgeted-plan/);
    assert.match(focus, /Restante \(antes dos compromissos\)/);
    assert.match(focus, /Editar orçamento/);
    assert.match(html, /Crie um orçamento para definir um valor planejado/);
  });

  it("prioritizes individual financial decisions before table detail and auxiliary counts", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage("token");

    const focusIndex = html.indexOf('<section class="budget-focus"');
    const detailIndex = html.indexOf('<section class="budget-results panel"');
    const inventoryIndex = html.indexOf('<section class="budget-inventory"');
    assert.ok(focusIndex > 0 && focusIndex < detailIndex && detailIndex < inventoryIndex);
    assert.equal((html.match(/class="budget-focus-item"/g) ?? []).length, 2);
    assert.match(html, /class="budget-focus-values"/);
    assert.match(html, /data-budget-state="on_track"/);
    assert.match(html, /name="currency"/);
    assert.match(html, /data-currency="BRL"/);
    assert.match(html, /data-currency="USD"/);
    assert.match(html, /data-open-dialog="edit-budget-dialog-budget-brl"/);

    const table = html.slice(detailIndex, inventoryIndex);
    assert.ok(table.indexOf('data-column="available"') < table.indexOf('data-column="committed"'));
    assert.match(table, /Dentro do planejado/);
    assert.match(table, /data-column="projected"/);
  });

  it("preserves active currency and state filters, without mixing other currencies in the decision view", async () => {
    globalThis.fetch = baseFetch();
    const url = new URL("http://solverfin.test/orcamentos?currency=USD&status=active");
    const html = await renderBudgetsPage("token", url);
    const focus = html.slice(
      html.indexOf('<section class="budget-focus"'),
      html.indexOf('<section class="budget-results panel"'),
    );

    assert.match(html, /<option value="USD" selected>/);
    assert.match(html, /<option value="active" selected>/);
    assert.match(html, /Recorte atual: moeda <strong>USD<\/strong>/);
    assert.match(focus, /data-currency="USD"/);
    assert.doesNotMatch(focus, /data-currency="BRL"/);
    assert.equal((focus.match(/class="budget-focus-item"/g) ?? []).length, 1);
  });

  it("keeps an unmatched filter selected and distinguishes filtered empty from an empty catalog", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage(
      "token",
      new URL("http://solverfin.test/orcamentos?currency=EUR&status=archived"),
    );
    assert.match(html, /<option value="EUR" selected>/);
    assert.match(html, /<option value="archived" selected>/);
    assert.match(html, /Nenhum resultado com estes filtros/);
    assert.doesNotMatch(html, /<section class="budget-focus"/);
    assert.match(html, /<section class="budget-inventory"/);
  });

  it("keeps an error recoverable on the same filtered URL", async () => {
    globalThis.fetch = async (): Promise<Response> => new Response("unavailable", { status: 503 });
    const html = await renderBudgetsPage(
      "token",
      new URL("http://solverfin.test/orcamentos?currency=USD&status=active"),
    );
    assert.match(html, /<h1[^>]*>Orçamentos<\/h1>/);
    assert.match(html, /Não foi possível carregar os orçamentos/);
    assert.match(html, /href="\/orcamentos\?currency=USD&amp;status=active"/);
  });
});

function baseFetch() {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), "http://solverfin.test");
    if (url.pathname === "/api/budgets/dashboard") return json({ usage: [] });
    if (url.pathname === "/api/budgets") {
      return json({
        budgets: [budget("budget-brl", "BRL", 100_000), budget("budget-usd", "USD", 20_000)],
      });
    }
    if (url.pathname === "/api/categories") return categoriesJson();
    if (url.pathname === "/api/budgets/budget-brl/usage") {
      return json({
        usage: usage("budget-brl", "BRL", 100_000, 40_000, 10_000),
      });
    }
    if (url.pathname === "/api/budgets/budget-usd/usage") {
      return json({
        usage: usage("budget-usd", "USD", 20_000, 5_000, 1_000),
      });
    }
    return json({});
  };
}

function categoriesJson(): Response {
  return json({
    categories: [
      { id: "food", name: "Alimentação", kind: "expense", status: "active" },
      { id: "health", name: "Saúde", kind: "expense", status: "active" },
    ],
  });
}

function budget(id: string, currency: string, plannedAmountMinor: number) {
  return {
    id,
    status: "active",
    categoryId: "food",
    periodStartOn: "2026-09-01",
    periodEndOn: "2026-09-30",
    plannedAmountMinor,
    currency,
  };
}

function usage(
  budgetId: string,
  currency: string,
  plannedAmountMinor: number,
  realizedAmountMinor: number,
  committedAmountMinor: number,
) {
  const projectedAmountMinor = realizedAmountMinor + committedAmountMinor;
  return {
    source: "budget",
    budgetId,
    categoryId: "food",
    periodStartOn: "2026-09-01",
    periodEndOn: "2026-09-30",
    plannedAmountMinor,
    actualAmountMinor: realizedAmountMinor,
    realizedAmountMinor,
    committedAmountMinor,
    projectedAmountMinor,
    remainingAmountMinor: plannedAmountMinor - realizedAmountMinor,
    availableAmountMinor: plannedAmountMinor - projectedAmountMinor,
    overBudgetAmountMinor: Math.max(0, projectedAmountMinor - plannedAmountMinor),
    usedPercent: (realizedAmountMinor / plannedAmountMinor) * 100,
    alertThresholdPercent: 80,
    status: "on_track",
    currency,
    realizedItems: [],
    committedItems: [],
  };
}

function unbudgetedUsage(input: {
  source?: "unbudgeted" | "uncategorized";
  categoryId?: string;
  realizedAmountMinor: number;
  committedAmountMinor: number;
}) {
  const projectedAmountMinor = input.realizedAmountMinor + input.committedAmountMinor;
  return {
    source: input.source ?? "unbudgeted",
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    periodStartOn: "2026-09-01",
    periodEndOn: "2026-09-30",
    plannedAmountMinor: null,
    actualAmountMinor: input.realizedAmountMinor,
    realizedAmountMinor: input.realizedAmountMinor,
    committedAmountMinor: input.committedAmountMinor,
    projectedAmountMinor,
    remainingAmountMinor: null,
    availableAmountMinor: null,
    overBudgetAmountMinor: null,
    usedPercent: null,
    alertThresholdPercent: null,
    status: input.source ?? "unbudgeted",
    currency: "BRL",
    realizedItems: [],
    committedItems: [],
  };
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
