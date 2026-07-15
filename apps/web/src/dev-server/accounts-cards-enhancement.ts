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
  if (html.includes("data-account-remuneration-account-form-styles")) return html;

  const styles = `
      <style data-account-remuneration-account-form-styles>
        .account-remuneration-fieldset { border: 1px solid var(--line); border-radius: var(--radius); display: grid; gap: 10px; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 4px 0; padding: 12px; }
        .account-remuneration-fieldset legend { font-size: .8125rem; font-weight: 800; padding: 0 6px; }
        .account-remuneration-fieldset .remuneration-help { color: var(--muted); font-size: .75rem; grid-column: 1 / -1; line-height: 1.45; margin: 0; }
        .account-remuneration-fieldset select:disabled, .account-remuneration-fieldset input:disabled { cursor: not-allowed; opacity: .65; }
        .account-remuneration-load-error { background: var(--warning-bg); border: 1px solid #fde68a; border-radius: var(--radius); color: var(--warning); font-size: .8125rem; grid-column: 1 / -1; line-height: 1.45; margin: 0; padding: 10px; }
        @media (max-width: 680px) { .account-remuneration-fieldset { grid-template-columns: 1fr; } .account-remuneration-fieldset .remuneration-help, .account-remuneration-load-error { grid-column: auto; } }
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

          function accountIdFromForm(form) {
            const match = /^\\/api\\/accounts\\/([^/]+)$/.exec(String(form.dataset.apiPath || ""));
            return match ? decodeURIComponent(match[1]) : undefined;
          }

          function renderCategoryOptions(categories, selected) {
            return categories.map((category) =>
              '<option value="' + escapeHtml(category.id) + '"' + (category.id === selected ? ' selected' : '') + '>' + escapeHtml(category.name) + '</option>'
            ).join("");
          }

          function appendRemunerationFields(form, configuration, categories) {
            if (form.querySelector("[data-account-remuneration-fields]")) return;
            const enabled = configuration && configuration.enabled === true;
            const percentage = configuration && configuration.remunerationPercent !== undefined ? configuration.remunerationPercent : 100;
            const startsOn = configuration && configuration.startsOn ? configuration.startsOn : new Date().toISOString().slice(0, 10);
            const categoryId = configuration && configuration.categoryId ? configuration.categoryId : "";
            const fieldset = document.createElement("fieldset");
            fieldset.className = "account-remuneration-fieldset";
            fieldset.setAttribute("data-account-remuneration-fields", "");
            fieldset.innerHTML =
              '<legend>Remuneração da conta</legend>' +
              '<label>Situação<select name="remunerationEnabled"><option value="false"' + (enabled ? '' : ' selected') + '>Desativada</option><option value="true"' + (enabled ? ' selected' : '') + '>Ativa</option></select></label>' +
              '<label>Indexador<select name="remunerationIndexKind"><option value="cdi">CDI</option></select></label>' +
              '<label>Percentual de remuneração sobre o CDI<input name="remunerationPercent" type="number" min="0.0001" max="1000" step="0.0001" value="' + escapeHtml(percentage) + '" /></label>' +
              '<label>Data inicial<input name="remunerationStartsOn" type="date" value="' + escapeHtml(startsOn) + '" /></label>' +
              '<label>Categoria de receita<select name="remunerationCategoryId"><option value="">Sem categoria padrão</option>' + renderCategoryOptions(categories, categoryId) + '</select></label>' +
              '<p class="remuneration-help">O cálculo usa o saldo final da competência e a taxa diária oficial do CDI. Contas fora de BRL permanecem não elegíveis.</p>';
            const submit = form.querySelector('button[type="submit"]');
            if (submit) form.insertBefore(fieldset, submit);
            else form.appendChild(fieldset);
            form.dataset.remunerationConfigurationLoaded = "true";
            wireRemunerationAvailability(form);
          }

          function appendRemunerationLoadError(form, message) {
            if (form.querySelector("[data-account-remuneration-load-error]")) return;
            const warning = document.createElement("p");
            warning.className = "account-remuneration-load-error";
            warning.setAttribute("data-account-remuneration-load-error", "");
            warning.setAttribute("role", "alert");
            warning.textContent = message;
            const submit = form.querySelector('button[type="submit"]');
            if (submit) form.insertBefore(warning, submit);
            else form.appendChild(warning);
          }

          function wireRemunerationAvailability(form) {
            const enabled = form.elements.remunerationEnabled;
            const percentage = form.elements.remunerationPercent;
            const startsOn = form.elements.remunerationStartsOn;
            const category = form.elements.remunerationCategoryId;
            const currency = form.elements.currency;
            if (!enabled || !percentage || !startsOn) return;

            const sync = () => {
              const supportsCdi = !currency || currency.value === "BRL";
              if (!supportsCdi) enabled.value = "false";
              enabled.disabled = !supportsCdi;
              const active = supportsCdi && enabled.value === "true";
              percentage.disabled = !active;
              startsOn.disabled = !active;
              if (category) category.disabled = !active;
              percentage.required = active;
              startsOn.required = active;
            };
            enabled.addEventListener("change", sync);
            if (currency) currency.addEventListener("change", sync);
            sync();
          }

          function readAccountPayload(form) {
            const payload = {};
            new FormData(form).forEach((value, key) => {
              if (key.startsWith("remuneration") || value === "") return;
              const field = form.querySelector('[name="' + key + '"]');
              if (field && field.dataset.money !== undefined) {
                payload[key] = Math.round(parseFloat(String(value).replace(/\\./g, "").replace(",", ".")) * 100);
              } else if (field && field.type === "number") {
                payload[key] = Number(value);
              } else {
                payload[key] = value;
              }
            });
            return payload;
          }

          function readRemunerationPayload(form) {
            const enabled = form.elements.remunerationEnabled && form.elements.remunerationEnabled.value === "true";
            const payload = { enabled };
            const percentage = Number(form.elements.remunerationPercent && form.elements.remunerationPercent.value);
            if (Number.isFinite(percentage) && percentage > 0) payload.remunerationPercent = percentage;
            const startsOn = String(form.elements.remunerationStartsOn && form.elements.remunerationStartsOn.value || "");
            if (startsOn) payload.startsOn = startsOn;
            const categoryId = String(form.elements.remunerationCategoryId && form.elements.remunerationCategoryId.value || "");
            if (categoryId) payload.categoryId = categoryId;
            return payload;
          }

          function statusFor(form) {
            let status = form.querySelector(":scope > [data-form-status]");
            if (!status) {
              status = document.createElement("p");
              status.className = "form-status muted";
              status.setAttribute("data-form-status", "");
              status.setAttribute("aria-live", "polite");
              form.appendChild(status);
            }
            return status;
          }

          async function readError(response) {
            const body = await response.json().catch(() => ({}));
            return { body, message: body && body.error && body.error.message ? body.error.message : "Não foi possível concluir a operação." };
          }

          function wireCombinedAccountSubmit(form) {
            if (form.dataset.accountRemunerationSubmit === "true") return;
            form.dataset.accountRemunerationSubmit = "true";
            form.addEventListener("submit", async (event) => {
              if (form.dataset.remunerationConfigurationLoaded !== "true") return;
              event.preventDefault();
              event.stopImmediatePropagation();
              if (!form.reportValidity()) return;

              const status = statusFor(form);
              const submit = form.querySelector('button[type="submit"]');
              if (submit) submit.disabled = true;
              status.className = "form-status muted";
              status.textContent = "Salvando conta e remuneração...";

              const method = form.dataset.apiMethod || "POST";
              const accountResponse = await fetch(form.dataset.apiPath, {
                method,
                headers: { "content-type": "application/json" },
                body: JSON.stringify(readAccountPayload(form))
              });
              const accountResult = await readError(accountResponse);
              if (!accountResponse.ok) {
                status.className = "form-status error";
                status.textContent = accountResult.message;
                if (submit) submit.disabled = false;
                return;
              }

              const accountId = accountIdFromForm(form) || (accountResult.body.account && accountResult.body.account.id);
              if (!accountId) {
                status.className = "form-status error";
                status.textContent = "A conta foi salva, mas não foi possível identificar o cadastro para configurar a remuneração.";
                if (submit) submit.disabled = false;
                return;
              }

              const configurationResponse = await fetch("/api/account-remuneration/configurations/" + encodeURIComponent(accountId), {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(readRemunerationPayload(form))
              });
              const configurationResult = await readError(configurationResponse);
              if (!configurationResponse.ok) {
                status.className = "form-status error";
                status.textContent = "A conta foi salva, mas a remuneração não: " + configurationResult.message;
                if (submit) submit.disabled = false;
                return;
              }

              status.className = "form-status success";
              status.textContent = "Conta e remuneração salvas. Atualizando a tela...";
              window.setTimeout(() => window.location.reload(), 450);
            }, true);
          }

          async function wireAccountRemunerationForms() {
            const forms = Array.from(document.querySelectorAll('form.edit-grid[data-api-path="/api/accounts"], form.edit-grid[data-api-path^="/api/accounts/"]'))
              .filter((form) => /^\\/api\\/accounts(?:\\/[^/]+)?$/.test(String(form.dataset.apiPath || "")));
            if (forms.length === 0) return;

            let configurationResponse;
            let categoryResponse;
            try {
              [configurationResponse, categoryResponse] = await Promise.all([
                fetch("/api/account-remuneration/configurations"),
                fetch("/api/categories?status=all")
              ]);
            } catch (_error) {
              forms.forEach((form) => appendRemunerationLoadError(
                form,
                "Não foi possível carregar a remuneração pelo CDI. A conta pode ser salva sem alterar a configuração de remuneração existente."
              ));
              return;
            }

            if (!configurationResponse.ok || !categoryResponse.ok) {
              forms.forEach((form) => appendRemunerationLoadError(
                form,
                "Não foi possível carregar a remuneração pelo CDI. A conta pode ser salva sem alterar a configuração de remuneração existente."
              ));
              return;
            }

            const configurationBody = await configurationResponse.json().catch(() => undefined);
            const categoryBody = await categoryResponse.json().catch(() => undefined);
            if (!configurationBody || !Array.isArray(configurationBody.configurations) || !categoryBody || !Array.isArray(categoryBody.categories)) {
              forms.forEach((form) => appendRemunerationLoadError(
                form,
                "A configuração de remuneração retornou dados inválidos. A conta pode ser salva sem alterar o CDI."
              ));
              return;
            }

            const configurations = configurationBody.configurations;
            const categories = categoryBody.categories.filter((category) => category.status === "active" && category.kind === "income");
            const byAccount = new Map(configurations.map((configuration) => [configuration.accountId, configuration]));
            forms.forEach((form) => {
              const accountId = accountIdFromForm(form);
              appendRemunerationFields(form, accountId ? byAccount.get(accountId) : undefined, categories);
              wireCombinedAccountSubmit(form);
            });
          }

          async function boot() {
            wireActiveFilter();
            await wireAccountRemunerationForms();
          }

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => { void boot(); });
          } else {
            void boot();
          }
        })();
      </script>`;
}
