import {
  renderPageContainer,
  renderPageHeader,
  renderRecoverableError,
} from "../design-system/primitives.js";
import { apiGet } from "./api.js";
import { icon } from "./icons.js";
import { sharedShellStyles } from "./shared-styles.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { getSecondaryRoutePageViewModel } from "./secondary-routes-view-model.js";

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

const categoriesPageModel = getSecondaryRoutePageViewModel("categories");

interface CategorySummary {
  total: number;
  active: number;
  archived: number;
  roots: number;
  children: number;
  expense: number;
  income: number;
  transfer: number;
}

export async function renderCategoriesPage(token: string): Promise<string> {
  const categories = await apiGet<{ categories: CategoryRecord[] }>(
    token,
    "/api/categories?status=all",
  );

  if (!categories.ok) {
    return renderShell(
      "Categorias",
      renderRecoverableError({
        title: "Não foi possível carregar as categorias",
        description: categories.error,
        actionHtml: '<a class="sf-button" href="/categorias">Tentar novamente</a>',
      }),
    );
  }

  const categoryItems = categories.data.categories;
  const summary = summarizeCategories(categoryItems);

  return renderShell(
    "Categorias",
    `
        ${renderPageHeader({
          eyebrow: categoriesPageModel.eyebrow,
          title: categoriesPageModel.title,
          description: categoriesPageModel.description,
          actionsHtml: `<button class="sf-button" type="button" data-open-category-modal title="Criar nova categoria">${icon("plus", 14)} Nova categoria</button>`,
        })}
        <dl class="category-overview" aria-label="Resumo das categorias">
          <div><dt>Total de categorias</dt><dd>${summary.total}</dd></div>
          <div><dt>Ativas</dt><dd>${summary.active}</dd></div>
          <div><dt>Arquivadas</dt><dd>${summary.archived}</dd></div>
          <div><dt>Categorias principais</dt><dd>${summary.roots}</dd></div>
        </dl>

        <section class="categories-workspace">


          <section class="sf-panel category-directory">
            <div class="category-toolbar">
              <div>
                <h2>Categorias por hierarquia</h2>
                <p class="sf-muted">Use o menu de cada categoria para editar, arquivar ou excluir.</p>
              </div>
              <div class="category-toolbar-actions">
                <div class="category-search" role="search">
                  <span aria-hidden="true">${icon("search", 14)}</span>
                  <input id="category-search-input" type="search" aria-label="Buscar categorias" autocomplete="off" placeholder="Buscar por nome ou caminho" data-category-search-input />
                  <button class="category-search-clear" type="button" data-clear-category-search aria-label="Limpar busca" title="Limpar busca" hidden>${icon("x", 14)}</button>
                </div>
                <div class="filter-chips" aria-label="Filtros locais de categorias">
                  ${renderFilterButton("Todas", "all", true)}
                  ${renderFilterButton("Despesas", "expense")}
                  ${renderFilterButton("Receitas", "income")}
                  ${renderFilterButton("Transferências", "transfer")}
                  ${renderFilterButton("Arquivadas", "archived")}
                </div>
                ${renderCategoryCollapseActions()}
              </div>
              <p class="category-results-status" data-category-results-status role="status" aria-live="polite"></p>
            </div>
            ${
              categoryItems.length
                ? `
              <div class="category-filter-empty" data-category-filter-empty hidden>
                <strong>Nenhuma categoria encontrada</strong>
                <p class="sf-muted">Revise a busca ou selecione outro filtro.</p>
                <button class="secondary-button" type="button" data-reset-category-view>Limpar busca e filtros</button>
              </div>
            `
                : ""
            }
            <div class="category-tree-list" data-category-list>
              ${renderCategoryTree(categoryItems)}
            </div>
          </section>
        </section>

        <section class="category-modal" data-category-modal hidden aria-hidden="true">
          <div class="category-modal-backdrop" data-close-category-modal></div>
          <div class="category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-modal-title" aria-describedby="category-modal-description">
            <div class="category-dialog-header">
              <div>
                <p class="sf-eyebrow" data-category-modal-eyebrow>Novo cadastro</p>
                <h2 id="category-modal-title" data-category-modal-title>Nova categoria</h2>
                <p id="category-modal-description" class="sf-muted">Preencha os dados da categoria e salve para aplicar em novos lançamentos.</p>
              </div>
              <button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal" title="Fechar">${icon("x", 16)}</button>
            </div>
            <form class="category-form" data-api-form data-category-form data-api-path="/api/categories">
              <label for="category-name">Nome<input id="category-name" name="name" autocomplete="off" required /></label>
              <label for="category-kind">Tipo
                <select id="category-kind" name="kind" required>
                  ${renderCategoryKindOptions()}
                </select>
              </label>
              <label class="full-span" for="category-parent">Categoria superior
                <select id="category-parent" name="parentCategoryId">
                  <option value="">Categoria principal</option>
                  ${renderCategoryParentOptions(categoryItems)}
                </select>
              </label>
              <div class="dialog-actions">
                <button class="sf-button secondary" type="button" data-close-category-modal>Cancelar</button>
                <button class="secondary-button danger-action" type="button" data-category-status-action hidden></button>
                <button class="sf-button" type="submit" data-category-submit title="Salvar categoria">${icon("save", 14)} Criar categoria</button>
              </div>
            </form>
          </div>
        </section>
        ${apiFormScript()}
        ${categoryPageScript()}
      `,
  );
}

function summarizeCategories(categories: CategoryRecord[]): CategorySummary {
  return categories.reduce<CategorySummary>(
    (summary, category) => {
      summary.total += 1;
      if (category.status === "archived") summary.archived += 1;
      else summary.active += 1;
      if (category.parentCategoryId) summary.children += 1;
      else summary.roots += 1;
      if (category.kind === "expense") summary.expense += 1;
      if (category.kind === "income") summary.income += 1;
      if (category.kind === "transfer") summary.transfer += 1;
      return summary;
    },
    { total: 0, active: 0, archived: 0, roots: 0, children: 0, expense: 0, income: 0, transfer: 0 },
  );
}

function renderFilterButton(label: string, filter: string, pressed = false): string {
  return `<button class="filter-chip" type="button" data-category-filter="${escapeHtml(filter)}" aria-pressed="${pressed ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function renderCategoryCollapseActions(): string {
  return `
    <div class="category-collapse-actions" aria-label="Controles da hierarquia">
              <button class="secondary-button compact-button" type="button" data-expand-all-categories title="Expandir todas as categorias">${icon("chevron-down", 12)} Abrir todos</button>
      <button class="secondary-button compact-button" type="button" data-collapse-all-categories title="Recolher todas as categorias">${icon("chevron-up", 12)} Fechar todos</button>
    </div>
  `;
}

export function renderCategoryTree(categories: CategoryRecord[]): string {
  const visibleKinds = ["expense", "income", "transfer"];
  const content = visibleKinds
    .map((kind) => {
      const categoriesForKind = categories.filter((category) => category.kind === kind);
      const rootCategories = categoriesForKind
        .filter(
          (category) =>
            !category.parentCategoryId ||
            !categoriesForKind.some((candidate) => candidate.id === category.parentCategoryId),
        )
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

      if (categoriesForKind.length === 0) return "";

      return `
        <section class="category-kind-group" data-category-kind="${escapeHtml(kind)}" aria-labelledby="category-kind-${escapeHtml(kind)}">
          <header>
            <div>
              <h3 id="category-kind-${escapeHtml(kind)}">${escapeHtml(formatCategoryKind(kind))}</h3>
              <p class="sf-muted">${categoriesForKind.length} categorias · organização por níveis</p>
            </div>
          </header>
          <div class="category-column-headings" aria-hidden="true"><span>Categoria</span><span>Categoria superior</span><span>Nível</span><span>Situação</span><span>Ações</span></div>
          <ul class="category-tree-nodes">
            ${
              rootCategories
                .map((category) => renderCategoryTreeNode(category, categories, 0))
                .join("") ||
              '<li class="category-empty">Sem categorias principais neste grupo.</li>'
            }
          </ul>
        </section>
      `;
    })
    .join("");

  return (
    content ||
    renderEmptyState(
      "Nenhuma categoria cadastrada.",
      "Crie uma categoria para organizar receitas e despesas.",
    )
  );
}

function renderCategoryTreeNode(
  category: CategoryRecord,
  categories: CategoryRecord[],
  depth: number,
): string {
  const children = categories
    .filter(
      (candidate) => candidate.parentCategoryId === category.id && candidate.kind === category.kind,
    )
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const displayName = getCategoryDisplayName(category, categories);
  const hasChildren = children.length > 0;
  const childrenId = `category-children-${category.id}`;
  const parentLabel = depth === 0 ? "Categoria principal" : `Nível ${depth + 1}`;
  const statusLabel = formatGenericStatus(category.status);
  const parent = categories.find((candidate) => candidate.id === category.parentCategoryId);
  const parentName = category.parentCategoryId
    ? (parent?.name ?? "Categoria indisponível")
    : "Principal";
  const statusIcon = icon(category.status === "archived" ? "archive" : "check-circle", 16);

  return `
    <li class="category-tree-node ${depth ? "category-tree-child" : ""}"
      data-category-item data-category-depth="${depth}" data-category-kind="${escapeHtml(category.kind)}"
      data-category-status="${escapeHtml(category.status)}" data-category-collapsed="false">
      <div class="category-node-row">
        <div class="category-name-cell" style="--category-level: ${Math.min(depth, 8)}">
          ${hasChildren ? renderCategoryCollapseButton(category, childrenId) : '<span class="category-collapse-spacer" aria-hidden="true"></span>'}
          <button class="category-node-button" type="button" data-edit-category
            ${renderCategoryDataAttributes(category)} data-category-path="${escapeHtml(displayName)}"
            aria-label="Editar categoria ${escapeHtml(displayName)}" title="Editar categoria ${escapeHtml(category.name)}">
            <span class="category-node-icon" aria-hidden="true">${icon(depth ? "tag" : "layers", 16)}</span>
            <span class="category-node-text"><strong>${escapeHtml(category.name)}</strong></span>
          </button>
        </div>
        <div class="category-secondary-cells">
          <span class="category-parent-cell" title="${escapeHtml(parentName)}">${escapeHtml(parentName)}</span>
          <span class="category-level-cell" aria-label="Nível ${depth + 1}">${depth + 1}</span>
          <span class="category-status-cell" role="img" aria-label="${escapeHtml(statusLabel)}" title="${escapeHtml(statusLabel)}" data-category-status-icon="${escapeHtml(category.status)}">${statusIcon}</span>
        </div>
        ${renderCategoryActionMenu(category)}
      </div>
      ${hasChildren ? `<ul id="${escapeHtml(childrenId)}" class="category-tree-children" data-category-children>${children.map((child) => renderCategoryTreeNode(child, categories, depth + 1)).join("")}</ul>` : ""}
    </li>
  `;
}

function renderCategoryDataAttributes(category: CategoryRecord): string {
  return `data-category-id="${escapeHtml(category.id)}" data-category-name="${escapeHtml(category.name)}" data-category-kind-value="${escapeHtml(category.kind)}" data-category-status-value="${escapeHtml(category.status)}" data-category-parent-id="${escapeHtml(category.parentCategoryId ?? "")}"`;
}

function renderCategoryActionMenu(category: CategoryRecord): string {
  const isArchived = category.status === "archived";
  const statusLabel = isArchived ? "Restaurar" : "Arquivar";
  const statusPath = `/api/categories/${category.id}/${isArchived ? "restore" : "archive"}`;
  const statusConfirm = isArchived
    ? ""
    : "Arquivar esta categoria? Novos lançamentos nao devem usa-la.";

  return `
    <div class="category-action-menu">
              <button class="category-menu-button icon-button" type="button" data-category-menu-button aria-expanded="false" aria-label="Abrir acoes da categoria ${escapeHtml(category.name)}" title="Mais ações">${icon("more-vertical", 14)}</button>
      <div class="category-menu-popover" data-category-menu role="menu" hidden>
        ${!isArchived ? `<button type="button" role="menuitem" data-category-menu-action="create-child" ${renderCategoryDataAttributes(category)} title="Criar subcategoria">${icon("plus", 13)} Nova subcategoria</button>` : ""}
        <button type="button" role="menuitem" data-category-menu-action="edit" ${renderCategoryDataAttributes(category)} title="Editar categoria">${icon("pencil", 13)} Editar</button>
        <button type="button" role="menuitem" data-category-menu-action="request" data-api-method="POST" data-api-path="${escapeHtml(statusPath)}"${statusConfirm ? ` data-api-confirm="${escapeHtml(statusConfirm)}"` : ""} title="${isArchived ? "Restaurar categoria" : "Arquivar categoria"}">${isArchived ? icon("refresh-cw", 13) : icon("archive", 13)} ${statusLabel}</button>
        <button class="danger-menu-item" type="button" role="menuitem" data-category-menu-action="request" data-api-method="DELETE" data-api-path="/api/categories/${escapeHtml(category.id)}" data-api-confirm="Excluir esta categoria? Ela so sera removida se nao tiver subcategorias, lançamentos ou outros registros vinculados." title="Excluir categoria">${icon("trash-2", 13)} Excluir</button>
      </div>
    </div>
  `;
}

function renderCategoryCollapseButton(category: CategoryRecord, childrenId: string): string {
  return `
    <button
      class="category-collapse-button"
      type="button"
      data-toggle-category-children
      aria-expanded="true"
      aria-controls="${escapeHtml(childrenId)}"
      aria-label="Ocultar subcategorias de ${escapeHtml(category.name)}"
    >
      ${icon("chevron-down", 12)}
    </button>
  `;
}

function renderCategoryKindOptions(selected?: string): string {
  return [
    ["income", "Receita"],
    ["expense", "Despesa"],
    ["transfer", "Transferência"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

export function renderCategoryParentOptions(
  categories: CategoryRecord[],
  currentCategory?: CategoryRecord,
): string {
  return categories
    .filter((category) => category.id !== currentCategory?.id)
    .sort((left, right) =>
      getCategoryDisplayName(left, categories).localeCompare(
        getCategoryDisplayName(right, categories),
        "pt-BR",
      ),
    )
    .map((category) => {
      const selected = currentCategory?.parentCategoryId === category.id ? " selected" : "";
      const archived = category.status === "archived" ? " - arquivada" : "";
      const ancestors: string[] = [];
      const visited = new Set([category.id]);
      let parentId = category.parentCategoryId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        ancestors.push(parentId);
        parentId = categories.find((candidate) => candidate.id === parentId)?.parentCategoryId;
      }
      return `<option value="${escapeHtml(category.id)}" data-category-ancestor-ids="${escapeHtml(ancestors.join(","))}"${selected}>${escapeHtml(formatCategoryKind(category.kind))} - ${escapeHtml(getCategoryDisplayName(category, categories))}${archived}</option>`;
    })
    .join("");
}

function getCategoryDisplayName(
  category: CategoryRecord,
  categories: readonly CategoryRecord[],
): string {
  const path = [category.name];
  const visitedCategoryIds = new Set<string>([category.id]);
  let parentCategoryId = category.parentCategoryId;

  while (parentCategoryId) {
    if (visitedCategoryIds.has(parentCategoryId)) break;
    const parentCategory = categories.find((candidate) => candidate.id === parentCategoryId);
    if (!parentCategory) break;
    path.unshift(parentCategory.name);
    visitedCategoryIds.add(parentCategory.id);
    parentCategoryId = parentCategory.parentCategoryId;
  }

  return path.join(" > ");
}

function formatCategoryKind(kind: string): string {
  if (kind === "income") return "Receita";
  if (kind === "expense") return "Despesa";
  if (kind === "transfer") return "Transferência";
  return kind;
}

function formatGenericStatus(status: string): string {
  if (status === "active") return "Ativo";
  if (status === "archived") return "Arquivado";
  return status;
}

function renderEmptyState(title: string, description: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p class="sf-muted">${escapeHtml(description)}</p></div>`;
}

function renderShell(currentLabel: string, content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/categorias",
    currentLabel,
    styles: pageCss(),
    content: renderPageContainer({
      className: "secondary-route-page categories-page",
      childrenHtml: `<div data-secondary-route-foundation="${categoriesPageModel.id}" data-route-archetype="${categoriesPageModel.archetype}" data-route-audience="${categoriesPageModel.audience}" data-operational-mode="${categoriesPageModel.operationalMode}">${content}</div>`,
    }),
  });
}

function apiFormScript(): string {
  return `
    <script>
      function ensureStatus(container) {
        let status = container.querySelector(":scope > [data-form-status]");
        if (!status) {
          status = document.createElement("p");
          status.className = "form-status muted";
          status.setAttribute("data-form-status", "");
          status.setAttribute("aria-live", "polite");
          container.appendChild(status);
        }
        return status;
      }

      function buildPayload(form) {
        const payload = {};
        new FormData(form).forEach((value, key) => {
          if (value === "") {
            if (key === "parentCategoryId") payload[key] = null;
            return;
          }
          payload[key] = value;
        });
        return payload;
      }

      async function readApiMessage(response) {
        const body = await response.json().catch(() => ({}));
        if (response.ok) return "Acao concluida. Atualizando a tela...";
        return (body.error && body.error.message) || "Nao foi possivel concluir a acao.";
      }

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submitButton = form.querySelector('button[type="submit"]');
          const method = form.dataset.apiMethod || "POST";
          if (submitButton) submitButton.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Salvando...";
          const response = await fetch(form.dataset.apiPath, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload(form)),
          });
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 450);
            return;
          }
          if (submitButton) submitButton.disabled = false;
        });
      });
    </script>
  `;
}

function categoryPageScript(): string {
  return `
    <script>
      const modal = document.querySelector("[data-category-modal]");
      const modalTitle = document.querySelector("[data-category-modal-title]");
      const modalEyebrow = document.querySelector("[data-category-modal-eyebrow]");
      const categoryForm = document.querySelector("[data-category-form]");
      const submitButton = document.querySelector("[data-category-submit]");
      const statusActionButton = document.querySelector("[data-category-status-action]");
      const openButton = document.querySelector("[data-open-category-modal]");
      const closeButtons = document.querySelectorAll("[data-close-category-modal]");
      const expandAllButton = document.querySelector("[data-expand-all-categories]");
      const collapseAllButton = document.querySelector("[data-collapse-all-categories]");
      let lastTrigger = openButton;

      function formStatus() {
        return categoryForm ? ensureStatus(categoryForm) : null;
      }

      function categoryKindLabel(kind) {
        if (kind === "income") return "Receita";
        if (kind === "expense") return "Despesa";
        if (kind === "transfer") return "Transferência";
        return "";
      }

      function filterParentCategoryOptions(kind, selectedParentId) {
        const select = categoryForm?.elements.parentCategoryId;
        if (!select) return;
        const label = categoryKindLabel(kind);
        const currentCategoryId = categoryForm?.dataset.currentCategoryId || "";
        Array.from(select.options).forEach((option, index) => {
          const forbidden = currentCategoryId && (
            option.value === currentCategoryId ||
            (option.dataset.categoryAncestorIds || "").split(",").includes(currentCategoryId)
          );
          const visible = (index === 0 || option.textContent.startsWith(label + " - ")) && !forbidden;
          option.hidden = !visible;
          option.disabled = !visible;
        });
        if (selectedParentId !== undefined) select.value = selectedParentId;
        if (select.options[select.selectedIndex]?.disabled) select.value = "";
      }

      function closeCategoryMenus(exceptMenu) {
        document.querySelectorAll("[data-category-menu]").forEach((menu) => {
          if (menu === exceptMenu) return;
          menu.hidden = true;
          menu.parentElement?.querySelector("[data-category-menu-button]")?.setAttribute("aria-expanded", "false");
        });
      }

      function openModal(trigger) {
        if (!modal) return;
        const contextTrigger = trigger?.closest?.(".category-action-menu")?.querySelector("[data-category-menu-button]");
        closeCategoryMenus();
        lastTrigger = contextTrigger || trigger || openButton;
        document.querySelectorAll("[data-category-item][data-category-editing]").forEach((item) => {
          delete item.dataset.categoryEditing;
        });
        const currentItem = trigger?.closest?.("[data-category-item]");
        if (currentItem) currentItem.dataset.categoryEditing = "true";
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        window.setTimeout(() => categoryForm?.elements.name?.focus(), 0);
      }

      function closeModal() {
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        document.querySelectorAll("[data-category-item][data-category-editing]").forEach((item) => {
          delete item.dataset.categoryEditing;
        });
        lastTrigger?.focus();
      }

      function resetStatus() {
        const status = formStatus();
        if (!status) return;
        status.className = "form-status muted";
        status.textContent = "";
      }

      function openCreateModal(trigger) {
        if (!categoryForm) return;
        categoryForm.reset();
        delete categoryForm.dataset.currentCategoryId;
        categoryForm.dataset.apiPath = "/api/categories";
        delete categoryForm.dataset.apiMethod;
        filterParentCategoryOptions(categoryForm.elements.kind.value);
        modalEyebrow.textContent = "Novo cadastro";
        modalTitle.textContent = "Nova categoria";
        submitButton.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 21 17 13 7 13 7 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 3 7 8 15 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Criar categoria';
        statusActionButton.hidden = true;
        resetStatus();
        openModal(trigger);
      }

      function openEditModal(button) {
        if (!categoryForm) return;
        categoryForm.reset();
        categoryForm.dataset.apiPath = "/api/categories/" + button.dataset.categoryId;
        categoryForm.dataset.apiMethod = "PATCH";
        categoryForm.dataset.currentCategoryId = button.dataset.categoryId || "";
        categoryForm.elements.name.value = button.dataset.categoryName || "";
        categoryForm.elements.kind.value = button.dataset.categoryKindValue || "expense";
        filterParentCategoryOptions(categoryForm.elements.kind.value, button.dataset.categoryParentId || "");
        modalEyebrow.textContent = "Editar categoria";
        modalTitle.textContent = button.dataset.categoryName || "Categoria";
        submitButton.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 21 17 13 7 13 7 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 3 7 8 15 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Salvar edi\u00e7\u00e3o';
        statusActionButton.hidden = false;
        const isArchived = button.dataset.categoryStatusValue === "archived";
        const archiveIconSvg = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><polyline points="21 8 21 21 3 21 3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="3" width="22" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const restoreIconSvg = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><polyline points="23 4 23 10 17 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        statusActionButton.innerHTML = isArchived ? restoreIconSvg + " Restaurar categoria" : archiveIconSvg + " Arquivar categoria";
        statusActionButton.dataset.apiPath = "/api/categories/" + button.dataset.categoryId + (button.dataset.categoryStatusValue === "archived" ? "/restore" : "/archive");
        statusActionButton.dataset.apiConfirm = button.dataset.categoryStatusValue === "archived" ? "" : "Arquivar esta categoria? Novos lançamentos nao devem usa-la.";
        resetStatus();
        openModal(button);
      }

      async function runCategoryMenuRequest(button) {
        const path = button.dataset.apiPath;
        if (!path) return;
        const confirmation = button.dataset.apiConfirm;
        if (confirmation && !window.confirm(confirmation)) return;
        const item = button.closest("[data-category-item]");
        const status = item ? ensureStatus(item) : null;
        button.disabled = true;
        if (status) {
          status.className = "form-status muted";
          status.textContent = "Enviando...";
        }
        const response = await fetch(path, {
          method: button.dataset.apiMethod || "POST",
          headers: { "content-type": "application/json" },
        });
        if (status) {
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
        }
        if (response.ok) {
          window.setTimeout(() => window.location.reload(), 450);
          return;
        }
        button.disabled = false;
      }

      function setCategoryCollapsed(item, collapsed) {
        if (!item) return;
        const children = item.querySelector(":scope > .category-tree-children");
        const toggle = item.querySelector(":scope > .category-node-row .category-name-cell > [data-toggle-category-children]");
        item.dataset.categoryCollapsed = String(collapsed);
        if (children) children.hidden = collapsed;
        if (toggle) {
          toggle.setAttribute("aria-expanded", String(!collapsed));
          const name = item.querySelector(":scope > .category-node-row [data-edit-category]")?.dataset.categoryName || "categoria";
          toggle.setAttribute("aria-label", (collapsed ? "Mostrar" : "Ocultar") + " subcategorias de " + name);
          // SVG orientation follows the accessible expanded state in CSS.
        }
      }

      function setAllCategoriesCollapsed(collapsed) {
        closeCategoryMenus();
        document.querySelectorAll("[data-category-item]").forEach((item) => {
          if (item.querySelector(":scope > .category-tree-children")) setCategoryCollapsed(item, collapsed);
        });
      }

      openButton?.addEventListener("click", () => openCreateModal(openButton));
      categoryForm?.elements.kind?.addEventListener("change", (event) => {
        filterParentCategoryOptions(event.target.value);
      });
      expandAllButton?.addEventListener("click", () => setAllCategoriesCollapsed(false));
      collapseAllButton?.addEventListener("click", () => setAllCategoriesCollapsed(true));
      closeButtons.forEach((button) => button.addEventListener("click", closeModal));
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          const openMenu = Array.from(document.querySelectorAll("[data-category-menu]"))
            .find((menu) => !menu.hidden);
          if (openMenu) {
            event.preventDefault();
            const trigger = openMenu.parentElement?.querySelector("[data-category-menu-button]");
            closeCategoryMenus();
            trigger?.focus();
            return;
          }
          if (modal && !modal.hidden) {
            event.preventDefault();
            closeModal();
          }
        }
        if (event.key === "Tab" && modal && !modal.hidden) {
          const focusable = Array.from(modal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
          )).filter((element) => !element.closest("[hidden]"));
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
          }
        }
      });
      document.addEventListener("click", () => closeCategoryMenus());

      document.querySelectorAll("[data-edit-category]").forEach((button) => {
        button.addEventListener("click", () => openEditModal(button));
      });

      document.querySelectorAll("[data-category-menu-button]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const menu = button.parentElement?.querySelector("[data-category-menu]");
          if (!menu) return;
          const shouldOpen = menu.hidden;
          closeCategoryMenus(menu);
          menu.hidden = !shouldOpen;
          button.setAttribute("aria-expanded", String(shouldOpen));
          if (shouldOpen) menu.querySelector('[role="menuitem"]')?.focus();
        });
      });

      document.querySelectorAll("[data-category-menu]").forEach((menu) => {
        menu.addEventListener("click", (event) => event.stopPropagation());
        menu.addEventListener("keydown", (event) => {
          const actions = Array.from(menu.querySelectorAll('[role="menuitem"]:not([disabled])'));
          const index = actions.indexOf(document.activeElement);
          if (!actions.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0
            : event.key === "End" ? actions.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + actions.length) % actions.length;
          actions[next].focus();
        });
      });

      document.querySelectorAll('[data-category-menu-action="create-child"]').forEach((button) => {
        button.addEventListener("click", () => {
          openCreateModal(button);
          categoryForm.elements.kind.value = button.dataset.categoryKindValue || "expense";
          filterParentCategoryOptions(categoryForm.elements.kind.value, button.dataset.categoryId || "");
          modalEyebrow.textContent = "Dentro da hierarquia";
          modalTitle.textContent = "Nova subcategoria";
        });
      });

      document.querySelectorAll('[data-category-menu-action="edit"]').forEach((button) => {
        button.addEventListener("click", () => openEditModal(button));
      });

      document.querySelectorAll('[data-category-menu-action="request"]').forEach((button) => {
        button.addEventListener("click", () => runCategoryMenuRequest(button));
      });

      document.querySelectorAll("[data-toggle-category-children]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const item = button.closest("[data-category-item]");
          const collapsed = item?.dataset.categoryCollapsed === "true";
          setCategoryCollapsed(item, !collapsed);
        });
      });

      statusActionButton?.addEventListener("click", async () => {
        const path = statusActionButton.dataset.apiPath;
        if (!path) return;
        const confirmation = statusActionButton.dataset.apiConfirm;
        if (confirmation && !window.confirm(confirmation)) return;
        const status = formStatus();
        statusActionButton.disabled = true;
        if (status) {
          status.className = "form-status muted";
          status.textContent = "Enviando...";
        }
        const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" } });
        if (status) {
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = await readApiMessage(response);
        }
        if (response.ok) {
          window.setTimeout(() => window.location.reload(), 450);
          return;
        }
        statusActionButton.disabled = false;
      });

      const filterButtons = Array.from(document.querySelectorAll("[data-category-filter]"));
      const groups = Array.from(document.querySelectorAll(".category-kind-group"));
      const searchInput = document.querySelector("[data-category-search-input]");
      const clearSearchButton = document.querySelector("[data-clear-category-search]");
      const filterEmpty = document.querySelector("[data-category-filter-empty]");
      const resultsStatus = document.querySelector("[data-category-results-status]");
      const resetViewButton = document.querySelector("[data-reset-category-view]");
      let activeFilter = "all";

      function normalizeCategoryText(value) {
        return String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("pt-BR")
          .trim();
      }

      const categoryItems = Array.from(document.querySelectorAll("[data-category-item]"));
      categoryItems.forEach((item) => {
        const button = item.querySelector(":scope > .category-node-row [data-edit-category]");
        const name =
          button?.dataset.categoryName ||
          item.querySelector(":scope > .category-node-row .category-node-text strong")?.textContent ||
          "";
        const pathText = button?.dataset.categoryPath || "";
        item.dataset.categorySearchText = normalizeCategoryText(name + " " + pathText);
      });

      function matchesFilter(item) {
        return activeFilter === "all" ||
          item.dataset.categoryKind === activeFilter ||
          item.dataset.categoryStatus === activeFilter;
      }

      function applyViewToNode(item, query) {
        const children = Array.from(
          item.querySelectorAll(":scope > .category-tree-children > [data-category-item]"),
        );
        const childMatches = children.map((child) => applyViewToNode(child, query)).includes(true);
        const ownMatches =
          matchesFilter(item) &&
          (!query || (item.dataset.categorySearchText || "").includes(query));
        const visible = ownMatches || childMatches;
        item.hidden = !visible;
        item.dataset.categorySelfMatch = String(ownMatches);
        if ((query || activeFilter !== "all") && childMatches) setCategoryCollapsed(item, false);
        return visible;
      }

      function applyCategoryView() {
        const query = normalizeCategoryText(searchInput?.value);
        let visibleCount = 0;
        groups.forEach((group) => {
          const rootItems = Array.from(
            group.querySelectorAll(":scope > .category-tree-nodes > [data-category-item]"),
          );
          const hasVisibleItems = rootItems.map((item) => applyViewToNode(item, query)).includes(true);
          group.hidden = !hasVisibleItems;
        });
        categoryItems.forEach((item) => {
          if (item.dataset.categorySelfMatch === "true") visibleCount += 1;
        });
        filterButtons.forEach((candidate) =>
          candidate.setAttribute(
            "aria-pressed",
            String(candidate.dataset.categoryFilter === activeFilter),
          ),
        );
        if (clearSearchButton) clearSearchButton.hidden = !query;
        if (filterEmpty) filterEmpty.hidden = visibleCount > 0;
        if (resultsStatus) {
          resultsStatus.textContent =
            visibleCount === 1 ? "1 categoria exibida" : visibleCount + " categorias exibidas";
        }
      }

      filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
          activeFilter = button.dataset.categoryFilter || "all";
          applyCategoryView();
        });
      });
      searchInput?.addEventListener("input", applyCategoryView);
      searchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && searchInput.value) {
          searchInput.value = "";
          applyCategoryView();
        }
      });
      clearSearchButton?.addEventListener("click", () => {
        searchInput.value = "";
        searchInput.focus();
        applyCategoryView();
      });
      resetViewButton?.addEventListener("click", () => {
        activeFilter = "all";
        searchInput.value = "";
        applyCategoryView();
        searchInput.focus();
      });
      applyCategoryView();
    </script>
  `;
}

function pageCss(): string {
  return `
    ${sharedShellStyles()}
    [hidden] { display: none !important; }
    body.modal-open { overflow: hidden; }
    .categories-page { min-width: 0; max-width: 100%; }
    .categories-page .sf-muted { color: var(--muted); line-height: 1.4; }
    .categories-page .category-overview {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0; margin: 0; padding: 12px 0;
      border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
    }
    .categories-page .category-overview > div {
      min-width: 0; padding: 8px 18px; display: flex; flex-direction: column; gap: 4px;
    }
    .categories-page .category-overview > div + div { border-left: 1px solid var(--line); }
    .categories-page .category-overview dt { color: var(--muted); font-size: .75rem; }
    .categories-page .category-overview dd { color: var(--text); font-size: 1.3rem; font-weight: 700; line-height: 1.2; margin: 0; }
    .categories-workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; }
    .categories-page .category-directory { min-width: 0; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
    .categories-page .category-toolbar { display: grid; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--line); min-width: 0; }
    .categories-page .category-toolbar > div:first-child { display: grid; gap: 4px; }
    .categories-page .category-toolbar h2 { margin: 0; font-size: 1rem; }
    .categories-page .category-toolbar p { margin: 0; }
    .categories-page .category-toolbar-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; min-width: 0; max-width: 100%; }
    .categories-page .category-search {
      flex: 1 1 250px; min-width: 0; max-width: 420px; display: grid; align-items: center;
      grid-template-columns: 20px minmax(0, 1fr) 44px; gap: 8px; min-height: 44px;
      border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); padding: 0 6px 0 12px; color: var(--muted);
    }
    .categories-page .category-search:focus-within { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .categories-page .category-search input { border: none; background: transparent; width: 100%; min-width: 0; min-height: 44px; padding: 0; box-shadow: none; }
    .categories-page .category-search input:focus-visible { outline: 0; box-shadow: none; }
    .categories-page button.category-search-clear { min-height: 44px; min-width: 44px; padding: 0; background: transparent; border: 0; color: var(--muted); }
    .categories-page button.category-search-clear:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); }
    .categories-page .filter-chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; max-width: 100%; }
    .categories-page button.filter-chip {
      min-height: 44px; border: 1px solid var(--line); padding: 0 12px;
      background: var(--surface); color: var(--primary); font-size: .8125rem; font-weight: 600; border-radius: var(--radius);
    }
    .categories-page button.filter-chip:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--cyan); color: var(--primary); }
    .categories-page button.filter-chip[aria-pressed="true"] { background: var(--primary); border-color: var(--primary); color: white; }
    .categories-page button.filter-chip:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .categories-page .category-collapse-actions { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; max-width: 100%; }
    .categories-page button.compact-button {
      min-height: 44px; padding: 0 10px; gap: 4px; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); color: var(--primary); font-weight: 600; font-size: .75rem;
    }
    .categories-page button.compact-button:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--cyan); color: var(--primary); }
    .categories-page .category-results-status { color: var(--muted); font-size: .75rem; }
    .categories-page .category-filter-empty { display: grid; gap: 8px; padding: 24px 20px; justify-items: start; }
    .categories-page .category-tree-list { display: grid; min-width: 0; max-width: 100%; }
    .categories-page .category-kind-group { display: grid; gap: 6px; padding: 14px 20px 18px; min-width: 0; }
    .categories-page .category-kind-group + .category-kind-group { border-top: 1px solid var(--line); }
    .categories-page .category-kind-group > header { display: flex; align-items: center; gap: 10px; padding: 2px 0 8px; }
    .categories-page .category-kind-group h3 { margin: 0; color: var(--primary); font-size: .9rem; }
    .categories-page .category-kind-group header p { color: var(--muted); font-size: .75rem; margin: 4px 0 0; }
    .categories-page .category-kind-group { --category-columns: minmax(0, 2.4fr) minmax(0, 1.55fr) 64px 70px 44px; }
    .categories-page .category-column-headings { display: grid; grid-template-columns: var(--category-columns); gap: 8px; align-items: center; padding: 8px 0; border-block: 1px solid var(--line); color: var(--muted); font-size: .75rem; font-weight: 600; }
    .categories-page .category-column-headings span:nth-child(n + 3) { text-align: center; }
    .categories-page ul.category-tree-nodes, .categories-page ul.category-tree-children { list-style: none; margin: 0; padding: 0; min-width: 0; max-width: 100%; }
    .categories-page li.category-tree-node { position: relative; min-width: 0; margin: 0; padding: 0; }
    .categories-page li.category-tree-node + li.category-tree-node { border-top: 1px solid var(--line); }
    .categories-page .category-node-row { display: grid; grid-template-columns: var(--category-columns); align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 52px; padding: 2px 0; }
    .categories-page .category-node-row:hover { background: var(--primary-soft); }
    .categories-page .category-name-cell { display: flex; align-items: center; gap: 4px; min-width: 0; padding-inline-start: calc(var(--category-level, 0) * 14px); }
    .categories-page .category-collapse-spacer { display: block; flex: 0 0 44px; width: 44px; height: 44px; }
    .categories-page button.category-collapse-button { flex: 0 0 44px; width: 44px; min-height: 44px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--primary); border-radius: var(--radius); }
    .categories-page button.category-collapse-button:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--line); }
    .categories-page button.category-collapse-button[aria-expanded="false"] svg { transform: rotate(-90deg); }
    .categories-page button.category-collapse-button svg { transition: transform .16s ease; }
    .categories-page button.category-node-button { display: flex; align-items: center; gap: 8px; flex: 1 1 0%; min-width: 0; width: 100%; min-height: 44px; justify-content: flex-start; padding: 4px 6px; text-align: left; border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text); }
    .categories-page button.category-node-button:hover:not(:disabled) { background: var(--surface); color: var(--text); border-color: var(--line); }
    .categories-page li.category-tree-node[data-category-editing="true"] > .category-node-row button.category-node-button { border-color: var(--cyan); background: var(--primary-soft); }
    .categories-page .category-node-icon { flex: 0 0 16px; color: var(--muted); }
    .categories-page .category-tree-child .category-node-icon { color: var(--primary); }
    .categories-page .category-node-text { display: block; flex: 1 1 0%; min-width: 0; }
    .categories-page .category-node-text strong { display: block; min-width: 0; font-size: .84375rem; line-height: 1.3; font-weight: 650; overflow-wrap: anywhere; }
    .categories-page .category-secondary-cells { display: contents; }
    .categories-page .category-parent-cell { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: .8125rem; }
    .categories-page .category-level-cell { text-align: center; color: var(--muted); font-size: .8125rem; }
    .categories-page .category-status-cell { display: inline-flex; justify-content: center; align-items: center; min-width: 0; color: var(--success); }
    .categories-page .category-status-cell[data-category-status-icon="archived"] { color: var(--muted); }
    .categories-page .category-action-menu { position: relative; align-self: center; min-width: 0; }
    .categories-page button.category-menu-button { width: 44px; min-height: 44px; border: 1px solid var(--line); padding: 0; background: var(--surface); color: var(--primary); border-radius: var(--radius); }
    .categories-page button.category-menu-button:hover:not(:disabled), .categories-page button.category-menu-button[aria-expanded="true"] { background: var(--primary-soft); border-color: var(--cyan); color: var(--primary); }
    .categories-page .category-menu-popover { display: grid; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: 0 12px 32px rgba(15,23,42,.16); min-width: 172px; padding: 6px; position: absolute; top: calc(100% + 4px); right: 0; z-index: 8; }
    .categories-page .category-menu-popover button { display: flex; gap: 8px; justify-content: flex-start; align-items: center; text-align: left; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid transparent; border-radius: var(--radius); background: var(--surface); color: var(--primary); font-size: .8125rem; }
    .categories-page .category-menu-popover button:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--line); color: var(--primary); }
    .categories-page .category-menu-popover button.danger-menu-item { color: var(--danger); }
    .categories-page .category-menu-popover button.danger-menu-item:hover:not(:disabled) { color: var(--danger); background: var(--danger-bg); border-color: var(--line); }
    .categories-page button:focus-visible, .categories-page select:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
    .categories-page .empty-state { padding: 24px 20px; display: grid; gap: 6px; }
    .categories-page .category-empty { color: var(--muted); padding: 16px 0; }
    .categories-page .category-modal { inset: 0; position: fixed; z-index: 30; }
    .categories-page .category-modal-backdrop { background: rgba(6,25,35,.52); position: absolute; inset: 0; }
    .categories-page .category-dialog { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: grid; gap: 16px; padding: 20px; width: min(calc(100vw - 32px), 540px); max-height: calc(100svh - 32px); overflow-y: auto; background: var(--surface); border-radius: var(--radius-lg); box-shadow: 0 24px 80px rgba(15,23,42,.24); }
    .categories-page .category-dialog-header { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
    .categories-page .category-dialog-header > div { display: grid; gap: 4px; min-width: 0; }
    .categories-page .category-dialog-header h2 { overflow-wrap: anywhere; }
    .categories-page .category-dialog-header button.icon-button { width: 44px; min-width: 44px; min-height: 44px; border: 1px solid var(--line); background: var(--surface); color: var(--primary); }
    .categories-page .category-dialog-header button.icon-button:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); border-color: var(--cyan); }
    .categories-page .category-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .categories-page .category-form label { display: grid; gap: 6px; min-width: 0; }
    .categories-page .category-form input, .categories-page .category-form select { min-width: 0; width: 100%; }
    .categories-page .category-form .full-span, .categories-page .category-form .form-status { grid-column: 1 / -1; }
    .categories-page .dialog-actions { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
    .categories-page .dialog-actions button { min-height: 44px; }
    .categories-page .dialog-actions .danger-action { margin-right: auto; }
    .categories-page button.sf-button.secondary:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); border-color: var(--line); }
    @media (max-width: 840px) {
      .categories-page .category-column-headings { display: none; }
      .categories-page .category-node-row { grid-template-columns: minmax(0, 1fr) 44px; grid-template-rows: auto auto; column-gap: 4px; row-gap: 0; min-height: 56px; padding: 2px 0; }
      .categories-page .category-name-cell { grid-column: 1; grid-row: 1; }
      .categories-page .category-secondary-cells { display: flex; grid-column: 1; grid-row: 2; align-items: center; gap: 8px; min-width: 0; overflow: hidden; padding-inline-start: calc(44px + var(--category-level, 0) * 14px); }
      .categories-page .category-parent-cell { flex: 0 1 auto; min-width: 0; font-size: .75rem; }
      .categories-page .category-level-cell { flex: 0 0 auto; font-size: .75rem; }
      .categories-page .category-status-cell { flex: 0 0 18px; }
      .categories-page .category-action-menu { grid-column: 2; grid-row: 1 / span 2; }
    }
    @media (max-width: 760px) {
      .app-shell { grid-template-columns: minmax(0, 1fr); max-width: 100%; }
      .main-area { min-width: 0; max-width: 100%; }
      .sidebar { min-width: 0; max-width: 100%; }
      .sidebar > nav { flex: 1 1 0%; min-width: 0; max-width: 100%; }
      .categories-page .category-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .categories-page .category-overview > div:nth-child(3) { border-left: 0; }
      .categories-page .category-overview > div:nth-child(n + 3) { border-top: 1px solid var(--line); }
      .categories-page .category-overview > div { padding: 10px 12px; }
      .categories-page .category-toolbar { padding: 14px 12px; }
      .categories-page .category-toolbar-actions { align-items: stretch; }
      .categories-page .category-search { flex: 1 1 100%; max-width: none; }
      .categories-page .category-collapse-actions { margin-left: 0; }
      .categories-page .category-kind-group { padding: 14px 12px; }
      .categories-page .category-form { grid-template-columns: minmax(0, 1fr); }
      .categories-page .dialog-actions { justify-content: stretch; }
      .categories-page .dialog-actions button { flex: 1 1 120px; }
      .categories-page .dialog-actions button.danger-action { flex-basis: 100%; }
    }
    @media (max-width: 420px) {
      .categories-page .category-toolbar { padding-inline: 10px; }
      .categories-page .category-kind-group { padding-inline: 10px; }
      .categories-page ul.category-tree-children { margin-left: 7px; padding-left: 5px; }
      .categories-page .category-name-cell { padding-inline-start: calc(var(--category-level, 0) * 10px); }
      .categories-page .category-secondary-cells { padding-inline-start: calc(44px + var(--category-level, 0) * 10px); }
      .categories-page .category-menu-popover { max-width: min(220px, calc(100vw - 20px)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .categories-page button.category-collapse-button svg { transition: none; }
    }
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
