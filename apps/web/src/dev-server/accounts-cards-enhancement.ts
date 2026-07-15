import { keepCardInstrumentsInsideEditDialog } from "./accounts-cards-page-dialog-only.js";

export function enhanceAccountsCardsTabs(html: string): string {
  if (!html.includes('data-tab-panel="accounts"')) return html;

  let enhanced = keepCardInstrumentsInsideEditDialog(injectActiveFilter(html));
  enhanced = injectNeutralStyles(enhanced);
  enhanced = injectAccountRemunerationStyles(enhanced);

  if (!enhanced.includes("data-accounts-cards-direct-enhancement")) {
    enhanced = enhanced.replace("</body>", `${accountsCardsDirectEnhancementScript()}</body>`);
  }

  return enhanced;
}

function injectActiveFilter(html: string): string {
  if (html.includes("active-filter-switch")) return html;

  const activeFilterToggleHtml = `          <label class="active-filter-switch" data-active-filter aria-pressed="false">
             <input type="checkbox" class="active-filter-input" data-active-filter-input />
             <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
             <span>Exibir apenas ativos</span>
           </label>`;
  const htmlWithoutStatusFilter = html.replace(
    /\s*<label>Status\s*<select data-master-status>[\s\S]*?<\/select>\s*<\/label>/,
    "",
  );

  return htmlWithoutStatusFilter.replace(
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>`,
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>
  ${activeFilterToggleHtml}`,
  );
}

function injectNeutralStyles(html: string): string {
  if (html.includes("data-accounts-cards-neutral-styles")) return html;

  const styles = `
      <style data-accounts-cards-neutral-styles>
        .tab-list { background: #f8fafc; border-color: #e2e8f0; }
        button.tab-button { background: transparent; border: 1px solid transparent; color: #475569; }
        button.tab-button span { background: #f1f5f9; color: #64748b; }
        button.tab-button:hover:not(:disabled), button.tab-button:focus-visible { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }
        button.tab-button[aria-selected="true"] { background: #ffffff; border-color: #cbd5e1; color: #0f172a; box-shadow: 0 1px 2px rgba(15, 23, 42, .05); }
        button.tab-button[aria-selected="true"]:hover:not(:disabled), button.tab-button[aria-selected="true"]:focus-visible { background: #ffffff; border-color: #94a3b8; color: #0f172a; }
        button.tab-button[aria-selected="true"] span { background: #e2e8f0; color: #334155; }
        button.icon-button[data-open-dialog^="edit-account-dialog-"] { background: #ffffff; border-color: #e2e8f0; color: #64748b; }
        button.icon-button[data-open-dialog^="edit-account-dialog-"]:hover:not(:disabled), button.icon-button[data-open-dialog^="edit-account-dialog-"]:focus-visible { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
        .active-filter-switch { align-items: center; align-self: stretch; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #475569; cursor: pointer; display: inline-flex; font: inherit; font-size: 0.8125rem; font-weight: 600; gap: 8px; justify-content: center; line-height: 1.15; min-height: 34px; padding: 0 10px; text-align: left; user-select: none; width: fit-content; }
        .active-filter-switch:hover, .active-filter-switch:focus-within { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
        .active-filter-switch[aria-pressed="true"] { background: #ffffff; border-color: #cbd5e1; color: #334155; }
        .active-filter-input { border: 0; height: 1px; margin: 0; opacity: 0; padding: 0; position: absolute; width: 1px; }
        .active-filter-switch .toggle-track { align-items: center; background: #cbd5e1; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 20px; padding: 2px; width: 38px; }
        .active-filter-switch .toggle-thumb { background: #fff; border-radius: 999px; box-shadow: 0 1px 3px rgba(15, 23, 42, .18); display: block; height: 16px; transform: translateX(0); transition: transform .18s ease; width: 16px; }
        .active-filter-switch[aria-pressed="true"] .toggle-track { background: #94a3b8; }
        .active-filter-switch[aria-pressed="true"] .toggle-thumb { transform: translateX(18px); }
        @media (max-width: 760px) { .active-filter-switch { width: 100%; } }
      </style>`;

  return html.replace("</head>", `${styles}</head>`);
}

function injectAccountRemunerationStyles(html: string): string {
  if (html.includes("data-account-remuneration-modal-styles")) return html;

  const styles = `
      <style data-account-remuneration-modal-styles>
        .account-remuneration-summary { align-items: center; color: var(--muted); display: flex; flex-wrap: wrap; font-size: .75rem; gap: 6px; margin-top: 6px; }
        .account-remuneration-badge { background: #dcfce7; border: 1px solid #86efac; border-radius: 999px; color: #166534; display: inline-flex; font-size: .6875rem; font-weight: 800; line-height: 1; padding: 4px 7px; text-transform: uppercase; }
        .account-remuneration-eligibility { color: var(--muted); font-size: .75rem; line-height: 1.4; margin: 6px 0 0; }
        .cdi-action-button { background: #fff; border: 1px solid #cbd5e1; color: #334155; font-size: .75rem; min-height: 32px; padding: 6px 9px; white-space: nowrap; }
        .cdi-action-button:hover:not(:disabled), .cdi-action-button:focus-visible { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }
        .cdi-action-button:disabled { cursor: not-allowed; opacity: .58; }
        .account-remuneration-load-error { align-items: center; background: var(--warning-bg); border: 1px solid #fde68a; border-radius: var(--radius); color: var(--warning); display: flex; flex-wrap: wrap; font-size: .8125rem; gap: 10px; justify-content: space-between; line-height: 1.45; margin: 0 0 14px; padding: 10px 12px; }
        .account-remuneration-load-error button { flex: 0 0 auto; }
        .account-remuneration-dialog .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .account-remuneration-dialog .remuneration-help { color: var(--muted); font-size: .8125rem; grid-column: 1 / -1; line-height: 1.5; margin: 0; }
        .account-remuneration-dialog .dialog-actions { display: flex; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; }
        .account-remuneration-dialog .dialog-actions button { width: auto; }
        .account-remuneration-dialog .form-status { grid-column: 1 / -1; margin: 0; }
        @media (max-width: 760px) {
          .cdi-action-button { width: 100%; }
          .account-remuneration-dialog .edit-grid { grid-template-columns: 1fr; }
          .account-remuneration-dialog .remuneration-help, .account-remuneration-dialog .dialog-actions, .account-remuneration-dialog .form-status { grid-column: auto; }
          .account-remuneration-dialog .dialog-actions { flex-direction: column-reverse; }
          .account-remuneration-dialog .dialog-actions button { width: 100%; }
        }
      </style>`;

  return html.replace("</head>", `${styles}</head>`);
}

function accountsCardsDirectEnhancementScript(): string {
  return `
      <script data-accounts-cards-direct-enhancement>
        (() => {
          if (window.__solverFinAccountsCardsDirect === true) return;
          window.__solverFinAccountsCardsDirect = true;

          const activeFilterStorageKey = "solverfin.accountsCards.activeOnly";
          const remunerationEndpoint = "/api/account-remuneration/configurations";
          let accountModels = [];
          let categories = [];
          let configurationsByAccount = new Map();

          function wireActiveFilter() {
            const button = document.querySelector("[data-active-filter]");
            const input = button ? button.querySelector("[data-active-filter-input]") : null;
            if (!button || !input) return;
            let activeOnly = false;
            try { activeOnly = window.localStorage.getItem(activeFilterStorageKey) === "true"; } catch (_error) { activeOnly = false; }
            input.checked = activeOnly;
            button.setAttribute("aria-pressed", String(activeOnly));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.addEventListener("change", () => {
              button.setAttribute("aria-pressed", String(input.checked === true));
              try { window.localStorage.setItem(activeFilterStorageKey, String(input.checked === true)); } catch (_error) {}
            });
          }

          function escapeHtml(value) {
            return String(value ?? "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          }

          function formatPercentage(value) {
            return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(Number(value));
          }

          function formatDate(value) {
            const parts = String(value || "").split("-");
            return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(value || "");
          }

          function today() {
            const now = new Date();
            const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            return local.toISOString().slice(0, 10);
          }

          function accountIdFromForm(form) {
            const match = /^\\/api\\/accounts\\/([^/]+)$/.exec(String(form && form.dataset.apiPath || ""));
            return match ? decodeURIComponent(match[1]) : undefined;
          }

          function collectAccountModels() {
            const panel = document.querySelector('[data-tab-panel="accounts"]');
            if (!panel) return [];
            return Array.from(panel.querySelectorAll("[data-master-item]")).flatMap((article) => {
              const form = article.querySelector('form.edit-grid[data-api-path^="/api/accounts/"]');
              const accountId = accountIdFromForm(form);
              const actions = article.querySelector(".item-actions");
              const main = article.querySelector(".item-main");
              if (!form || !accountId || !actions || !main) return [];

              let action = article.querySelector("[data-account-remuneration-action]");
              if (!action) {
                action = document.createElement("button");
                action.type = "button";
                action.className = "cdi-action-button";
                action.setAttribute("data-account-remuneration-action", "");
                action.disabled = true;
                action.textContent = "Carregando CDI...";
                const editAction = actions.querySelector('[data-open-dialog^="edit-account-dialog-"]');
                if (editAction && editAction.nextSibling) actions.insertBefore(action, editAction.nextSibling);
                else actions.appendChild(action);
              }

              const title = article.querySelector(".item-title-row strong");
              const currencyField = form.elements && form.elements.currency;
              return [{
                accountId,
                article,
                form,
                main,
                action,
                name: title ? String(title.textContent || "Conta") : "Conta",
                currency: currencyField ? String(currencyField.value || "BRL").toUpperCase() : "BRL",
                status: String(article.dataset.status || "active")
              }];
            });
          }

          function clearPresentation(model) {
            model.article.querySelectorAll("[data-account-remuneration-summary], [data-account-remuneration-eligibility], [data-account-remuneration-dialog]").forEach((node) => node.remove());
            model.action.onclick = null;
            model.action.removeAttribute("title");
          }

          function appendEligibility(model, message) {
            const note = document.createElement("p");
            note.className = "account-remuneration-eligibility";
            note.setAttribute("data-account-remuneration-eligibility", "");
            note.textContent = message;
            model.main.appendChild(note);
          }

          function appendSummary(model, configuration) {
            const summary = document.createElement("div");
            summary.className = "account-remuneration-summary";
            summary.setAttribute("data-account-remuneration-summary", "");
            summary.innerHTML =
              '<span class="account-remuneration-badge">CDI ativo</span>' +
              '<span>' + escapeHtml(formatPercentage(configuration.remunerationPercent)) + '% do CDI</span>' +
              '<span aria-hidden="true">·</span>' +
              '<span>desde ' + escapeHtml(formatDate(configuration.startsOn)) + '</span>';
            model.main.appendChild(summary);
          }

          function renderCategoryOptions(selected) {
            return categories.map((category) =>
              '<option value="' + escapeHtml(category.id) + '"' + (category.id === selected ? ' selected' : '') + '>' + escapeHtml(category.name) + '</option>'
            ).join("");
          }

          function createDialog(model, configuration) {
            const enabled = configuration && configuration.enabled === true;
            const percentage = configuration && configuration.remunerationPercent !== undefined ? configuration.remunerationPercent : 100;
            const startsOn = configuration && configuration.startsOn ? configuration.startsOn : today();
            const categoryId = configuration && configuration.categoryId ? configuration.categoryId : "";
            const dialogId = "account-remuneration-dialog-" + model.accountId;
            const titleId = dialogId + "-title";
            const dialog = document.createElement("dialog");
            dialog.id = dialogId;
            dialog.className = "master-dialog account-remuneration-dialog";
            dialog.setAttribute("aria-labelledby", titleId);
            dialog.setAttribute("data-account-remuneration-dialog", "");
            dialog.innerHTML =
              '<div class="dialog-heading"><p class="eyebrow">Remuneração pelo CDI</p><h2 id="' + escapeHtml(titleId) + '">' + escapeHtml(model.name) + '</h2></div>' +
              '<form class="edit-grid" data-account-remuneration-form>' +
                '<label>Situação<select name="enabled"><option value="false"' + (enabled ? '' : ' selected') + '>Desativada</option><option value="true"' + (enabled ? ' selected' : '') + '>Ativa</option></select></label>' +
                '<label>Percentual de remuneração sobre o CDI<input name="remunerationPercent" type="number" min="0.0001" max="1000" step="0.0001" value="' + escapeHtml(percentage) + '" required /></label>' +
                '<label>Data inicial do cálculo<input name="startsOn" type="date" value="' + escapeHtml(startsOn) + '" required /></label>' +
                '<label>Categoria padrão de receita<select name="categoryId"><option value="">Sem categoria padrão</option>' + renderCategoryOptions(categoryId) + '</select></label>' +
                '<p class="remuneration-help">O cálculo usa o saldo final do dia anterior.</p>' +
                '<p class="form-status muted" data-account-remuneration-status aria-live="polite"></p>' +
                '<div class="dialog-actions"><button type="button" class="secondary-button" data-account-remuneration-cancel>Cancelar</button><button type="submit">Salvar CDI</button></div>' +
              '</form>';

            const form = dialog.querySelector("[data-account-remuneration-form]");
            const cancel = dialog.querySelector("[data-account-remuneration-cancel]");
            if (cancel) cancel.addEventListener("click", () => dialog.close());
            dialog.addEventListener("close", () => model.action.focus());
            form.addEventListener("submit", (event) => { void saveConfiguration(event, model, dialog, form); });
            model.article.appendChild(dialog);
            return dialog;
          }

          function openDialog(model, dialog) {
            if (typeof dialog.showModal === "function") {
              if (!dialog.open) dialog.showModal();
            } else {
              dialog.setAttribute("open", "");
            }
            const firstField = dialog.querySelector("select, input, button");
            if (firstField && typeof firstField.focus === "function") firstField.focus();
          }

          function renderAccount(model) {
            clearPresentation(model);
            if (model.status !== "active") {
              model.action.textContent = "CDI indisponível";
              model.action.disabled = true;
              model.action.title = "Contas arquivadas não podem configurar remuneração pelo CDI.";
              return;
            }
            if (model.currency !== "BRL") {
              model.action.textContent = "CDI indisponível";
              model.action.disabled = true;
              model.action.title = "Disponível somente para contas em BRL";
              appendEligibility(model, "Disponível somente para contas em BRL");
              return;
            }

            const configuration = configurationsByAccount.get(model.accountId);
            if (configuration && configuration.enabled === true) appendSummary(model, configuration);
            model.action.textContent = configuration && configuration.enabled === true ? "Configurar CDI" : "Ativar CDI";
            model.action.disabled = false;
            const dialog = createDialog(model, configuration);
            model.action.onclick = () => openDialog(model, dialog);
          }

          function setLoadingState() {
            accountModels.forEach((model) => {
              clearPresentation(model);
              if (model.status !== "active") {
                model.action.textContent = "CDI indisponível";
                model.action.title = "Contas arquivadas não podem configurar remuneração pelo CDI.";
              } else if (model.currency !== "BRL") {
                model.action.textContent = "CDI indisponível";
                model.action.title = "Disponível somente para contas em BRL";
                appendEligibility(model, "Disponível somente para contas em BRL");
              } else {
                model.action.textContent = "Carregando CDI...";
              }
              model.action.disabled = true;
            });
          }

          function removeLoadError() {
            const panel = document.querySelector('[data-tab-panel="accounts"]');
            const warning = panel && panel.querySelector("[data-account-remuneration-load-error]");
            if (warning) warning.remove();
          }

          function showLoadError(message) {
            const panel = document.querySelector('[data-tab-panel="accounts"]');
            if (!panel) return;
            removeLoadError();
            const warning = document.createElement("div");
            warning.className = "account-remuneration-load-error";
            warning.setAttribute("data-account-remuneration-load-error", "");
            warning.setAttribute("role", "alert");
            warning.innerHTML = '<span>' + escapeHtml(message) + '</span><button type="button" class="secondary-button" data-account-remuneration-retry>Tentar novamente</button>';
            const list = panel.querySelector("[data-master-list]");
            if (list) panel.insertBefore(warning, list);
            else panel.appendChild(warning);
            const retry = warning.querySelector("[data-account-remuneration-retry]");
            if (retry) retry.addEventListener("click", () => { void loadAccountRemuneration(); });
            accountModels.forEach((model) => {
              if (model.status === "active" && model.currency === "BRL") {
                model.action.textContent = "CDI indisponível";
                model.action.title = "Não foi possível carregar a configuração do CDI.";
                model.action.disabled = true;
              }
            });
          }

          async function readResponse(response) {
            const body = await response.json().catch(() => ({}));
            const message = body && body.error && body.error.message ? body.error.message : "Não foi possível concluir a operação.";
            return { body, message };
          }

          function readRemunerationPayload(form) {
            const percentage = Number(form.elements.remunerationPercent.value);
            const startsOn = String(form.elements.startsOn.value || "");
            const categoryId = String(form.elements.categoryId.value || "");
            const payload = {
              enabled: form.elements.enabled.value === "true",
              remunerationPercent: percentage,
              startsOn
            };
            if (categoryId) payload.categoryId = categoryId;
            return payload;
          }

          async function saveConfiguration(event, model, dialog, form) {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const submit = form.querySelector('button[type="submit"]');
            const status = form.querySelector("[data-account-remuneration-status]");
            if (submit) submit.disabled = true;
            status.className = "form-status muted";
            status.textContent = "Salvando configuração do CDI...";

            let response;
            try {
              response = await fetch(remunerationEndpoint + "/" + encodeURIComponent(model.accountId), {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(readRemunerationPayload(form))
              });
            } catch (_error) {
              status.className = "form-status error";
              status.textContent = "Não foi possível salvar a configuração do CDI.";
              if (submit) submit.disabled = false;
              return;
            }

            const result = await readResponse(response);
            if (!response.ok) {
              status.className = "form-status error";
              status.textContent = result.message;
              if (submit) submit.disabled = false;
              return;
            }

            if (result.body && result.body.configuration) {
              configurationsByAccount.set(model.accountId, result.body.configuration);
            }
            status.className = "form-status success";
            status.textContent = "Configuração do CDI salva.";
            dialog.close();
            renderAccount(model);
          }

          async function loadAccountRemuneration() {
            setLoadingState();
            removeLoadError();
            let configurationResponse;
            let categoryResponse;
            try {
              [configurationResponse, categoryResponse] = await Promise.all([
                fetch(remunerationEndpoint),
                fetch("/api/categories?status=all")
              ]);
            } catch (_error) {
              showLoadError("Não foi possível carregar a remuneração pelo CDI. Contas e cartões continuam disponíveis.");
              return;
            }

            if (!configurationResponse.ok || !categoryResponse.ok) {
              showLoadError("Não foi possível carregar a remuneração pelo CDI. Contas e cartões continuam disponíveis.");
              return;
            }

            const configurationResult = await readResponse(configurationResponse);
            const categoryResult = await readResponse(categoryResponse);
            const loadedConfigurations = configurationResult.body && configurationResult.body.configurations;
            const loadedCategories = categoryResult.body && categoryResult.body.categories;
            if (!Array.isArray(loadedConfigurations) || !Array.isArray(loadedCategories)) {
              showLoadError("A configuração do CDI retornou dados inválidos. Contas e cartões continuam disponíveis.");
              return;
            }

            configurationsByAccount = new Map(loadedConfigurations.map((configuration) => [configuration.accountId, configuration]));
            categories = loadedCategories.filter((category) => category.status === "active" && category.kind === "income");
            accountModels.forEach(renderAccount);
          }

          async function boot() {
            wireActiveFilter();
            accountModels = collectAccountModels();
            if (accountModels.length === 0) return;
            await loadAccountRemuneration();
          }

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => { void boot(); });
          } else {
            void boot();
          }
        })();
      </script>`;
}
