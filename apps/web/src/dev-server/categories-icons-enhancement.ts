import { icon } from "./icons.js";

interface CategoryFilterPresentation {
  filter: string;
  iconName: Parameters<typeof icon>[0];
  tooltip: string;
}

const categoryFilterPresentations: readonly CategoryFilterPresentation[] = [
  { filter: "all", iconName: "layers", tooltip: "Mostrar todas as categorias" },
  { filter: "expense", iconName: "arrow-down", tooltip: "Mostrar categorias de despesas" },
  { filter: "income", iconName: "arrow-up", tooltip: "Mostrar categorias de receitas" },
  { filter: "transfer", iconName: "repeat", tooltip: "Mostrar categorias de transferências" },
  { filter: "archived", iconName: "archive", tooltip: "Mostrar categorias arquivadas" },
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

    enhanced = enhanced.replace(filterPattern, (_match, opening: string, label: string) => {
      return `${opening} title="${presentation.tooltip}">${icon(presentation.iconName, 12)} ${label}</button>`;
    });
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
    /aria-label="Ocultar subcategorias de ([^"]+)"/g,
    'aria-label="Ocultar subcategorias de $1" title="Ocultar subcategorias de $1"',
  );
  enhanced = enhanced.replace(
    /<span class="category-path">([^<]*)<\/span>/g,
    `<span class="category-node-edit-hint" aria-hidden="true">${icon("pencil", 12)}<span class="category-path">$1</span></span>`,
  );

  enhanced = enhanced.replace(
    '        statusActionButton.hidden = true;',
    '        submitButton.title = "Criar categoria";\n        statusActionButton.hidden = true;',
  );
  enhanced = enhanced.replace(
    '        statusActionButton.hidden = false;',
    '        submitButton.title = "Salvar alterações da categoria";\n        statusActionButton.hidden = false;',
  );
  enhanced = enhanced.replace(
    '        statusActionButton.dataset.apiPath = "/api/categories/" + button.dataset.categoryId + (button.dataset.categoryStatusValue === "archived" ? "/restore" : "/archive");',
    '        const statusActionLabel = isArchived ? "Restaurar categoria" : "Arquivar categoria";\n        statusActionButton.title = statusActionLabel;\n        statusActionButton.setAttribute("aria-label", statusActionLabel);\n        statusActionButton.dataset.apiPath = "/api/categories/" + button.dataset.categoryId + (button.dataset.categoryStatusValue === "archived" ? "/restore" : "/archive");',
  );

  const currentCollapseStateUpdate = `          toggle.setAttribute("aria-label", (collapsed ? "Mostrar" : "Ocultar") + " subcategorias de " + name);
          const icon = toggle.querySelector("span");
          if (icon) icon.textContent = collapsed ? ">" : "v";`;
  const enhancedCollapseStateUpdate = `          const actionLabel = (collapsed ? "Mostrar" : "Ocultar") + " subcategorias de " + name;
          toggle.setAttribute("aria-label", actionLabel);
          toggle.setAttribute("title", actionLabel);
          const collapseIcon = toggle.querySelector("svg");
          if (collapseIcon) collapseIcon.style.transform = collapsed ? "rotate(-90deg)" : "rotate(0deg)";`;

  enhanced = enhanced.replace(currentCollapseStateUpdate, enhancedCollapseStateUpdate);
  enhanced = enhanced.replace(
    "</style>",
    `
      .filter-chip, .categories-hero .sf-button, .dialog-actions button, .sf-error-state .sf-button { gap: 5px; }
      .category-node-edit-hint { align-items: center; display: inline-flex; gap: 4px; justify-self: end; min-width: 0; }
      .category-node-edit-hint > svg { flex: 0 0 auto; }
      .category-collapse-button svg { transition: transform .15s ease; }
    </style>`,
  );

  return enhanced;
}
