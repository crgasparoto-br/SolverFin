import { icon } from "./icons.js";

interface CategoryFilterPresentation {
  filter: string;
  iconName: Parameters<typeof icon>[0];
  tooltip: string;
}

const categoryFilterPresentations: readonly CategoryFilterPresentation[] = [
  { filter: "all", iconName: "layers", tooltip: "Mostrar todas as categorias" },
  {
    filter: "expense",
    iconName: "arrow-down",
    tooltip: "Mostrar categorias de despesas",
  },
  {
    filter: "income",
    iconName: "arrow-up",
    tooltip: "Mostrar categorias de receitas",
  },
  {
    filter: "transfer",
    iconName: "repeat",
    tooltip: "Mostrar categorias de transferências",
  },
  {
    filter: "archived",
    iconName: "archive",
    tooltip: "Mostrar categorias arquivadas",
  },
];

export function enhanceCategoriesIconsAndTooltips(html: string): string {
  if (!html.includes("<title>Categorias - SolverFin</title>")) return html;
  if (html.includes("data-categories-icons-enhanced")) return html;

  let enhanced = html.replace("<main>", "<main data-categories-icons-enhanced>");

  enhanced = enhanced.replace(
    '<a class="sf-button" href="/categorias">Tentar novamente</a>',
    `<a class="sf-button" href="/categorias" title="Recarregar categorias">${icon("refresh-cw", 14)} Tentar novamente</a>`,
  );

  for (const presentation of categoryFilterPresentations) {
    const filterPattern = new RegExp(
      `(<button class="filter-chip" type="button" data-category-filter="${presentation.filter}" aria-pressed="(?:true|false)")>([^<]*)</button>`,
    );

    enhanced = enhanced.replace(
      filterPattern,
      (_match, opening: string, label: string) =>
        `${opening} title="${presentation.tooltip}">${icon(presentation.iconName, 12)} ${label}</button>`,
    );
  }

  enhanced = enhanced.replace(
    '<button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal">x</button>',
    `<button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal" title="Fechar">${icon("x", 14)}</button>`,
  );

  enhanced = enhanced.replace(
    '<button class="sf-button secondary" type="button" data-close-category-modal>Cancelar</button>',
    `<button class="sf-button secondary" type="button" data-close-category-modal title="Fechar sem salvar">${icon("x", 13)} Cancelar</button>`,
  );

  enhanced = enhanced.replace(
    /aria-label="Editar categoria ([^"]+)"/g,
    'aria-label="Editar categoria $1" title="Editar categoria $1"',
  );

  enhanced = enhanced.replace(
    /<span class="category-path">([^<]*)<\/span>/g,
    `<span class="category-path">${icon("pencil", 12)}$1</span>`,
  );

  enhanced = enhanced.replace(
    "</style>",
    `
      .filter-chip, .categories-hero .sf-button, .dialog-actions button, .sf-error-state .sf-button { gap: 5px; }
      .category-path { align-items: center; display: inline-flex; gap: 4px; }
      .category-path > svg { flex: 0 0 auto; }
      .category-collapse-button svg { transition: transform .15s ease; }
      .category-tree-node[data-category-collapsed="true"] > .category-node-row .category-collapse-button svg { transform: rotate(-90deg); }
      .category-tree-node { transition: background 120ms ease-out, border-color 120ms ease-out; }
      .category-tree-node:hover { background: #f8fafc; border-color: #cbd5e1; }
      button.category-node-button:hover:not(:disabled), button.category-node-button:focus-visible { background: transparent; color: inherit; }
      button.category-node-button:hover + .category-action-menu button.category-menu-button,
      button.category-node-button:focus-visible + .category-action-menu button.category-menu-button { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
    </style>`,
  );

  return enhanced;
}
