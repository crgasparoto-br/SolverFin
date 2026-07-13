import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceCategoriesIconsAndTooltips } from "./categories-icons-enhancement.js";

const categoryHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <title>Categorias - SolverFin</title>
    <style>.filter-chip { display: inline-flex; }</style>
  </head>
  <body>
    <main>
      <a class="sf-button" href="/categorias">Tentar novamente</a>
      <button class="filter-chip" type="button" data-category-filter="all" aria-pressed="true">Todas</button>
      <button class="filter-chip" type="button" data-category-filter="expense" aria-pressed="false">Despesas</button>
      <button class="filter-chip" type="button" data-category-filter="income" aria-pressed="false">Receitas</button>
      <button class="filter-chip" type="button" data-category-filter="transfer" aria-pressed="false">Transferencias</button>
      <button class="filter-chip" type="button" data-category-filter="archived" aria-pressed="false">Arquivadas</button>
      <button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal">x</button>
      <button class="sf-button secondary" type="button" data-close-category-modal>Cancelar</button>
      <article class="category-tree-node" data-category-collapsed="false">
        <div class="category-node-row">
          <button class="category-collapse-button" data-toggle-category-children><svg></svg></button>
          <button class="category-node-button" data-edit-category aria-label="Editar categoria Alimentação">
            <span class="category-path">Casa &gt; Alimentação</span>
          </button>
          <div class="category-action-menu"><button class="category-menu-button"></button></div>
        </div>
      </article>
    </main>
    <script>
      function updateCollapse(toggle, collapsed, name) {
          toggle.setAttribute("aria-label", (collapsed ? "Mostrar" : "Ocultar") + " subcategorias de " + name);
          const icon = toggle.querySelector("span");
          if (icon) icon.textContent = collapsed ? ">" : "v";
      }
      function openCreateModal(submitButton, statusActionButton) {
        statusActionButton.hidden = true;
      }
      function openEditModal(button, submitButton, statusActionButton, isArchived) {
        statusActionButton.hidden = false;
        statusActionButton.dataset.apiPath = "/api/categories/" + button.dataset.categoryId + (button.dataset.categoryStatusValue === "archived" ? "/restore" : "/archive");
      }
    </script>
  </body>
</html>`;

describe("categories icons and tooltips enhancement", () => {
  it("adds icons and accessible tooltips without changing the category structure", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(html, /<main data-categories-icons-enhanced>/);
    assert.match(html, /title="Recarregar categorias"[^>]*><svg/);
    assert.match(
      html,
      /data-category-filter="all"[^>]*title="Mostrar todas as categorias"[^>]*><svg/,
    );
    assert.match(
      html,
      /data-category-filter="expense"[^>]*title="Mostrar categorias de despesas"[^>]*><svg/,
    );
    assert.match(
      html,
      /data-category-filter="income"[^>]*title="Mostrar categorias de receitas"[^>]*><svg/,
    );
    assert.match(
      html,
      /data-category-filter="transfer"[^>]*title="Mostrar categorias de transferências"[^>]*><svg/,
    );
    assert.match(
      html,
      /data-category-filter="archived"[^>]*title="Mostrar categorias arquivadas"[^>]*><svg/,
    );
    assert.match(html, /data-close-category-modal aria-label="Fechar modal" title="Fechar"><svg/);
    assert.match(html, /data-close-category-modal title="Fechar sem salvar"><svg/);
    assert.match(
      html,
      /aria-label="Editar categoria Alimentação" title="Editar categoria Alimentação"/,
    );
    assert.match(
      html,
      /<span class="category-path"><svg[^>]*>[\s\S]*?<\/svg>Casa &gt; Alimentação<\/span>/,
    );
    assert.doesNotMatch(html, /category-node-edit-hint/);
  });

  it("preserves the original hierarchy and modal scripts", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(html, /toggle\.querySelector\("span"\)/);
    assert.match(html, /statusActionButton\.hidden = true/);
    assert.match(html, /statusActionButton\.hidden = false/);
    assert.doesNotMatch(html, /statusActionButton\.title =/);
    assert.doesNotMatch(html, /toggle\.setAttribute\("title"/);
    assert.match(
      html,
      /\.category-tree-node\[data-category-collapsed="true"\][^}]+rotate\(-90deg\)/,
    );
  });

  it("keeps category rows and action buttons readable", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(
      html,
      /\.category-tree-node:hover \{ background: #f8fafc; border-color: #cbd5e1; \}/,
    );
    assert.match(
      html,
      /button\.category-node-button:hover:not\(:disabled\), button\.category-node-button:focus-visible \{ background: transparent; color: inherit; \}/,
    );
    assert.match(
      html,
      /button\.category-node-button:hover \+ \.category-action-menu button\.category-menu-button/,
    );
  });

  it("is idempotent and ignores unrelated pages", () => {
    const enhanced = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.equal(enhanceCategoriesIconsAndTooltips(enhanced), enhanced);
    assert.equal(
      enhanceCategoriesIconsAndTooltips("<title>Dashboard - SolverFin</title><main></main>"),
      "<title>Dashboard - SolverFin</title><main></main>",
    );
  });
});
