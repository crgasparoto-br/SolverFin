import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { renderBudgetsPage } from "./budgets-page.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("budgets page issue 613", () => {
  it("renders A1 with explicit currencies, remaining and backend realized values without future projections", async () => {
    globalThis.fetch = baseFetch();

    const html = await renderBudgetsPage("token");

    assert.match(html, /data-budgets-archetype="A1"/);
    assert.match(html, /data-currency="BRL"/);
    assert.match(html, /data-currency="USD"/);
    assert.match(html, />Planejado</);
    assert.match(html, />Realizado</);
    assert.match(html, />Restante</);
    assert.match(html, /data-column="remaining"/);
    assert.match(html, /40%/);
    assert.match(html, /25%/);
    assert.doesNotMatch(html, /Comprometido/);
    assert.doesNotMatch(html, /Projetado/);
    assert.doesNotMatch(html, />Disponível</);
    assert.doesNotMatch(html, /Valor planejado \(R\$\)/);
  });

  it("does not turn a mismatched usage currency into realized or remaining zero", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") return json({ usage: [] });
      if (url.pathname === "/api/budgets")
        return json({ budgets: [budget("budget-brl", "BRL", 100_000)] });
      if (url.pathname === "/api/categories") return categoriesJson();
      if (url.pathname === "/api/budgets/budget-brl/usage") {
        return json({ usage: usage("budget-brl", "USD", 100_000, 40_000, 40) });
      }
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /Realizado indisponível/);
    assert.match(html, /data-money-availability="unavailable"/);
    assert.doesNotMatch(html, /data-column="realized"[^]*R\$\s*0,00/);
    assert.doesNotMatch(html, /data-column="remaining"[^]*R\$\s*0,00/);
  });

  it("renders backend unbudgeted usage as a distinct operational item without maintenance actions", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            {
              categoryId: "health",
              periodStartOn: "2026-09-01",
              periodEndOn: "2026-09-30",
              plannedAmountMinor: 0,
              actualAmountMinor: 12_500,
              remainingAmountMinor: -12_500,
              usedPercent: 100,
              alertThresholdPercent: 80,
              status: "unbudgeted",
              currency: "BRL",
            },
          ],
        });
      }
      if (url.pathname === "/api/budgets")
        return json({ budgets: [budget("budget-brl", "BRL", 100_000)] });
      if (url.pathname === "/api/categories") return categoriesJson();
      if (url.pathname === "/api/budgets/budget-brl/usage")
        return json({ usage: usage("budget-brl", "BRL", 100_000, 40_000, 40) });
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /Saúde/);
    assert.match(html, /Sem orçamento/);
    assert.match(html, /Crie um orçamento para definir um valor planejado/);
    assert.match(html, /data-column="remaining"/);
    assert.doesNotMatch(html, /edit-budget-dialog-unbudgeted:/);
    assert.doesNotMatch(html, /\/api\/budgets\/unbudgeted:/);
  });

  it("keeps creation and editing contextual with explicit currency", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") return json({ usage: [] });
      if (url.pathname === "/api/budgets")
        return json({ budgets: [budget("budget-brl", "BRL", 100_000)] });
      if (url.pathname === "/api/categories") return categoriesJson();
      if (url.pathname === "/api/budgets/budget-brl/usage")
        return json({ usage: usage("budget-brl", "BRL", 100_000, 40_000, 40) });
      return json({});
    };

    const html = await renderBudgetsPage("token");
    assert.match(html, /data-open-dialog="new-budget-dialog"/);
    assert.match(html, /id="edit-budget-dialog-budget-brl"/);
    assert.match(html, /name="currency"[^>]*value="BRL"/);
    assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/budgets\/budget-brl"/);
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
      return json({ usage: usage("budget-brl", "BRL", 100_000, 40_000, 40) });
    }
    if (url.pathname === "/api/budgets/budget-usd/usage") {
      return json({ usage: usage("budget-usd", "USD", 20_000, 5_000, 25) });
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
  actualAmountMinor: number,
  usedPercent: number,
) {
  return {
    budgetId,
    categoryId: "food",
    periodStartOn: "2026-09-01",
    periodEndOn: "2026-09-30",
    plannedAmountMinor,
    actualAmountMinor,
    remainingAmountMinor: plannedAmountMinor - actualAmountMinor,
    usedPercent,
    alertThresholdPercent: 80,
    status: "on_track",
    currency,
  };
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
