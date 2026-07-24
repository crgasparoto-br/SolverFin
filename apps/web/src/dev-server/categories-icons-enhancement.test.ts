import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceCategoriesIconsAndTooltips } from "./categories-icons-enhancement.js";

const categoryHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <title>Categorias - SolverFin</title>
    <style>.category-toolbar { display: grid; }</style>
  </head>
  <body>
    <main>
      <section class="categories-hero" aria-labelledby="categories-title">
        <div>
          <p class="sf-eyebrow">Organizacao financeira</p>
          <h1 id="categories-title">Categorias</h1>
          <p class="sf-muted">Classifique receitas, despesas e transferencias com uma hierarquia simples para manter relatorios e lancamentos consistentes.</p>
        </div>
        <button class="sf-button" type="button" data-open-category-modal>Nova categoria</button>
      </section>
      <section class="categories-workspace">
        <aside class="sf-panel categories-insights" aria-label="Distribuicao por tipo">
          <div><h2>Mapa do catalogo</h2><p class="sf-muted">Visao rapida sem alterar dados.</p></div>
        </aside>
        <section class="sf-panel category-directory">
          <div class="category-toolbar">
            <div><h2>Categorias por hierarquia</h2><p class="sf-muted">Use o menu de cada categoria.</p></div>
            <div class="category-toolbar-actions"><div class="filter-chips"></div></div>
          </div>
          <div class="category-tree-list" data-category-list>
            <section class="category-kind-group" data-category-kind="expense">
              <header>
                <div><h3>Despesa</h3><p class="sf-muted">2 categorias neste tipo</p></div>
                <div class="category-collapse-actions" aria-label="Controles da hierarquia">
                  <button data-expand-all-categories>Abrir todos</button>
                  <button data-collapse-all-categories>Fechar todos</button>
                </div>
                <span class="kind-badge kind-badge-expense">2</span>
              </header>
              <div class="category-tree-nodes">
                <article class="category-tree-node " data-category-item data-category-kind="expense" data-category-status="active" data-category-collapsed="false">
                  <div class="category-node-row">
                    <button class="category-collapse-button" data-toggle-category-children><svg></svg></button>
                    <button class="category-node-button" data-edit-category data-category-id="category-1" data-category-name="Moradia" data-category-kind-value="expense" data-category-status-value="active" data-category-parent-id="" aria-label="Editar categoria Moradia">
                      <span class="category-dot category-dot-expense"></span>
                      <span class="category-node-text"><strong>Moradia</strong><span>Categoria principal - Ativo</span></span>
                      <span class="category-path">Moradia</span>
                    </button>
                    <div class="category-action-menu"><button data-category-menu-button></button><div data-category-menu><button role="menuitem" data-category-parent-id="">Editar</button></div></div>
                  </div>
                  <div class="category-tree-children">
                    <article class="category-tree-node category-tree-child" data-category-item data-category-kind="expense" data-category-status="archived" data-category-collapsed="false">
                      <div class="category-node-row">
                        <span class="category-collapse-spacer"></span>
                        <button class="category-node-button" data-edit-category data-category-id="category-2" data-category-name="Aluguel" data-category-kind-value="expense" data-category-status-value="archived" data-category-parent-id="category-1" aria-label="Editar categoria Aluguel">
                          <span class="category-dot category-dot-expense"></span>
                          <span class="category-node-text"><strong>Aluguel</strong><span>Categoria detalhada - Arquivado</span></span>
                          <span class="category-path">Moradia &gt; Aluguel</span>
                        </button>
                        <div class="category-action-menu"><button data-category-menu-button></button><div data-category-menu><button role="menuitem">Editar</button></div></div>
                      </div>
                    </article>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </section>
      </section>
      <section class="category-modal" data-category-modal hidden aria-hidden="true">
        <div class="category-modal-backdrop" data-close-category-modal></div>
        <div class="category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
          <div class="category-dialog-header">
            <div><p class="sf-eyebrow">Novo cadastro</p><h2 id="category-modal-title" data-category-modal-title>Nova categoria</h2></div>
            <button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal">x</button>
          </div>
          <form class="category-form" data-category-form>
            <label>Nome<input name="name" autocomplete="off" required /></label>
            <label>Tipo
                <select name="kind" required><option value="expense">Despesa</option></select>
              </label>
            <label class="full-span">Categoria superior
                <select name="parentCategoryId"><option value="">Categoria principal</option>
                </select>
              </label>
            <div class="dialog-actions">
              <button class="sf-button secondary" type="button" data-close-category-modal>Cancelar</button>
              <button class="secondary-button danger-action" type="button" data-category-status-action hidden></button>
              <button class="sf-button" type="submit" data-category-submit title="Salvar categoria"><svg></svg> Criar categoria</button>
            </div>
          </form>
        </div>
      </section>
    </main>
    <script>function setCategoryCollapsed() {}</script>
  </body>
</html>`;

describe("categories design enhancement", () => {
  it("reorganizes the page around summary, search and hierarchy controls", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(html, /<main data-categories-design-enhanced>/);
    assert.match(html, /aria-label="Resumo do catálogo de categorias"/);
    assert.match(html, /<span>Total<\/span><strong>2<\/strong>/);
    assert.match(html, /<span>Ativas<\/span><strong>1<\/strong>/);
    assert.match(html, /<span>Arquivadas<\/span><strong>1<\/strong>/);
    assert.match(html, /<span>Principais<\/span><strong>1<\/strong>/);
    assert.match(html, /data-category-search-input/);
    assert.match(html, /placeholder="Buscar por nome ou caminho"/);
    assert.match(html, /data-clear-category-search/);
    assert.match(html, /data-category-results-status aria-live="polite">2 categorias exibidas/);
    assert.match(html, /data-reset-category-view/);
    assert.match(html, /data-expand-all-categories[^>]*>[^<]*<svg/);
    assert.match(html, /data-collapse-all-categories[^>]*>[^<]*<svg/);
  });

  it("adds meaningful filters, group context and compact row states", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(
      html,
      /data-category-filter="all"[^>]*title="Mostrar todas as categorias"[^>]*>[\s\S]*?<span>Todas<\/span><span class="filter-count">2<\/span>/,
    );
    assert.match(
      html,
      /data-category-filter="archived"[^>]*>[\s\S]*?<span>Arquivadas<\/span><span class="filter-count">1<\/span>/,
    );
    assert.match(html, /Saídas e compromissos financeiros · 2 categorias neste tipo/);
    assert.match(html, /category-status-badge category-status-active">Ativo/);
    assert.match(html, /category-status-badge category-status-archived">Arquivado/);
    assert.match(html, /aria-label="Editar categoria Moradia" title="Editar categoria Moradia"/);
    assert.match(html, /category-path"><svg[^>]*>[\s\S]*?<span>Moradia &gt; Aluguel<\/span>/);
    assert.match(
      html,
      /\.category-tree-node \{ background: transparent; border: 0; border-bottom: 1px solid var\(--line\)/,
    );
  });

  it("improves the category modal without changing its API hooks", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(html, /aria-describedby="category-modal-description"/);
    assert.match(html, /id="category-name" name="name"/);
    assert.match(html, /id="category-kind" name="kind"/);
    assert.match(html, /id="category-parent" name="parentCategoryId"/);
    assert.match(html, /id="category-parent-help"/);
    assert.match(html, /data-category-status-action hidden/);
    assert.match(html, /data-category-submit title="Salvar categoria"/);
    assert.match(
      html,
      /data-close-category-modal aria-label="Fechar modal" title="Fechar">[\s\S]*?<svg/,
    );
    assert.match(html, /data-close-category-modal title="Fechar sem salvar">[\s\S]*?<svg/);
    assert.match(html, /modal\?\.addEventListener\("keydown"/);
    assert.match(html, /event\.key !== "Tab"/);
  });

  it("adds responsive and keyboard behavior for the operational flow", () => {
    const html = enhanceCategoriesIconsAndTooltips(categoryHtml);

    assert.match(html, /<script data-categories-design-runtime>/);
    assert.match(html, /normalize\("NFD"\)/);
    assert.match(html, /event\.stopImmediatePropagation\(\)/);
    assert.match(html, /event\.key === "ArrowDown"/);
    assert.match(html, /event\.key === "Escape"/);
    assert.match(html, /@media \(max-width: 760px\)/);
    assert.match(html, /\.category-search input \{ min-height: 44px; \}/);
    assert.match(html, /\.dialog-actions button \{ min-height: 44px; width: 100%; \}/);
  });

  it("is idempotent, preserves the error state and ignores unrelated pages", () => {
    const enhanced = enhanceCategoriesIconsAndTooltips(categoryHtml);
    const errorHtml = `<title>Categorias - SolverFin</title><style></style><body><main><a class="sf-button" href="/categorias">Tentar novamente</a></main></body>`;
    const enhancedError = enhanceCategoriesIconsAndTooltips(errorHtml);

    assert.equal(enhanceCategoriesIconsAndTooltips(enhanced), enhanced);
    assert.match(enhancedError, /title="Recarregar categorias">[\s\S]*?<svg/);
    assert.doesNotMatch(enhancedError, /data-category-search-input/);
    assert.equal(
      enhanceCategoriesIconsAndTooltips("<title>Dashboard - SolverFin</title><main></main>"),
      "<title>Dashboard - SolverFin</title><main></main>",
    );
  });
});
