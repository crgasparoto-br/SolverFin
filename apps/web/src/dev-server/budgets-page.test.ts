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
    assert.match(html, /Categorizar no Extrato/);
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
    assert.match(
      html,
      /<select name="currency" data-budget-currency-select required><option value="BRL" selected>/,
    );
    assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/budgets\/budget-brl"/);
  });

  it("uses a required hierarchical category selector and a real supported-currency dropdown", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage("token");
    const createStart = html.indexOf('<dialog class="sf-dialog" id="new-budget-dialog"');
    const editStart = html.indexOf('<dialog class="sf-dialog" id="edit-budget-dialog-');
    assert.ok(createStart > 0 && editStart > createStart);
    const create = html.slice(createStart, editStart);
    const edit = html.slice(editStart);

    assert.match(
      create,
      /<select name="categoryId" required><option value="" disabled selected>Selecione uma categoria/,
    );
    assert.match(create, /<option value="groceries">Alimentação › Mercado<\/option>/);
    assert.doesNotMatch(create, /value="retired"|value="salary"/);
    assert.match(edit, /<option value="food" selected>Alimentação<\/option>/);
    assert.match(create, /<select name="currency" data-budget-currency-select required>/);
    for (const currency of ["BRL", "USD", "EUR"]) {
      assert.match(create, new RegExp(`<option value="${currency}"`));
    }
    assert.match(create, /<option value="BRL" selected>/);
    assert.doesNotMatch(create, /<input name="currency"/);
    assert.match(create, /data-budget-currency-symbol aria-hidden="true">R\$/);
    assert.match(create, /name="plannedAmountMinor" data-money data-budget-money/);
    assert.match(edit, /name="plannedAmountMinor" data-money data-budget-money value="1\.000,00"/);
    assert.match(html, /Number\.isSafeInteger\(minor\)/);
    assert.match(html, /setCustomValidity\("O valor planejado não pode ser negativo\."\)/);
  });

  it("keeps a previously selected archived expense category explicit during editing", async () => {
    const normal = baseFetch();
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets") {
        return json({
          budgets: [{ ...budget("budget-brl", "BRL", 100_000), categoryId: "retired" }],
        });
      }
      return normal(input);
    };
    const html = await renderBudgetsPage("token");
    const create = html.slice(
      html.indexOf('id="new-budget-dialog"'),
      html.indexOf('id="edit-budget-dialog-'),
    );
    const edit = html.slice(html.indexOf('id="edit-budget-dialog-'));
    assert.doesNotMatch(create, /value="retired"/);
    assert.match(
      edit,
      /<option value="retired" selected>Alimentação › Antiga \(arquivada\)<\/option>/,
    );
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
    assert.match(html, /data-budget-mobile-filters data-active-filters="false" open/);
    assert.match(html, /summary class="budget-filter-toggle">Filtros de orçamentos/);
    assert.match(html, /matchMedia\('\(max-width: 560px\)'\)/);
    assert.match(html, /data-currency="BRL"/);
    assert.match(html, /data-currency="USD"/);
    assert.match(html, /data-open-dialog="edit-budget-dialog-budget-brl"/);

    const table = html.slice(detailIndex, inventoryIndex);
    assert.ok(table.indexOf('data-column="available"') < table.indexOf('data-column="committed"'));
    assert.match(table, /Dentro do planejamento/);
    assert.match(table, /data-column="projected"/);
  });

  it("places situation icons before budget category descriptions in focus and table", async () => {
    const original = baseFetch();
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            unbudgetedUsage({
              categoryId: "health",
              realizedAmountMinor: 500,
              committedAmountMinor: 0,
            }),
          ],
        });
      }
      return original(input);
    };

    const html = await renderBudgetsPage("token");
    const focus = html.slice(
      html.indexOf('<section class="budget-focus"'),
      html.indexOf('<section class="budget-results panel"'),
    );
    const table = html.slice(
      html.indexOf('<section class="budget-results panel"'),
      html.indexOf('<section class="budget-inventory"'),
    );

    const featured = focus.slice(
      focus.indexOf('<div class="budget-focus-category">'),
      focus.indexOf("</div>", focus.indexOf('<div class="budget-focus-category">')),
    );
    assert.ok(featured.includes('aria-label="Dentro do planejamento"'));
    assert.ok(
      featured.indexOf('data-budget-state="on_track"') < featured.indexOf("<h3>Alimentação</h3>"),
    );
    assert.doesNotMatch(featured, /budget-state-label/);

    const categories = Array.from(
      table.matchAll(/<div class="budget-category">([\s\S]*?)<\/div>/g),
      (match) => match[1] ?? "",
    );
    const planned =
      categories.find((markup) => markup.includes('data-budget-state="on_track"')) ?? "";
    const unbudgeted =
      categories.find((markup) => markup.includes('data-budget-state="unbudgeted"')) ?? "";
    assert.ok(planned?.includes('aria-label="Dentro do planejamento"'));
    assert.ok(unbudgeted?.includes('aria-label="Sem orçamento"'));
    assert.ok(
      planned.indexOf('data-budget-state="on_track"') <
        planned.indexOf("<strong>Alimentação</strong>"),
    );
    assert.ok(
      unbudgeted.indexOf('data-budget-state="unbudgeted"') <
        unbudgeted.indexOf("<strong>Saúde</strong>"),
    );
    assert.doesNotMatch(planned, /budget-state-label/);
    assert.doesNotMatch(unbudgeted, /budget-state-label/);
  });

  it("uses one explicit currency label per budget context, never a trailing ISO code on amounts", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage("token");
    const focusStart = html.indexOf('<section class="budget-focus"');
    const detailStart = html.indexOf('<section class="budget-results panel"');
    const auxiliaryStart = html.indexOf('<section class="budget-inventory"');
    const focus = html.slice(focusStart, detailStart);
    const detail = html.slice(detailStart, auxiliaryStart);

    assert.match(focus, /class="budget-currency">BRL<\/strong>/);
    assert.match(focus, /class="budget-currency">USD<\/strong>/);
    assert.match(detail, /data-column="currency"/);
    for (const body of [focus, detail]) {
      assert.match(body, /data-currency="BRL"/);
      assert.match(body, /data-currency="USD"/);
      assert.doesNotMatch(body, /class="sf-money-currency"/);
      assert.doesNotMatch(body, /<small[^>]*>BRL<\/small>|<small[^>]*>USD<\/small>/);
    }
    assert.match(focus, /R\$\s*1\.000,00/);
    assert.match(focus, /US\$\s*200,00/);
  });

  it("keeps modal confirmation primary, cancel neutral and row actions on shared tokens", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage("token");
    assert.equal((html.match(/class="budget-form-actions"/g) ?? []).length, 3);
    assert.equal(
      (
        html.match(
          /class="sf-button sf-button-secondary" data-sf-dialog-close>Cancelar<\/button>/g,
        ) ?? []
      ).length,
      3,
    );
    assert.match(html, /class="sf-button sf-button-primary">Salvar alterações<\/button>/);
    assert.match(html, /class="budget-action-item budget-action-danger" data-api-action/);
    const routeCss = html.slice(html.indexOf(".budgets-a1-page, "));
    assert.doesNotMatch(routeCss, /#fecaca|\.danger-button \{|\.secondary-button \{/);
  });

  it("shows a single primary creation action and unified icon-only three-dot menu triggers", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage("token");
    const focus = html.slice(
      html.indexOf('<section class="budget-focus"'),
      html.indexOf('<section class="budget-results panel"'),
    );
    const table = html.slice(
      html.indexOf('<section class="budget-results panel"'),
      html.indexOf('<section class="budget-inventory"'),
    );
    assert.match(html, /budget-primary-action/);
    assert.match(html, /data-sf-dialog-open="new-budget-dialog"/);
    assert.equal((focus.match(/data-budget-action-menu-context="focus"/g) ?? []).length, 2);
    assert.equal((table.match(/data-budget-action-menu-context="table"/g) ?? []).length, 2);
    assert.match(table, /data-column="composition"/);
    assert.match(table, /data-column="actions"/);
    assert.doesNotMatch(focus, /budget-focus-actions|class="sf-dialog-trigger/);
    for (const section of [focus, table]) {
      assert.match(section, /data-budget-menu-trigger aria-haspopup="menu"/);
      assert.match(section, /aria-expanded="false"/);
      assert.match(section, /role="menu"[^>]* hidden/);
      assert.match(
        section,
        /data-api-method="GET" data-api-path="\/api\/budgets\/budget-brl\/usage"/,
      );
      assert.match(section, /data-sf-dialog-open="edit-budget-dialog-budget-brl"/);
      assert.match(
        section,
        /data-api-method="POST" data-api-path="\/api\/budgets\/budget-brl\/archive"/,
      );
      assert.match(section, /<svg[^>]*aria-hidden="true"/);
    }
    assert.match(html, /event.key === 'Escape'/);
    assert.match(html, /event.key === 'ArrowDown'/);
    assert.match(html, /document.addEventListener\('close'/);
    assert.match(
      html,
      /\.budget-results \.sf-table td:last-child:has\(\.budget-action-popover:not\(\[hidden\]\)\) \{ z-index: 3; \}/,
    );
  });

  it("uses status icons and keeps contextual creation or categorization for unbudgeted rows", async () => {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            unbudgetedUsage({
              categoryId: "health",
              realizedAmountMinor: 500,
              committedAmountMinor: 0,
            }),
            unbudgetedUsage({
              source: "uncategorized",
              realizedAmountMinor: 700,
              committedAmountMinor: 0,
            }),
          ],
        });
      }
      if (url.pathname === "/api/budgets") return json({ budgets: [] });
      if (url.pathname === "/api/categories") return categoriesJson();
      return json({});
    };
    const html = await renderBudgetsPage("token");
    assert.match(
      html,
      /role="img" class="budget-state[^"]*" data-budget-state="unbudgeted" title="Sem orçamento" aria-label="Sem orçamento"/,
    );
    assert.match(html, /data-budget-action-menu-context="table"/);
    assert.match(
      html,
      /role="menuitem" class="budget-action-item" data-sf-dialog-open="new-budget-dialog"/,
    );
    assert.match(html, /role="menuitem" class="budget-action-item" href="\/lancamentos"/);
    assert.doesNotMatch(html, /data-api-path="\/api\/budgets\/unbudgeted:/);
  });

  it("does not offer an archive operation for archived budgets", async () => {
    const defaultFetch = baseFetch();
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets") {
        return json({ budgets: [{ ...budget("budget-brl", "BRL", 100_000), status: "archived" }] });
      }
      return defaultFetch(input);
    };
    const html = await renderBudgetsPage("token");
    assert.match(html, /data-budget-state="archived"/);
    assert.match(html, /data-sf-dialog-open="edit-budget-dialog-budget-brl"/);
    assert.doesNotMatch(html, /data-api-path="\/api\/budgets\/budget-brl\/archive"/);
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
    assert.match(html, /moeda <strong>USD<\/strong>/);
    assert.match(html, /data-budget-mobile-filters data-active-filters="true" open/);
    assert.match(focus, /data-currency="USD"/);
    assert.doesNotMatch(focus, /data-currency="BRL"/);
    assert.equal((focus.match(/class="budget-focus-item"/g) ?? []).length, 1);
  });

  it("preselects the expense category only when creating from its three-dot menu", async () => {
    const originalFetch = baseFetch();
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets/dashboard") {
        return json({
          usage: [
            unbudgetedUsage({
              categoryId: "health",
              realizedAmountMinor: 2500,
              committedAmountMinor: 0,
            }),
          ],
        });
      }
      return originalFetch(input);
    };
    const html = await renderBudgetsPage("token");
    assert.match(
      html,
      /data-sf-dialog-open="new-budget-dialog" data-open-dialog="new-budget-dialog" data-budget-prefill-category-id="health"/,
    );
    assert.match(html, /class="budget-action-item" data-sf-dialog-open="new-budget-dialog"/);
    assert.match(html, /requested && option.value === requested && !option.disabled/);
    assert.match(html, /category.value = Array.from\(category.options\)/);
    assert.match(html, /category.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
    const newDialog = html.slice(
      html.indexOf('id="new-budget-dialog"'),
      html.indexOf('id="edit-budget-dialog-'),
    );
    assert.match(newDialog, /<option value="health">Saúde<\/option>/);
    assert.match(newDialog, /<option value="" disabled selected>Selecione uma categoria<\/option>/);
  });

  it("shows one category/currency row with exact period history, no artificial sums", async () => {
    const originalFetch = baseFetch();
    const october = {
      ...budget("budget-oct", "BRL", 120_000),
      periodStartOn: "2026-10-01",
      periodEndOn: "2026-10-31",
    };
    const nested = { ...budget("budget-child", "BRL", 50_000), categoryId: "groceries" };
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), "http://solverfin.test");
      if (url.pathname === "/api/budgets") {
        return json({
          budgets: [
            budget("budget-brl", "BRL", 100_000),
            october,
            nested,
            budget("budget-usd", "USD", 20_000),
          ],
        });
      }
      if (url.pathname === "/api/budgets/budget-oct/usage") {
        return json({
          usage: {
            ...usage("budget-oct", "BRL", 120_000, 60_000, 10_000),
            periodStartOn: "2026-10-01",
            periodEndOn: "2026-10-31",
          },
        });
      }
      if (url.pathname === "/api/budgets/budget-child/usage") {
        return json({
          usage: { ...usage("budget-child", "BRL", 50_000, 10_000, 0), categoryId: "groceries" },
        });
      }
      return originalFetch(input);
    };

    const html = await renderBudgetsPage("token");
    const table = html.slice(
      html.indexOf('<section class="budget-results panel"'),
      html.indexOf('<section class="budget-inventory"'),
    );
    assert.equal((table.match(/<tr data-row-key=/g) ?? []).length, 3);
    assert.equal((table.match(/class="budget-history-entry"/g) ?? []).length, 1);
    assert.match(table, /1\.200,00/);
    assert.match(table, /class="budget-period-history"/);
    assert.match(table, /data-api-path="\/api\/budgets\/budget-brl\/archive"/);
    assert.match(table, /data-budget-action-menu-context="history"/);
    assert.match(
      table,
      /data-category-depth="1"[^>]*><span class="budget-category-parent">Alimentação<\/span>/,
    );
    assert.match(
      table,
      /<strong><span class="budget-category-branch" aria-hidden="true">↳<\/span>Mercado<\/strong>/,
    );
    assert.doesNotMatch(table, /Acompanhamento consolidado/);
    assert.match(table, /sem somar moedas ou períodos/);

    const selected = await renderBudgetsPage(
      "token",
      new URL("http://solverfin.test/orcamentos?period=2026-10-01%3A2026-10-31&currency=BRL"),
    );
    const filtered = selected.slice(
      selected.indexOf('<section class="budget-results panel"'),
      selected.indexOf('<section class="budget-inventory"'),
    );
    assert.match(selected, /<option value="2026-10-01:2026-10-31" selected>/);
    assert.match(selected, /data-budget-mobile-filters data-active-filters="true"/);
    assert.equal((filtered.match(/<tr data-row-key=/g) ?? []).length, 1);
    assert.doesNotMatch(filtered, /budget-history-entry/);
    assert.match(filtered, /data-row-key="budget-oct"/);
    assert.doesNotMatch(filtered, /data-row-key="budget-brl"/);
  });

  it("keeps Apply and Clear aligned and treats malformed periods as inactive", async () => {
    globalThis.fetch = baseFetch();
    const html = await renderBudgetsPage(
      "token",
      new URL("http://solverfin.test/orcamentos?period=2026-02-31:2026-02-31"),
    );
    assert.match(
      html,
      /class="sf-button sf-button-primary sf-focus-ring">Aplicar filtros<\/button>/,
    );
    assert.match(
      html,
      /class="sf-button sf-button-secondary sf-focus-ring" href="\/orcamentos">Limpar<\/a>/,
    );
    assert.match(html, /budget-filter-actions > \.sf-button \{[^}]*width: 148px/);
    assert.match(html, /data-budget-mobile-filters data-active-filters="false" open/);
    assert.match(html, /<select name="period">/);
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
      {
        id: "groceries",
        name: "Mercado",
        kind: "expense",
        status: "active",
        parentCategoryId: "food",
      },
      {
        id: "retired",
        name: "Antiga",
        kind: "expense",
        status: "archived",
        parentCategoryId: "food",
      },
      { id: "salary", name: "Salário", kind: "income", status: "active" },
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
