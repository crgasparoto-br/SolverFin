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
      <button data-edit-category aria-label="Editar categoria Alimentação">
        <span class="category-path">Casa &gt; Alimentação</span>
      </button>
      <button data-toggle-category-children aria-label="Ocultar subcategorias de Alimentação"></button>
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
  it("adds icons and accessible tooltips to category controls", () => {
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
    assert.match(
      html,
      /data-close-category-modal aria-label="Fechar modal" title="Fechar"><svg/,
    );
    assert.doesNotMatch(html, /aria-label="Fechar modal">x<\/button>/);
    assert.match(
      html,
      /data-close-category-modal title="Fechar sem salvar"><svg/,
    );
    assert.match(
      html,
      /aria-label="Editar categoria Alimentação" title="Editar categoria Alimentação"/,
    );
    assert.match(html, /class="category-node-edit-hint"[^>]*><svg/);
    assert.match(
      html,
      /aria-label="Ocultar subcategorias de Alimentação" title="Ocultar subcategorias de Alimentação"/,
    );
  });

  it("keeps hierarchy icons and dynamic action tooltips synchronized", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(html, /toggle\.setAttribute\("title", actionLabel\)/);
    assert.match(html, /toggle\.querySelector\("svg"\)/);
    assert.match(html, /rotate\(-90deg\)/);
    assert.match(html, /submitButton\.title = "Criar categoria"/);
    assert.match(
      html,
      /submitButton\.title = "Salvar alterações da categoria"/,
    );
    assert.match(html, /statusActionButton\.title = statusActionLabel/);
    assert.match(
      html,
      /statusActionButton\.setAttribute\("aria-label", statusActionLabel\)/,
    );
    assert.match(html, /category-collapse-button svg \{ transition: transform/);
  });

  it("keeps category rows readable while hovering or focusing", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(
      html,
      /\.category-tree-node:hover \{ background: #f1f7f9; border-color: #bfd6de; \}/,
    );
    assert.match(
      html,
      /\.category-node-button:hover:not\(:disabled\), \.category-node-button:focus-visible \{ background: transparent; color: var\(--text\); \}/,
    );
    assert.match(
      html,
      /\.category-node-button:hover:not\(:disabled\) \.category-node-text span, \.category-node-button:focus-visible \.category-node-text span \{ color: var\(--muted\); \}/,
    );
  });

  it("is idempotent and ignores unrelated pages", () => {
    const enhanced = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.equal(enhanceCategoriesIconsAndTooltips(enhanced), enhanced);
    assert.equal(
      enhanceCategoriesIconsAndTooltips(
        "<title>Dashboard - SolverFin</title><main></main>",
      ),
      "<title>Dashboard - SolverFin</title><main></main>",
    );
  });
});
