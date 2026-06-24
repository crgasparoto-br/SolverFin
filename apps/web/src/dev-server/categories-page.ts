import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  parentCategoryId?: string;
}

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
    return renderPage({
      title: "Categorias - SolverFin",
      body: renderShell(
        "/categorias",
        "Categorias",
        `<section class="sf-panel sf-error-state"><p class="sf-eyebrow">Erro ao carregar dados</p><h1>Categorias</h1><p class="sf-error" role="alert">${escapeHtml(categories.error)}</p><a class="sf-button" href="/categorias">Tentar novamente</a></section>`,
      ),
    });
  }

  const categoryItems = categories.data.categories;
  const summary = summarizeCategories(categoryItems);

  return renderPage({
    title: "Categorias - SolverFin",
    body: renderShell(
      "/categorias",
      "Categorias",
      `
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
            <div class="section-heading compact">
              <div>
                <h2>Mapa do catalogo</h2>
                <p class="sf-muted">Visao rapida sem alterar dados.</p>
              </div>
            </div>
            <div class="kind-meters">
              ${renderKindMeter("Despesa", summary.expense, summary.total, "expense")}
              ${renderKindMeter("Receita", summary.income, summary.total, "income")}
              ${renderKindMeter("Transferencia", summary.transfer, summary.total, "transfer")}
            </div>
            <div class="catalog-note">
              <strong>${summary.roots} categorias principais</strong>
              <p class="sf-muted">Use subcategorias apenas quando o detalhe ajudar na rotina ou nos relatorios.</p>
            </div>
          </aside>

          <section class="sf-panel category-directory">
            <div class="category-toolbar">
              <div>
                <h2>Categorias por hierarquia</h2>
                <p class="sf-muted">Use o menu de cada categoria para editar, arquivar ou excluir.</p>
              </div>
              <div class="category-toolbar-actions">
                <div class="category-collapse-actions" aria-label="Controles da hierarquia">
                  <button class="secondary-button compact-button" type="button" data-expand-all-categories>Abrir todos</button>
                  <button class="secondary-button compact-button" type="button" data-collapse-all-categories>Fechar todos</button>
                </div>
                <div class="filter-chips" aria-label="Filtros locais de categorias">
                  ${renderFilterButton("Todas", "all", true)}
                  ${renderFilterButton("Despesas", "expense")}
                  ${renderFilterButton("Receitas", "income")}
                  ${renderFilterButton("Transferencias", "transfer")}
                  ${renderFilterButton("Arquivadas", "archived")}
                </div>
              </div>
            </div>
            <div class="category-tree-list" data-category-list>
              ${renderCategoryTree(categoryItems)}
            </div>
          </section>
        </section>

        <section class="category-modal" data-category-modal hidden aria-hidden="true">
          <div class="category-modal-backdrop" data-close-category-modal></div>
          <div class="category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
            <div class="category-dialog-header">
              <div>
                <p class="sf-eyebrow" data-category-modal-eyebrow>Novo cadastro</p>
                <h2 id="category-modal-title" data-category-modal-title>Nova categoria</h2>
              </div>
              <button class="icon-button" type="button" data-close-category-modal aria-label="Fechar modal">x</button>
            </div>
            <form class="category-form" data-api-form data-category-form data-api-path="/api/categories">
              <label>Nome<input name="name" autocomplete="off" required /></label>
              <label>Tipo
                <select name="kind" required>
                  ${renderCategoryKindOptions()}
                </select>
              </label>
              <label class="full-span">Categoria superior
                <select name="parentCategoryId">
                  <option value="">Categoria principal</option>
                  ${renderCategoryParentOptions(categoryItems)}
                </select>
              </label>
              <div class="dialog-actions">
                <button class="sf-button secondary" type="button" data-close-category-modal>Cancelar</button>
                <button class="secondary-button danger-action" type="button" data-category-status-action hidden></button>
                <button class="sf-button" type="submit" data-category-submit>Criar categoria</button>
              </div>
            </form>
          </div>
        </section>
        ${apiFormScript()}
        ${categoryPageScript()}
      `,
    ),
  });
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

function renderKindMeter(label: string, count: number, total: number, tone: string): string {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <div class="kind-meter">
      <div><strong>${escapeHtml(label)}</strong><span>${count} itens</span></div>
      <div class="meter-track" aria-hidden="true"><span class="meter-fill meter-${escapeHtml(tone)}" style="width: ${percent}%"></span></div>
    </div>
  `;
}

function renderFilterButton(label: string, filter: string, pressed = false): string {
  return `<button class="filter-chip" type="button" data-category-filter="${escapeHtml(filter)}" aria-pressed="${pressed ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

function renderCategoryTree(categories: CategoryRecord[]): string {
  const visibleKinds = ["expense", "income", "transfer"];
  const content = visibleKinds
    .map((kind) => {
      const categoriesForKind = categories.filter((category) => category.kind === kind);
      const rootCategories = categoriesForKind.filter((category) => !category.parentCategoryId);

      if (categoriesForKind.length === 0) return "";

      return `
        <section class="category-kind-group" data-category-kind="${escapeHtml(kind)}" aria-label="${escapeHtml(formatCategoryKind(kind))}">
          <header>
            <div>
              <h3>${escapeHtml(formatCategoryKind(kind))}</h3>
              <p class="sf-muted">${categoriesForKind.length} categorias neste tipo</p>
            </div>
            <span class="kind-badge kind-badge-${escapeHtml(kind)}">${categoriesForKind.length}</span>
          </header>
          <div class="category-tree-nodes">
            ${rootCategories.map((category) => renderCategoryTreeNode(category, categories)).join("") || renderEmptyState("Nenhuma categoria principal.", "Crie uma categoria sem superior para iniciar este grupo.")}
          </div>
        </section>
      `;
    })
    .join("");

  return (
    content ||
    renderEmptyState(
      "Nenhuma categoria cadastrada.",
      "Crie categorias para organizar receitas e despesas.",
    )
  );
}

function renderCategoryTreeNode(category: CategoryRecord, categories: CategoryRecord[]): string {
  const children = categories
    .filter((candidate) => candidate.parentCategoryId === category.id)
    .sort((left, right) => left.name.localeCompare(right.name));
  const displayName = getCategoryDisplayName(category, categories);
  const hasChildren = children.length > 0;
  const childrenId = `category-children-${category.id}`;

  return `
    <article class="category-tree-node ${category.parentCategoryId ? "category-tree-child" : ""}" data-category-item data-category-kind="${escapeHtml(category.kind)}" data-category-status="${escapeHtml(category.status)}" data-category-collapsed="false">
      <div class="category-node-row">
        ${hasChildren ? renderCategoryCollapseButton(category, childrenId) : `<span class="category-collapse-spacer" aria-hidden="true"></span>`}
        <button
          class="category-node-button"
          type="button"
          data-edit-category
          ${renderCategoryDataAttributes(category)}
          aria-label="Editar categoria ${escapeHtml(category.name)}"
        >
          <span class="category-dot category-dot-${escapeHtml(category.kind)}" aria-hidden="true"></span>
          <span class="category-node-text">
            <strong>${escapeHtml(category.name)}</strong>
            <span>${category.parentCategoryId ? "Categoria detalhada" : "Categoria principal"} - ${escapeHtml(formatGenericStatus(category.status))}</span>
          </span>
          <span class="category-path">${escapeHtml(displayName)}</span>
        </button>
        ${renderCategoryActionMenu(category)}
      </div>
      ${hasChildren ? `<div id="${escapeHtml(childrenId)}" class="category-tree-children" data-category-children>${children.map((child) => renderCategoryTreeNode(child, categories)).join("")}</div>` : ""}
    </article>
  `;
}

function renderCategoryDataAttributes(category: CategoryRecord): string {
  return `data-category-id="${escapeHtml(category.id)}" data-category-name="${escapeHtml(category.name)}" data-category-kind-value="${escapeHtml(category.kind)}" data-category-status-value="${escapeHtml(category.status)}" data-category-parent-id="${escapeHtml(category.parentCategoryId ?? "")}"`;
}

function renderCategoryActionMenu(category: CategoryRecord): string {
  const isArchived = category.status === "archived";
  const statusLabel = isArchived ? "Restaurar" : "Arquivar";
  const statusPath = `/api/categories/${category.id}/${isArchived ? "restore" : "archive"}`;
  const statusConfirm = isArchived ? "" : "Arquivar esta categoria? Novos lancamentos nao devem usa-la.";

  return `
    <div class="category-action-menu">
      <button class="category-menu-button icon-button" type="button" data-category-menu-button aria-expanded="false" aria-label="Abrir acoes da categoria ${escapeHtml(category.name)}">...</button>
      <div class="category-menu-popover" data-category-menu role="menu" hidden>
        <button type="button" role="menuitem" data-category-menu-action="edit" ${renderCategoryDataAttributes(category)}>Editar</button>
        <button type="button" role="menuitem" data-category-menu-action="request" data-api-method="POST" data-api-path="${escapeHtml(statusPath)}"${statusConfirm ? ` data-api-confirm="${escapeHtml(statusConfirm)}"` : ""}>${statusLabel}</button>
        <button class="danger-menu-item" type="button" role="menuitem" data-category-menu-action="request" data-api-method="DELETE" data-api-path="/api/categories/${escapeHtml(category.id)}" data-api-confirm="Excluir esta categoria? Ela so sera removida se nao tiver subcategorias, lancamentos ou outros registros vinculados.">Excluir</button>
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
      <span aria-hidden="true">v</span>
    </button>
  `;
}

function renderCategoryKindOptions(selected?: string): string {
  return [
    ["income", "Receita"],
    ["expense", "Despesa"],
    ["transfer", "Transferencia"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
}

function renderCategoryParentOptions(
  categories: CategoryRecord[],
  currentCategory?: CategoryRecord,
): string {
  return categories
    .filter((category) => category.id !== currentCategory?.id)
    .sort((left, right) =>
      getCategoryDisplayName(left, categories).localeCompare(
        getCategoryDisplayName(right, categories),
      ),
    )
    .map((category) => {
      const selected = currentCategory?.parentCategoryId === category.id ? " selected" : "";
      const archived = category.status === "archived" ? " - arquivada" : "";
      return `<option value="${escapeHtml(category.id)}"${selected}>${escapeHtml(formatCategoryKind(category.kind))} - ${escapeHtml(getCategoryDisplayName(category, categories))}${archived}</option>`;
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
  if (kind === "transfer") return "Transferencia";
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

function renderShell(pathname: string, currentLabel: string, content: string): string {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard" aria-label="Ir para o resumo do SolverFin">SolverFin</a>
        <nav aria-label="Menu principal">
          ${renderNavigation(pathname)}
        </nav>
        <button class="logout" type="button" data-logout>Sair</button>
      </aside>
      <div class="main-area">
        <header class="topbar"><div><strong>${escapeHtml(currentLabel)}</strong><span>Usuario Demo SolverFin</span></div><button type="button" data-logout>Sair</button></header>
        <main>${content}</main>
      </div>
    </div>
    <script>
      document.querySelectorAll("[data-logout]").forEach((button) => {
        button.addEventListener("click", async () => {
          await fetch("/api/session", { method: "DELETE" });
          window.location.assign("/login");
        });
      });
    </script>
  `;
}

function renderNavigation(activePathname: string): string {
  return Array.from(privateRoutes.entries())
    .map(
      ([path, label]) =>
        `<a href="${path}" ${path === activePathname ? `aria-current="page"` : ""}>${escapeHtml(label)}</a>`,
    )
    .join("");
}

function apiFormScript(): string {
  return `
    <script>
      function ensureStatus(container) {
        let status = container.querySelector(":scope > [data-form-status]");
        if (!status) {
          status = document.createElement("p");
          status.className = "form-status sf-muted";
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
          status.className = "form-status sf-muted";
          status.textContent = "Salvando...";
          const response = await fetch(form.dataset.apiPath, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload(form)),
          });
          status.className = response.ok ? "form-status success" : "form-status sf-error";
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
        if (kind === "transfer") return "Transferencia";
        return "";
      }

      function filterParentCategoryOptions(kind, selectedParentId) {
        const select = categoryForm?.elements.parentCategoryId;
        if (!select) return;
        const label = categoryKindLabel(kind);
        Array.from(select.options).forEach((option, index) => {
          const visible = index === 0 || option.textContent.startsWith(label + " - ");
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
        closeCategoryMenus();
        lastTrigger = trigger || openButton;
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
        lastTrigger?.focus();
      }

      function resetStatus() {
        const status = formStatus();
        if (!status) return;
        status.className = "form-status sf-muted";
        status.textContent = "";
      }

      function openCreateModal(trigger) {
        if (!categoryForm) return;
        categoryForm.reset();
        categoryForm.dataset.apiPath = "/api/categories";
        delete categoryForm.dataset.apiMethod;
        filterParentCategoryOptions(categoryForm.elements.kind.value);
        modalEyebrow.textContent = "Novo cadastro";
        modalTitle.textContent = "Nova categoria";
        submitButton.textContent = "Criar categoria";
        statusActionButton.hidden = true;
        resetStatus();
        openModal(trigger);
      }

      function openEditModal(button) {
        if (!categoryForm) return;
        categoryForm.reset();
        categoryForm.dataset.apiPath = "/api/categories/" + button.dataset.categoryId;
        categoryForm.dataset.apiMethod = "PATCH";
        categoryForm.elements.name.value = button.dataset.categoryName || "";
        categoryForm.elements.kind.value = button.dataset.categoryKindValue || "expense";
        filterParentCategoryOptions(categoryForm.elements.kind.value, button.dataset.categoryParentId || "");
        modalEyebrow.textContent = "Editar categoria";
        modalTitle.textContent = button.dataset.categoryName || "Categoria";
        submitButton.textContent = "Salvar edicao";
        statusActionButton.hidden = false;
        statusActionButton.textContent = button.dataset.categoryStatusValue === "archived" ? "Restaurar categoria" : "Arquivar categoria";
        statusActionButton.dataset.apiPath = "/api/categories/" + button.dataset.categoryId + (button.dataset.categoryStatusValue === "archived" ? "/restore" : "/archive");
        statusActionButton.dataset.apiConfirm = button.dataset.categoryStatusValue === "archived" ? "" : "Arquivar esta categoria? Novos lancamentos nao devem usa-la.";
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
          status.className = "form-status sf-muted";
          status.textContent = "Enviando...";
        }
        const response = await fetch(path, {
          method: button.dataset.apiMethod || "POST",
          headers: { "content-type": "application/json" },
        });
        if (status) {
          status.className = response.ok ? "form-status success" : "form-status sf-error";
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
        const toggle = item.querySelector(":scope > .category-node-row > [data-toggle-category-children]");
        item.dataset.categoryCollapsed = String(collapsed);
        if (children) children.hidden = collapsed;
        if (toggle) {
          toggle.setAttribute("aria-expanded", String(!collapsed));
          const name = item.querySelector(":scope > .category-node-row [data-edit-category]")?.dataset.categoryName || "categoria";
          toggle.setAttribute("aria-label", (collapsed ? "Mostrar" : "Ocultar") + " subcategorias de " + name);
          const icon = toggle.querySelector("span");
          if (icon) icon.textContent = collapsed ? ">" : "v";
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
          closeCategoryMenus();
          if (modal && !modal.hidden) closeModal();
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
        });
      });

      document.querySelectorAll("[data-category-menu]").forEach((menu) => {
        menu.addEventListener("click", (event) => event.stopPropagation());
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
          status.className = "form-status sf-muted";
          status.textContent = "Enviando...";
        }
        const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" } });
        if (status) {
          status.className = response.ok ? "form-status success" : "form-status sf-error";
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

      function matchesFilter(item, filter) {
        return filter === "all" || item.dataset.categoryKind === filter || item.dataset.categoryStatus === filter;
      }

      function applyFilterToNode(item, filter) {
        const children = Array.from(item.querySelectorAll(":scope > .category-tree-children > [data-category-item]"));
        const childMatches = children.map((child) => applyFilterToNode(child, filter)).some(Boolean);
        const visible = matchesFilter(item, filter) || childMatches;
        item.hidden = !visible;
        if (filter !== "all" && childMatches) setCategoryCollapsed(item, false);
        return visible;
      }

      function applyCategoryFilter(filter) {
        filterButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate.dataset.categoryFilter === filter)));
        groups.forEach((group) => {
          const rootItems = Array.from(group.querySelectorAll(":scope > .category-tree-nodes > [data-category-item]"));
          const hasVisibleItems = filter === "all" || rootItems.map((item) => applyFilterToNode(item, filter)).some(Boolean);
          if (filter === "all") rootItems.forEach((item) => applyFilterToNode(item, filter));
          group.hidden = !hasVisibleItems;
        });
      }

      filterButtons.forEach((button) => {
        button.addEventListener("click", () => applyCategoryFilter(button.dataset.categoryFilter || "all"));
      });
    </script>
  `;
}

function renderPage(input: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>${escapeHtml(input.title)}</title>
    <style>${pageCss()}</style>
  </head>
  <body>${input.body}</body>
</html>`;
}

function pageCss(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; --warning: #b45309; --warning-bg: #fef3c7; }
    * { box-sizing: border-box; } [hidden] { display: none !important; } body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,"Segoe UI",sans-serif; } body.modal-open { overflow: hidden; } h1, h2, h3, p { margin: 0; } h1 { font-size: clamp(1.65rem, 4vw, 2.15rem); line-height: 1.12; } h2 { font-size: 1rem; line-height: 1.3; } h3 { font-size: .95rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 3px solid rgba(34,211,238,.55); outline-offset: 2px; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; } label { color: var(--text); display: grid; font-weight: 700; gap: 8px; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; } .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; min-height: 44px; text-decoration: none; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; } .logout { background: rgba(255,255,255,.12); margin-top: auto; }
    .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span, .sf-muted { color: var(--muted); line-height: 1.5; } main { display: grid; gap: 20px; margin: 0 auto; max-width: 1180px; padding: 24px; width: 100%; }
    .sf-button, button, .secondary-button { align-items: center; border: 0; border-radius: 8px; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; } .sf-button, button { background: var(--primary); color: white; } button:disabled { cursor: not-allowed; opacity: .58; } .sf-button.secondary, .secondary-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); } .danger-action { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); } .icon-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); min-height: 40px; padding: 0; width: 40px; }
    .sf-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; } .sf-panel { display: grid; gap: 16px; min-width: 0; } .sf-eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .sf-error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; } .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; } .form-status { grid-column: 1 / -1; }
    .categories-hero { align-items: end; display: flex; gap: 16px; justify-content: space-between; } .categories-hero > div { display: grid; gap: 6px; max-width: 760px; }
    .categories-workspace { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(16rem, .38fr) minmax(0, 1fr); } .categories-insights { position: sticky; top: 88px; } .section-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .section-heading.compact { align-items: start; } .kind-meters { display: grid; gap: 14px; } .kind-meter { display: grid; gap: 8px; } .kind-meter div:first-child { align-items: center; display: flex; justify-content: space-between; gap: 12px; } .kind-meter span { color: var(--muted); font-size: .86rem; } .meter-track { background: var(--primary-soft); border-radius: 999px; height: 8px; overflow: hidden; } .meter-fill { border-radius: inherit; display: block; height: 100%; } .meter-expense { background: var(--danger); } .meter-income { background: var(--success); } .meter-transfer { background: var(--cyan); } .catalog-note { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 6px; padding: 12px; }
    .category-directory { padding: 0; overflow: hidden; } .category-toolbar { align-items: center; border-bottom: 1px solid var(--line); display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) auto; padding: 18px; } .category-toolbar > div:first-child { display: grid; gap: 4px; min-width: 0; } .category-toolbar-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; } .category-collapse-actions { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; padding: 4px; } .compact-button { background: transparent; border: 0; color: var(--primary); min-height: 32px; padding: 0 10px; } .compact-button:hover, .compact-button:focus-visible { background: var(--surface); box-shadow: inset 0 0 0 1px #d4e6ec; } .filter-chips { background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 3px; justify-content: flex-end; padding: 3px; } .filter-chip { background: transparent; border: 0; border-radius: 6px; color: var(--primary); min-height: 32px; padding: 0 10px; } .filter-chip:hover, .filter-chip:focus-visible { background: rgba(255,255,255,.72); } .filter-chip[aria-pressed="true"] { background: var(--primary); color: white; }
    .category-tree-list { display: grid; gap: 0; } .category-kind-group { border-bottom: 1px solid var(--line); display: grid; gap: 12px; padding: 18px; } .category-kind-group:last-child { border-bottom: 0; } .category-kind-group header { align-items: center; display: flex; gap: 12px; justify-content: space-between; } .category-kind-group header > div { display: grid; gap: 4px; min-width: 0; } .kind-badge, .category-path { background: var(--primary-soft); border-radius: 999px; color: var(--primary); font-size: .78rem; font-weight: 800; max-width: 100%; overflow-wrap: anywhere; padding: 6px 10px; } .kind-badge-expense { background: var(--danger-bg); color: var(--danger); } .kind-badge-income { background: var(--success-bg); color: var(--success); } .kind-badge-transfer { background: #e0f2fe; color: #0369a1; }
    .category-tree-nodes, .category-tree-children { display: grid; gap: 12px; } .category-tree-children { border-left: 2px solid var(--line); margin-left: 34px; padding-left: 16px; } .category-tree-node { background: #fbfdfe; border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 12px; padding: 12px; } .category-tree-child { background: var(--surface); } .category-node-row { align-items: start; display: grid; gap: 10px; grid-template-columns: auto minmax(0, 1fr) auto; } .category-collapse-button, .category-collapse-spacer { align-self: start; min-height: 32px; min-width: 32px; width: 32px; } .category-collapse-button { background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 999px; color: var(--primary); font-weight: 900; padding: 0; } .category-collapse-button:hover, .category-collapse-button:focus-visible { background: var(--primary); color: white; } .category-node-button { align-items: start; background: transparent; border: 0; color: inherit; display: grid; gap: 12px; grid-template-columns: auto minmax(0, 1fr) auto; justify-content: stretch; min-height: auto; padding: 0; text-align: left; width: 100%; } .category-node-button:hover + .category-action-menu .category-menu-button, .category-node-button:focus-visible + .category-action-menu .category-menu-button { background: var(--primary); color: white; } .category-node-text { display: grid; gap: 4px; min-width: 0; } .category-node-text strong { overflow-wrap: anywhere; } .category-node-text span { color: var(--muted); font-weight: 500; line-height: 1.45; } .category-action-menu { align-self: start; position: relative; } .category-menu-button { font-weight: 900; min-height: 32px; width: 32px; } .category-menu-button:hover, .category-menu-button[aria-expanded="true"] { background: var(--primary); color: white; } .category-menu-popover { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 18px 40px rgba(15,23,42,.18); display: grid; gap: 4px; min-width: 160px; padding: 6px; position: absolute; right: 0; top: calc(100% + 6px); z-index: 8; } .category-menu-popover button { background: transparent; color: var(--text); justify-content: flex-start; min-height: 36px; padding: 0 10px; width: 100%; } .category-menu-popover button:hover, .category-menu-popover button:focus-visible { background: var(--primary-soft); color: var(--primary); } .category-menu-popover .danger-menu-item { color: var(--danger); } .category-menu-popover .danger-menu-item:hover, .category-menu-popover .danger-menu-item:focus-visible { background: var(--danger-bg); color: var(--danger); } .category-dot { border-radius: 999px; height: 10px; margin-top: 7px; width: 10px; } .category-dot-expense { background: var(--danger); } .category-dot-income { background: var(--success); } .category-dot-transfer { background: var(--cyan); }
    .category-form { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); } .category-form .form-status, .full-span { grid-column: 1 / -1; } .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    .category-modal { inset: 0; position: fixed; z-index: 20; } .category-modal-backdrop { background: rgba(6,25,35,.48); inset: 0; position: absolute; } .category-dialog { background: var(--surface); border-radius: 8px; box-shadow: 0 24px 80px rgba(15,23,42,.24); display: grid; gap: 16px; left: 50%; max-height: calc(100svh - 32px); max-width: 560px; overflow: auto; padding: 18px; position: absolute; top: 50%; transform: translate(-50%, -50%); width: min(calc(100vw - 32px), 560px); } .category-dialog-header { align-items: start; display: flex; gap: 12px; justify-content: space-between; } .category-dialog-header > div { display: grid; gap: 4px; } .dialog-actions { display: flex; flex-wrap: wrap; gap: 10px; grid-column: 1 / -1; justify-content: flex-end; }
    @media (max-width: 1024px) { .categories-workspace { grid-template-columns: 1fr; } .categories-insights { position: static; } }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } .categories-hero, .category-toolbar, .category-kind-group header, .section-heading, .category-node-button { align-items: stretch; display: grid; } .category-toolbar { grid-template-columns: 1fr; } .category-toolbar-actions, .category-collapse-actions, .filter-chips { justify-content: flex-start; justify-items: start; } .category-node-button { grid-template-columns: auto minmax(0, 1fr); } .category-path { grid-column: 2 / -1; justify-self: start; } .category-action-menu { grid-column: 3; grid-row: 1; } .categories-hero .sf-button { width: 100%; } .filter-chips { justify-content: flex-start; } .category-form { grid-template-columns: 1fr; } .dialog-actions { display: grid; } }
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
