export function apiFormScript(): string {
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

      // All category mutations use one resilient request path (form, item menu and modal).
      async function sendCategoryMutation({ path, method = "POST", payload, status, button }) {
        if (!path || button?.disabled) return false;
        if (button) button.disabled = true;
        if (status) {
          status.className = "form-status muted";
          status.textContent = method === "PATCH" ? "Salvando..." : "Enviando...";
        }
        let successful = false;
        try {
          const response = await fetch(path, {
            method,
            headers: { "content-type": "application/json" },
            ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          });
          if (status) {
            status.className = response.ok ? "form-status success" : "form-status error";
            status.textContent = await readApiMessage(response);
          }
          successful = response.ok;
          if (successful) window.setTimeout(() => window.location.reload(), 450);
          return successful;
        } catch {
          if (status) {
            status.className = "form-status error";
            status.textContent = "Falha de conexão. Tente novamente.";
          }
          return false;
        } finally {
          if (!successful && button) button.disabled = false;
        }
      }

      document.querySelectorAll("[data-api-form]").forEach((form) => {
        const status = ensureStatus(form);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          await sendCategoryMutation({
            path: form.dataset.apiPath,
            method: form.dataset.apiMethod || "POST",
            payload: buildPayload(form),
            status,
            button: form.querySelector('button[type="submit"]'),
          });
        });
      });
    </script>
  `;
}

export function pageCss(): string {
  return `
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
    .categories-page button.category-node-button { white-space: normal; }
    .categories-page li.category-tree-node[data-category-editing="true"] > .category-node-row button.category-node-button { border-color: var(--cyan); background: var(--primary-soft); }
    .categories-page .category-node-icon { flex: 0 0 16px; color: var(--muted); }
    .categories-page .category-tree-child .category-node-icon { color: var(--primary); }
    .categories-page .category-node-text { display: block; flex: 1 1 0%; min-width: 0; }
    .categories-page .category-node-text strong { display: block; min-width: 0; font-size: .84375rem; line-height: 1.3; font-weight: 650; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
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
      .sidebar { min-width: 0; max-width: 100%; width: 100%; overflow-x: hidden; }
      .sidebar > nav { flex: 1 1 0%; min-width: 0; max-width: 100%; overflow-x: auto; }
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
      .categories-page ul.category-tree-children { margin-left: 3px; padding-left: 3px; }
      .categories-page .category-name-cell { padding-inline-start: calc(var(--category-level, 0) * 6px); }
      .categories-page .category-collapse-spacer { flex-basis: 20px; width: 20px; }
      .categories-page button.category-node-button { gap: 5px; padding-inline: 4px; }
      .categories-page .category-secondary-cells { padding-inline-start: calc(28px + var(--category-level, 0) * 6px); }
      .categories-page .category-menu-popover { max-width: min(220px, calc(100vw - 20px)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .categories-page button.category-collapse-button svg { transition: none; }
    }
  `;
}
