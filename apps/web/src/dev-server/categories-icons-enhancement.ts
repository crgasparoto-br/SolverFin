import { icon } from "./icons.js";

interface CategoryFilterPresentation {
  count: number;
  filter: string;
  iconName: Parameters<typeof icon>[0];
  label: string;
  tooltip: string;
}

interface CategoryPageSummary {
  active: number;
  archived: number;
  expense: number;
  income: number;
  roots: number;
  total: number;
  transfer: number;
}

const categoryPageTitle = "<title>Categorias - SolverFin</title>";
const enhancementMarker = "data-categories-design-enhanced";

export function enhanceCategoriesIconsAndTooltips(html: string): string {
  if (!html.includes(categoryPageTitle)) return html;
  if (html.includes(enhancementMarker)) return html;

  const summary = extractCategorySummary(html);
  let enhanced = html.replace("<main>", `<main ${enhancementMarker}>`);

  enhanced = replaceVisibleCopy(enhanced);
  enhanced = enhanceRetryAction(enhanced);

  if (!enhanced.includes("data-category-list")) {
    return injectStyles(enhanced);
  }

  enhanced = removeLegacyCollapseActions(enhanced);
  enhanced = insertCategorySummary(enhanced, summary);
  enhanced = replaceCategoryInsights(enhanced, summary);
  enhanced = replaceCategoryToolbar(enhanced, summary);
  enhanced = enhanceCategoryGroups(enhanced);
  enhanced = enhanceCategoryRows(enhanced);
  enhanced = enhanceCategoryModal(enhanced);
  enhanced = injectStyles(enhanced);
  enhanced = injectRuntime(enhanced);

  return enhanced;
}

function extractCategorySummary(html: string): CategoryPageSummary {
  const records = Array.from(
    html.matchAll(
      /<article class="category-tree-node([^"]*)" data-category-item data-category-kind="([^"]+)" data-category-status="([^"]+)"/g,
    ),
  );

  const summary: CategoryPageSummary = {
    active: 0,
    archived: 0,
    expense: 0,
    income: 0,
    roots: 0,
    total: records.length,
    transfer: 0,
  };

  for (const record of records) {
    const [, classNames = "", kind = "", status = ""] = record;
    if (!classNames.includes("category-tree-child")) summary.roots += 1;
    if (status === "archived") summary.archived += 1;
    else summary.active += 1;
    if (kind === "expense") summary.expense += 1;
    if (kind === "income") summary.income += 1;
    if (kind === "transfer") summary.transfer += 1;
  }

  return summary;
}

function replaceVisibleCopy(html: string): string {
  const replacements: readonly [string, string][] = [
    ["Organizacao financeira", "Organização financeira"],
    ["transferencias", "transferências"],
    ["Transferencias", "Transferências"],
    ["Transferencia", "Transferência"],
    ["relatorios", "relatórios"],
    ["lancamentos", "lançamentos"],
    ["Mapa do catalogo", "Visão geral do catálogo"],
    ["Visao rapida sem alterar dados.", "Distribuição atual das categorias."],
    ["acoes", "ações"],
    ["Acao concluida", "Ação concluída"],
    ["Nao foi possivel", "Não foi possível"],
    ["Salvar edicao", "Salvar edição"],
    ["Nova categoria", "Nova categoria"],
  ];

  return replacements.reduce((content, [from, to]) => content.replaceAll(from, to), html);
}

function enhanceRetryAction(html: string): string {
  return html.replace(
    '<a class="sf-button" href="/categorias">Tentar novamente</a>',
    `<a class="sf-button" href="/categorias" title="Recarregar categorias">${icon("refresh-cw", 14)} Tentar novamente</a>`,
  );
}

function removeLegacyCollapseActions(html: string): string {
  return html.replace(
    /\s*<div class="category-collapse-actions" aria-label="Controles da hierarquia">[\s\S]*?<\/div>/,
    "",
  );
}

function insertCategorySummary(html: string, summary: CategoryPageSummary): string {
  const summaryHtml = `
        <section class="category-summary" aria-label="Resumo do catálogo de categorias">
          ${renderSummaryItem("Total", summary.total, "categorias cadastradas")}
          ${renderSummaryItem("Ativas", summary.active, "disponíveis para uso")}
          ${renderSummaryItem("Arquivadas", summary.archived, "mantidas no histórico")}
          ${renderSummaryItem("Principais", summary.roots, "sem categoria superior")}
        </section>`;

  return html.replace(
    /(<\/section>\s*)(<section class="categories-workspace">)/,
    `$1${summaryHtml}\n\n        $2`,
  );
}

function renderSummaryItem(label: string, value: number, description: string): string {
  return `<article class="category-summary-item"><span>${label}</span><strong>${value}</strong><small>${description}</small></article>`;
}

function replaceCategoryInsights(html: string, summary: CategoryPageSummary): string {
  const insights = `
          <section class="sf-panel categories-insights" aria-labelledby="category-distribution-title">
            <div class="category-distribution-heading">
              <div>
                <p class="sf-eyebrow">Distribuição</p>
                <h2 id="category-distribution-title">Categorias por tipo</h2>
              </div>
              <p class="sf-muted">Acompanhe o equilíbrio do catálogo sem alterar os cadastros.</p>
            </div>
            <div class="kind-meters">
              ${renderKindMeter("Despesa", summary.expense, summary.total, "expense")}
              ${renderKindMeter("Receita", summary.income, summary.total, "income")}
              ${renderKindMeter("Transferência", summary.transfer, summary.total, "transfer")}
            </div>
          </section>`;

  return html.replace(/<aside class="sf-panel categories-insights"[\s\S]*?<\/aside>/, insights);
}

function renderKindMeter(label: string, count: number, total: number, tone: string): string {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <article class="kind-meter kind-meter-${tone}">
      <div class="kind-meter-copy"><strong>${label}</strong><span>${count} ${count === 1 ? "categoria" : "categorias"}</span></div>
      <div class="meter-track" role="img" aria-label="${label}: ${count} de ${total} categorias"><span class="meter-fill meter-${tone}" style="width: ${percent}%"></span></div>
    </article>`;
}

function replaceCategoryToolbar(html: string, summary: CategoryPageSummary): string {
  const toolbar = `
            <div class="category-toolbar">
              <div class="category-toolbar-copy">
                <p class="sf-eyebrow">Cadastro</p>
                <h2>Categorias por hierarquia</h2>
                <p class="sf-muted">Busque, filtre e abra uma categoria para revisar seus dados.</p>
              </div>
              <div class="category-toolbar-controls">
                <label class="category-search" for="category-search-input">
                  <span class="visually-hidden">Buscar categorias</span>
                  <span class="category-search-icon" aria-hidden="true">${icon("search", 15)}</span>
                  <input id="category-search-input" type="search" autocomplete="off" placeholder="Buscar por nome ou caminho" data-category-search-input${summary.total === 0 ? " disabled" : ""} />
                  <button class="category-search-clear" type="button" data-clear-category-search aria-label="Limpar busca" title="Limpar busca" hidden>${icon("x", 14)}</button>
                </label>
                <div class="filter-chips" role="group" aria-label="Filtrar categorias">
                  ${renderFilterButtons(summary)}
                </div>
                <div class="category-collapse-actions" aria-label="Controlar hierarquia">
                  <button class="secondary-button compact-button" type="button" data-expand-all-categories title="Expandir todas as categorias"${summary.total === 0 ? " disabled" : ""}>${icon("chevron-down", 13)} Expandir</button>
                  <button class="secondary-button compact-button" type="button" data-collapse-all-categories title="Recolher todas as categorias"${summary.total === 0 ? " disabled" : ""}>${icon("chevron-up", 13)} Recolher</button>
                </div>
              </div>
              <p class="category-results-status" data-category-results-status aria-live="polite">${formatResultCount(summary.total)}</p>
            </div>
            <div class="category-filter-empty" data-category-filter-empty hidden>
              ${icon("search", 18)}
              <strong>Nenhuma categoria encontrada</strong>
              <p class="sf-muted">Revise a busca ou selecione outro filtro.</p>
              <button class="secondary-button" type="button" data-reset-category-view>Limpar busca e filtros</button>
            </div>`;

  return html.replace(
    /<div class="category-toolbar">[\s\S]*?<div class="category-tree-list"/,
    `${toolbar}\n            <div class="category-tree-list"`,
  );
}

function renderFilterButtons(summary: CategoryPageSummary): string {
  const presentations: readonly CategoryFilterPresentation[] = [
    {
      count: summary.total,
      filter: "all",
      iconName: "layers",
      label: "Todas",
      tooltip: "Mostrar todas as categorias",
    },
    {
      count: summary.expense,
      filter: "expense",
      iconName: "arrow-down",
      label: "Despesas",
      tooltip: "Mostrar categorias de despesas",
    },
    {
      count: summary.income,
      filter: "income",
      iconName: "arrow-up",
      label: "Receitas",
      tooltip: "Mostrar categorias de receitas",
    },
    {
      count: summary.transfer,
      filter: "transfer",
      iconName: "repeat",
      label: "Transferências",
      tooltip: "Mostrar categorias de transferências",
    },
    {
      count: summary.archived,
      filter: "archived",
      iconName: "archive",
      label: "Arquivadas",
      tooltip: "Mostrar categorias arquivadas",
    },
  ];

  return presentations
    .map(
      ({ count, filter, iconName, label, tooltip }, index) =>
        `<button class="filter-chip" type="button" data-category-filter="${filter}" aria-pressed="${index === 0 ? "true" : "false"}" title="${tooltip}"${summary.total === 0 ? " disabled" : ""}>${icon(iconName, 12)} <span>${label}</span><span class="filter-count">${count}</span></button>`,
    )
    .join("");
}

function formatResultCount(count: number): string {
  return `${count} ${count === 1 ? "categoria exibida" : "categorias exibidas"}`;
}

function enhanceCategoryGroups(html: string): string {
  const presentations: readonly [string, Parameters<typeof icon>[0], string][] = [
    ["Despesa", "arrow-down", "Saídas e compromissos financeiros"],
    ["Receita", "arrow-up", "Entradas e fontes de recursos"],
    ["Transferência", "repeat", "Movimentações entre contas"],
  ];

  return presentations.reduce((content, [label, iconName, description]) => {
    const pattern = new RegExp(`<h3>${label}</h3>\\s*<p class="sf-muted">([^<]+)</p>`);
    return content.replace(
      pattern,
      `<div class="category-kind-title"><span class="category-kind-icon" aria-hidden="true">${icon(iconName, 14)}</span><div><h3>${label}</h3><p class="sf-muted">${description} · $1</p></div></div>`,
    );
  }, html);
}

function enhanceCategoryRows(html: string): string {
  let enhanced = html.replace(
    /aria-label="Editar categoria ([^"]+)"/g,
    'aria-label="Editar categoria $1" title="Editar categoria $1"',
  );

  enhanced = enhanced.replace(
    /<span>(Categoria principal|Categoria detalhada) - (Ativo|Arquivado)<\/span>/g,
    (_match, level: string, status: string) =>
      `<span class="category-node-meta"><span>${level}</span><span class="category-status-badge category-status-${status === "Arquivado" ? "archived" : "active"}">${status}</span></span>`,
  );

  enhanced = enhanced.replace(
    /<span class="category-path">([^<]*)<\/span>/g,
    `<span class="category-path">${icon("chevron-right", 12)}<span>$1</span></span>`,
  );

  return enhanced;
}

function enhanceCategoryModal(html: string): string {
  let enhanced = html.replace(
    'role="dialog" aria-modal="true" aria-labelledby="category-modal-title"',
    'role="dialog" aria-modal="true" aria-labelledby="category-modal-title" aria-describedby="category-modal-description"',
  );

  enhanced = enhanced.replace(
    '<h2 id="category-modal-title" data-category-modal-title>Nova categoria</h2>',
    '<h2 id="category-modal-title" data-category-modal-title>Nova categoria</h2><p id="category-modal-description" class="sf-muted">Defina como a categoria será usada na organização dos lançamentos.</p>',
  );

  enhanced = enhanced.replace(
    '<button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal">x</button>',
    `<button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal" title="Fechar">${icon("x", 15)}</button>`,
  );

  enhanced = enhanced.replace(
    '<label>Nome<input name="name" autocomplete="off" required /></label>',
    '<label class="full-span" for="category-name"><span>Nome</span><input id="category-name" name="name" autocomplete="off" required aria-describedby="category-name-help" /><small id="category-name-help">Use um nome curto e fácil de reconhecer nos lançamentos.</small></label>',
  );

  enhanced = enhanced.replace(
    '<label>Tipo\n                <select name="kind" required>',
    '<label for="category-kind"><span>Tipo</span>\n                <select id="category-kind" name="kind" required>',
  );

  enhanced = enhanced.replace(
    '<label class="full-span">Categoria superior\n                <select name="parentCategoryId">',
    '<label class="category-parent-field" for="category-parent"><span>Categoria superior <small>(opcional)</small></span>\n                <select id="category-parent" name="parentCategoryId" aria-describedby="category-parent-help">',
  );

  enhanced = enhanced.replace(
    /(<select id="category-parent"[\s\S]*?<\/select>)\s*<\/label>/,
    `$1
                <small id="category-parent-help">Deixe como categoria principal ou escolha uma categoria do mesmo tipo.</small>
              </label>`,
  );

  enhanced = enhanced.replace(
    /<div class="dialog-actions">\s*<button class="sf-button secondary" type="button" data-close-category-modal>Cancelar<\/button>\s*<button class="secondary-button danger-action" type="button" data-category-status-action hidden><\/button>\s*<button class="sf-button" type="submit" data-category-submit title="Salvar categoria">([\s\S]*?)<\/button>\s*<\/div>/,
    `<div class="dialog-actions">
                  <div class="dialog-secondary-actions">
                    <button class="secondary-button danger-action" type="button" data-category-status-action hidden></button>
                  </div>
                  <div class="dialog-primary-actions">
                    <button class="sf-button secondary" type="button" data-close-category-modal title="Fechar sem salvar">${icon("x", 13)} Cancelar</button>
                    <button class="sf-button" type="submit" data-category-submit title="Salvar categoria">$1</button>
                  </div>
                </div>`,
  );

  enhanced = enhanced.replace(
    '<div class="category-modal-backdrop" data-close-category-modal></div>',
    '<div class="category-modal-backdrop" data-close-category-modal aria-hidden="true"></div>',
  );

  return enhanced;
}

function injectStyles(html: string): string {
  return html.replace(
    "</style>",
    `
      .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
      main[${enhancementMarker}] { gap: 16px; max-width: 1320px; padding: 20px 24px 32px; }
      main[${enhancementMarker}] .categories-hero { align-items: end; border-bottom: 1px solid var(--line); padding-bottom: 16px; }
      main[${enhancementMarker}] .categories-hero > div { gap: 5px; max-width: 780px; }
      main[${enhancementMarker}] .categories-hero .sf-button { gap: 6px; min-height: 38px; }
      .category-summary { display: grid; gap: 1px; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
      .category-summary-item { background: var(--surface); display: grid; gap: 2px; min-width: 0; padding: 12px 14px; }
      .category-summary-item > span { color: var(--muted); font-size: .75rem; font-weight: 600; }
      .category-summary-item > strong { color: var(--primary); font-size: 1.25rem; line-height: 1.15; }
      .category-summary-item > small { color: var(--muted); font-size: .6875rem; overflow-wrap: anywhere; }
      main[${enhancementMarker}] .categories-workspace { display: grid; gap: 14px; grid-template-columns: 1fr; }
      main[${enhancementMarker}] .categories-insights { align-items: center; display: grid; gap: 18px; grid-template-columns: minmax(13rem, .8fr) minmax(0, 2fr); padding: 14px 16px; position: static; }
      .category-distribution-heading { display: grid; gap: 4px; }
      .category-distribution-heading > div { display: grid; gap: 3px; }
      main[${enhancementMarker}] .kind-meters { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      main[${enhancementMarker}] .kind-meter { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: var(--radius); gap: 8px; padding: 10px; }
      .kind-meter-copy { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; }
      .kind-meter-copy strong { font-size: .8125rem; }
      .kind-meter-copy span { white-space: nowrap; }
      main[${enhancementMarker}] .category-directory { box-shadow: var(--shadow-sm); overflow: visible; }
      main[${enhancementMarker}] .category-directory, main[${enhancementMarker}] .category-kind-group, main[${enhancementMarker}] .category-tree-nodes, main[${enhancementMarker}] .category-tree-node, main[${enhancementMarker}] .category-node-row, main[${enhancementMarker}] .category-node-button, main[${enhancementMarker}] .category-node-text { max-width: 100%; min-width: 0; }
      main[${enhancementMarker}] .category-toolbar { align-items: end; display: grid; gap: 12px 16px; grid-template-columns: minmax(13rem, .7fr) minmax(0, 1.8fr); padding: 14px 16px 12px; }
      .category-toolbar-copy { display: grid; gap: 3px; min-width: 0; }
      .category-toolbar-controls { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; min-width: 0; }
      .category-results-status { border-top: 1px solid var(--line); color: var(--muted); font-size: .75rem; grid-column: 1 / -1; padding-top: 9px; }
      .category-search { display: block; flex: 1 1 240px; max-width: 340px; min-width: 210px; position: relative; }
      .category-search input { min-height: 36px; padding-left: 34px; padding-right: 36px; }
      .category-search-icon { color: var(--muted); display: grid; left: 11px; place-items: center; pointer-events: none; position: absolute; top: 50%; transform: translateY(-50%); z-index: 1; }
      .category-search-clear { background: transparent; border: 0; color: var(--muted); min-height: 30px; padding: 0; position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 30px; }
      .category-search-clear:hover:not(:disabled), .category-search-clear:focus-visible { background: var(--primary-soft); color: var(--primary); }
      main[${enhancementMarker}] .filter-chips { background: var(--surface-soft); border-color: var(--line); flex: 0 1 auto; gap: 3px; padding: 3px; }
      main[${enhancementMarker}] .filter-chip { gap: 5px; min-height: 30px; padding: 0 8px; }
      .filter-count { align-items: center; background: rgba(15,61,76,.08); border-radius: 999px; display: inline-flex; font-size: .6875rem; justify-content: center; min-width: 20px; padding: 1px 5px; }
      .filter-chip[aria-pressed="true"] .filter-count { background: rgba(255,255,255,.18); }
      main[${enhancementMarker}] .category-collapse-actions { background: transparent; border: 0; flex-wrap: nowrap; padding: 0; }
      main[${enhancementMarker}] .compact-button { border: 1px solid var(--line); gap: 5px; min-height: 32px; }
      .category-filter-empty { align-items: center; background: var(--bg); border-bottom: 1px solid var(--line); display: grid; gap: 5px; justify-items: center; padding: 28px 16px; text-align: center; }
      .category-filter-empty > svg { color: var(--muted); }
      main[${enhancementMarker}] .category-tree-list { display: grid; }
      main[${enhancementMarker}] .category-kind-group { border-bottom: 1px solid var(--line); gap: 0; padding: 0; }
      main[${enhancementMarker}] .category-kind-group > header { background: #fbfdfe; border-bottom: 1px solid var(--line); min-height: 48px; padding: 9px 16px; }
      .category-kind-title { align-items: center; display: flex; gap: 10px; min-width: 0; }
      .category-kind-icon { align-items: center; background: var(--primary-soft); border-radius: 999px; color: var(--primary); display: inline-flex; flex: 0 0 auto; height: 30px; justify-content: center; width: 30px; }
      [data-category-kind="expense"] > header .category-kind-icon { background: var(--danger-bg); color: var(--danger); }
      [data-category-kind="income"] > header .category-kind-icon { background: var(--success-bg); color: var(--success); }
      [data-category-kind="transfer"] > header .category-kind-icon { background: var(--cyan-soft); color: #0369a1; }
      .category-kind-title > div { display: grid; gap: 1px; min-width: 0; }
      main[${enhancementMarker}] .category-kind-group header > div:first-child { margin-right: auto; }
      main[${enhancementMarker}] .category-tree-nodes { gap: 0; }
      main[${enhancementMarker}] .category-tree-node { background: transparent; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; gap: 0; padding: 0; transition: none; }
      main[${enhancementMarker}] .category-tree-node:last-child { border-bottom: 0; }
      main[${enhancementMarker}] .category-tree-node[data-category-status="archived"] > .category-node-row { background: #fffdf7; }
      main[${enhancementMarker}] .category-node-row { align-items: center; gap: 8px; min-height: 48px; padding: 7px 12px 7px 16px; transition: background 120ms ease-out; }
      main[${enhancementMarker}] .category-node-row:hover, main[${enhancementMarker}] .category-node-row:focus-within { background: var(--primary-soft); }
      main[${enhancementMarker}] .category-collapse-button, main[${enhancementMarker}] .category-collapse-spacer { align-self: center; min-height: 32px; min-width: 32px; width: 32px; }
      main[${enhancementMarker}] .category-collapse-button { background: transparent; border-color: transparent; }
      main[${enhancementMarker}] .category-collapse-button:hover:not(:disabled), main[${enhancementMarker}] .category-collapse-button:focus-visible { background: var(--surface); border-color: #c8dde5; color: var(--primary); }
      .category-collapse-button svg { transition: transform .15s ease; }
      .category-tree-node[data-category-collapsed="true"] > .category-node-row .category-collapse-button svg { transform: rotate(-90deg); }
      main[${enhancementMarker}] .category-node-button { align-items: center; gap: 10px; grid-template-columns: auto minmax(0, 1fr) minmax(8rem, auto); min-height: 34px; width: 100%; }
      button.category-node-button:hover:not(:disabled), button.category-node-button:focus-visible { background: transparent; color: inherit; }
      main[${enhancementMarker}] .category-node-text { gap: 2px; }
      main[${enhancementMarker}] .category-node-text strong { font-size: .875rem; line-height: 1.3; }
      .category-node-meta { align-items: center; color: var(--muted); display: flex; flex-wrap: wrap; font-size: .75rem; gap: 6px; }
      .category-status-badge { border: 1px solid transparent; border-radius: 999px; font-size: .6875rem; font-weight: 700; line-height: 1.3; padding: 1px 6px; }
      .category-status-active { background: var(--success-bg); border-color: #bbf7d0; color: var(--success); }
      .category-status-archived { background: var(--warning-bg); border-color: #fde68a; color: var(--warning); }
      main[${enhancementMarker}] .category-path { align-items: center; background: transparent; border-radius: 0; color: var(--muted); display: inline-flex; font-size: .75rem; font-weight: 500; gap: 4px; justify-self: end; max-width: 24rem; min-width: 0; overflow: hidden; padding: 0; text-align: right; }
      main[${enhancementMarker}] .category-path > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      main[${enhancementMarker}] .category-path[data-redundant-path="true"] { display: none; }
      main[${enhancementMarker}] .category-menu-button { min-height: 34px; width: 34px; }
      main[${enhancementMarker}] .category-menu-popover { min-width: 176px; z-index: 12; }
      main[${enhancementMarker}] .category-menu-popover button { min-height: 36px; }
      main[${enhancementMarker}] .category-tree-children { border-left-color: #c8dde5; gap: 0; margin-left: 32px; padding-left: 12px; }
      main[${enhancementMarker}] .category-tree-children .category-node-row { padding-left: 10px; }
      main[${enhancementMarker}] .empty-state { margin: 12px 16px; }
      main[${enhancementMarker}] .category-dialog { gap: 16px; max-width: 640px; padding: 0; width: min(calc(100vw - 32px), 640px); }
      main[${enhancementMarker}] .category-dialog-header { border-bottom: 1px solid var(--line); padding: 16px 18px 14px; }
      main[${enhancementMarker}] .category-dialog-header .icon-button { min-height: 36px; min-width: 36px; width: 36px; }
      main[${enhancementMarker}] .category-dialog-header > div { gap: 4px; max-width: 520px; }
      main[${enhancementMarker}] .category-form { gap: 14px; grid-template-columns: minmax(10rem, .7fr) minmax(0, 1.3fr); padding: 0 18px 18px; }
      main[${enhancementMarker}] .category-form label > small { color: var(--muted); font-size: .75rem; font-weight: 400; line-height: 1.35; }
      main[${enhancementMarker}] .category-form label > span > small { font-size: .75rem; font-weight: 400; }
      main[${enhancementMarker}] .category-parent-field { grid-column: 2; }
      main[${enhancementMarker}] .dialog-actions { align-items: center; border-top: 1px solid var(--line); display: flex; gap: 12px; grid-column: 1 / -1; justify-content: space-between; margin: 2px -18px -18px; padding: 14px 18px; }
      .dialog-secondary-actions, .dialog-primary-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
      .dialog-primary-actions { justify-content: flex-end; }
      main[${enhancementMarker}] .dialog-actions button { gap: 5px; min-height: 38px; }
      main[${enhancementMarker}] .form-status { margin-top: 0; }
      @media (max-width: 980px) {
        main[${enhancementMarker}] .categories-insights { grid-template-columns: 1fr; }
        main[${enhancementMarker}] .category-toolbar { grid-template-columns: 1fr; }
        .category-toolbar-controls { justify-content: flex-start; }
        .category-search { max-width: none; }
      }
      @media (max-width: 760px) {
        main[${enhancementMarker}] { gap: 14px; padding: 16px 16px 28px; }
        main[${enhancementMarker}] .categories-hero { align-items: stretch; display: grid; }
        main[${enhancementMarker}] .categories-hero .sf-button { min-height: 44px; width: 100%; }
        .category-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        main[${enhancementMarker}] .kind-meters { grid-template-columns: 1fr; }
        main[${enhancementMarker}] .category-toolbar { padding-inline: 12px; }
        .category-toolbar-controls { align-items: stretch; display: grid; grid-template-columns: 1fr; }
        .category-search { max-width: none; min-width: 0; width: 100%; }
        .category-search input { min-height: 44px; }
        main[${enhancementMarker}] .filter-chips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
        main[${enhancementMarker}] .filter-chip { justify-content: flex-start; min-height: 42px; }
        .filter-count { margin-left: auto; }
        main[${enhancementMarker}] .category-collapse-actions { display: grid; grid-template-columns: 1fr 1fr; }
        main[${enhancementMarker}] .compact-button { min-height: 42px; }
        main[${enhancementMarker}] .category-kind-group > header { align-items: center; display: flex; padding-inline: 12px; }
        main[${enhancementMarker}] .category-node-row { grid-template-columns: auto minmax(0, 1fr) auto; padding-inline: 8px; }
        main[${enhancementMarker}] .category-node-button { grid-template-columns: auto minmax(0, 1fr); }
        main[${enhancementMarker}] .category-path { grid-column: 2; justify-self: start; max-width: 100%; text-align: left; }
        main[${enhancementMarker}] .category-menu-button, main[${enhancementMarker}] .category-collapse-button { min-height: 40px; width: 40px; }
        main[${enhancementMarker}] .category-tree-children { margin-left: 20px; max-width: calc(100% - 20px); min-width: 0; padding-left: 6px; }
        main[${enhancementMarker}] .category-dialog { max-height: calc(100svh - 16px); width: min(calc(100vw - 16px), 640px); }
        main[${enhancementMarker}] .category-dialog-header { padding: 14px; }
        main[${enhancementMarker}] .category-form { grid-template-columns: 1fr; padding: 0 14px 14px; }
        main[${enhancementMarker}] .category-parent-field { grid-column: 1; }
        main[${enhancementMarker}] .dialog-actions { align-items: stretch; display: grid; margin: 2px -14px -14px; padding: 12px 14px; }
        .dialog-secondary-actions, .dialog-primary-actions { display: grid; grid-template-columns: 1fr; }
        main[${enhancementMarker}] .dialog-actions button { min-height: 44px; width: 100%; }
      }
      @media (max-width: 420px) {
        .category-summary { grid-template-columns: 1fr 1fr; }
        main[${enhancementMarker}] .filter-chips { grid-template-columns: 1fr; }
      }
    </style>`,
  );
}

function injectRuntime(html: string): string {
  return html.replace(
    "</body>",
    `
    <script data-categories-design-runtime>
      (() => {
        const root = document.querySelector("main[${enhancementMarker}]");
        const categoryList = root?.querySelector("[data-category-list]");
        if (!root || !categoryList) return;

        const searchInput = root.querySelector("[data-category-search-input]");
        const clearSearchButton = root.querySelector("[data-clear-category-search]");
        const resetViewButton = root.querySelector("[data-reset-category-view]");
        const filterButtons = Array.from(root.querySelectorAll("[data-category-filter]"));
        const groups = Array.from(root.querySelectorAll(".category-kind-group"));
        const emptyState = root.querySelector("[data-category-filter-empty]");
        const resultsStatus = root.querySelector("[data-category-results-status]");
        const modal = root.querySelector("[data-category-modal]");
        let activeFilter = "all";
        let openMenuTrigger = null;

        const normalize = (value) => String(value || "")
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .toLocaleLowerCase("pt-BR")
          .trim();

        const categoryItems = Array.from(root.querySelectorAll("[data-category-item]"));
        categoryItems.forEach((item) => {
          const button = item.querySelector(":scope > .category-node-row [data-edit-category]");
          const name = button?.dataset.categoryName || item.querySelector(":scope > .category-node-row .category-node-text strong")?.textContent || "";
          const path = item.querySelector(":scope > .category-node-row .category-path");
          const pathText = path?.textContent?.trim() || "";
          item.dataset.categorySearchText = normalize(name + " " + pathText);
          if (path && normalize(pathText) === normalize(name)) path.dataset.redundantPath = "true";
        });

        function matchesFilter(item) {
          return activeFilter === "all" || item.dataset.categoryKind === activeFilter || item.dataset.categoryStatus === activeFilter;
        }

        function applyNode(item, query) {
          const children = Array.from(item.querySelectorAll(":scope > .category-tree-children > [data-category-item]"));
          const childMatches = children.map((child) => applyNode(child, query)).some(Boolean);
          const searchMatches = query.length === 0 || (item.dataset.categorySearchText || "").includes(query);
          const selfMatches = matchesFilter(item) && searchMatches;
          const visible = selfMatches || childMatches;
          item.hidden = !visible;
          item.dataset.categorySelfMatch = String(selfMatches);
          if ((query || activeFilter !== "all") && childMatches && typeof setCategoryCollapsed === "function") {
            setCategoryCollapsed(item, false);
          }
          return visible;
        }

        function applyView() {
          const query = normalize(searchInput?.value);
          let visibleCount = 0;

          groups.forEach((group) => {
            const rootItems = Array.from(group.querySelectorAll(":scope > .category-tree-nodes > [data-category-item]"));
            const groupVisible = rootItems.map((item) => applyNode(item, query)).some(Boolean);
            group.hidden = !groupVisible;
          });

          categoryItems.forEach((item) => {
            if (item.dataset.categorySelfMatch === "true") visibleCount += 1;
          });

          filterButtons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.categoryFilter === activeFilter));
          });

          if (clearSearchButton) clearSearchButton.hidden = !searchInput?.value;
          if (emptyState) emptyState.hidden = visibleCount > 0 || categoryItems.length === 0;
          if (resultsStatus) {
            resultsStatus.textContent = visibleCount + (visibleCount === 1 ? " categoria exibida" : " categorias exibidas");
          }
        }

        root.addEventListener("click", (event) => {
          const filterButton = event.target.closest?.("[data-category-filter]");
          if (!filterButton || !root.contains(filterButton)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          activeFilter = filterButton.dataset.categoryFilter || "all";
          applyView();
        }, true);

        searchInput?.addEventListener("input", applyView);
        searchInput?.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && searchInput.value) {
            event.stopPropagation();
            searchInput.value = "";
            applyView();
          }
        });

        clearSearchButton?.addEventListener("click", () => {
          searchInput.value = "";
          applyView();
          searchInput.focus();
        });

        resetViewButton?.addEventListener("click", () => {
          activeFilter = "all";
          if (searchInput) searchInput.value = "";
          applyView();
          searchInput?.focus();
        });

        root.querySelectorAll("[data-category-menu-button]").forEach((button) => {
          button.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            button.click();
            button.parentElement?.querySelector('[role="menuitem"]')?.focus();
          });
          button.addEventListener("click", () => {
            openMenuTrigger = button;
          });
        });

        root.querySelectorAll("[data-category-menu]").forEach((menu) => {
          menu.addEventListener("keydown", (event) => {
            const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
            const currentIndex = items.indexOf(document.activeElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              const nextIndex = (currentIndex + direction + items.length) % items.length;
              items[nextIndex]?.focus();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              menu.hidden = true;
              openMenuTrigger?.setAttribute("aria-expanded", "false");
              openMenuTrigger?.focus();
            }
          });
        });

        modal?.addEventListener("keydown", (event) => {
          if (event.key !== "Tab" || modal.hidden) return;
          const focusable = Array.from(modal.querySelectorAll('button:not(:disabled):not([hidden]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]'));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        });

        applyView();
      })();
    </script>
  </body>`,
  );
}
