import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
import { handleApiRequest } from "./dev-server/api.js";
import { renderCardsPage } from "./dev-server/cards-page.js";
import { sendHtml, sendJson } from "./dev-server/http.js";
import { renderInboxPage } from "./dev-server/inbox-page.js";
import { renderLoginPage } from "./dev-server/login-page.js";
import { renderNotFoundPage, renderPrivatePage } from "./dev-server/pages.js";
import { renderPayablesReceivablesPage } from "./dev-server/payables-receivables-page.js";
import { renderRecurrencesPage } from "./dev-server/recurrences-page.js";
import { resolveRoute } from "./dev-server/routes.js";
import { getSessionTokenFromRequest } from "./dev-server/session.js";
import { renderSettingsPage } from "./dev-server/settings-page.js";

export { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
export {
  renderAccountsPage,
  renderBudgetsPage,
  renderCategoriesPage,
  renderDashboardPage,
  renderTransactionsPage,
} from "./dev-server/pages.js";
export { renderCardsPage } from "./dev-server/cards-page.js";
export { renderInboxPage } from "./dev-server/inbox-page.js";
export { renderLoginPage } from "./dev-server/login-page.js";
export { renderPayablesReceivablesPage } from "./dev-server/payables-receivables-page.js";
export { renderRecurrencesPage } from "./dev-server/recurrences-page.js";
export { resolveRoute } from "./dev-server/routes.js";
export { renderSettingsPage } from "./dev-server/settings-page.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const manifest = buildSolverFinWebManifest();

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

if (process.argv[1]?.endsWith("dev-server.js") === true) {
  server.listen(port, host, () => {
    console.log(
      `SolverFin web dev server running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    );
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const token = getSessionTokenFromRequest(request);

  if (url.pathname === "/manifest.webmanifest") {
    sendJson(response, 200, manifest, "application/manifest+json; charset=utf-8");
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", app: "solverfin-web" });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, url, token);
    return;
  }

  const route = resolveRoute(url.pathname, token !== undefined);

  if (route.statusCode === 302 && route.location) {
    response.writeHead(302, { location: route.location });
    response.end();
    return;
  }

  if (route.kind === "login") {
    sendHtml(response, 200, renderLoginPage(url.searchParams.get("erro") ?? undefined));
    return;
  }

  if (url.pathname === "/contas-cartoes" && token) {
    sendHtml(response, 200, enhanceAccountsCardsTabs(await renderAccountsCardsPage(token)));
    return;
  }

  if (url.pathname === "/cartoes" && token) {
    sendHtml(response, 200, await renderCardsPage(token));
    return;
  }

  if (url.pathname === "/pagar-receber" && token) {
    sendHtml(response, 200, await renderPayablesReceivablesPage(token));
    return;
  }

  if (url.pathname === "/recorrencias" && token) {
    sendHtml(response, 200, await renderRecurrencesPage(token));
    return;
  }

  if (url.pathname === "/inbox" && token) {
    sendHtml(response, 200, await renderInboxPage(token));
    return;
  }

  if (url.pathname === "/configuracoes" && token) {
    sendHtml(response, 200, await renderSettingsPage(token));
    return;
  }

  if ((route.kind === "dashboard" || route.kind === "placeholder") && token) {
    sendHtml(response, 200, await renderPrivatePage(url.pathname, token));
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}

export function enhanceAccountsCardsTabs(html: string): string {
  if (!html.includes('data-tab-panel="accounts"') || html.includes("data-accounts-cards-tabs-fallback")) {
    return html;
  }

  const activeFilterToggleHtml = `          <label class="active-filter-switch" data-active-filter aria-pressed="false">
            <input type="checkbox" class="active-filter-input" data-active-filter-input />
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            <span>Exibir apenas contas ativas</span>
          </label>`;
  const additionalCardSectionHtml = renderAdditionalCardSectionHtml();
  const htmlWithActiveFilter = replaceStatusFilterWithActiveToggle(html, activeFilterToggleHtml);
  const htmlWithAdditionalCards = injectAdditionalCardSections(htmlWithActiveFilter, additionalCardSectionHtml);

  return htmlWithAdditionalCards.replace("</body>", `${accountsCardsTabsFallbackScript()}</body>`);
}

function replaceStatusFilterWithActiveToggle(html: string, activeFilterToggleHtml: string): string {
  const htmlWithoutStatusFilter = html.replace(
    `          <label>Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>`,
    "",
  );

  return htmlWithoutStatusFilter.replace(
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>`,
    `          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>
${activeFilterToggleHtml}`,
  );
}

function injectAdditionalCardSections(html: string, additionalCardSectionHtml: string): string {
  return html.replace(
    /(<form[^>]*data-api-path="\/api\/cards(?:\/[^"]+)?"[^>]*class="edit-grid"[^>]*>[\s\S]*?)(\s*<button type="submit">(?:Criar|Salvar) cartão<\/button>)/g,
    (match, formBeforeSubmit: string, submitButton: string) => {
      if (formBeforeSubmit.includes("additional-card-section")) return match;
      return `${formBeforeSubmit}${additionalCardSectionHtml}${submitButton}`;
    },
  );
}

function renderAdditionalCardSectionHtml(): string {
  const additionalCardRowHtml = "<label>Nome do cartão adicional<input data-additional-card-name placeholder=&quot;Ex.: Virtual - 0322&quot; /></label><label>Identificador mascarado<input data-additional-card-identifier placeholder=&quot;Ex.: final 0322&quot; /></label><div class=&quot;additional-card-actions&quot;><button type=&quot;submit&quot; class=&quot;additional-card-save&quot;>Salvar adicional</button><button type=&quot;button&quot; class=&quot;additional-card-remove&quot;>Remover</button></div>";
  const addAction = [
    "var section=this.closest('.additional-card-section');",
    "var list=section&&section.querySelector('[data-additional-card-list]');",
    "if(list){var row=document.createElement('div');row.className='additional-card-row';",
    `row.innerHTML='${additionalCardRowHtml}';`,
    "list.appendChild(row);var remove=row.querySelector('.additional-card-remove');if(remove)remove.onclick=function(){row.remove();};var input=row.querySelector('input');if(input&&input.focus)input.focus();}",
    "return false;",
  ].join("");

  return `
        <section class="additional-card-section" aria-label="Cartões adicionais">
          <div class="additional-card-heading">
            <div>
              <strong>Cartões adicionais</strong>
              <p class="muted">Inclua cartões físicos, virtuais ou de outras pessoas vinculados a este cadastro.</p>
            </div>
            <button type="button" class="additional-card-add" data-additional-card-add onclick="${addAction}">+ adicionar</button>
          </div>
          <div class="additional-card-saved-list" data-additional-card-saved-list hidden></div>
          <div class="additional-card-list" data-additional-card-list></div>
        </section>`;
}

function accountsCardsTabsFallbackScript(): string {
  return `
      <script data-accounts-cards-tabs-fallback>
        (() => {
          if (window.__solverFinAccountsCardsTabs === true) return;
          window.__solverFinAccountsCardsTabs = true;

          const activeFilterStorageKey = "solverfin.accountsCards.activeOnly";
          const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
          const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
          const searchInput = document.querySelector("[data-master-search]");
          const statusSelect = document.querySelector("[data-master-status]");
          const activeFilterButton = document.querySelector("[data-active-filter]");
          const knownTabs = new Set(panels.map((panel) => panel.dataset.tabPanel).filter(Boolean));

          function getEventElement(event) {
            const target = event.target;
            if (target instanceof Element) return target;
            if (target && target.parentElement instanceof Element) return target.parentElement;
            return null;
          }

          function ensureAccountsCardsStyles() {
            if (document.getElementById("accounts-cards-enhancement-style")) return;

            const style = document.createElement("style");
            style.id = "accounts-cards-enhancement-style";
            style.textContent = [
              ".active-filter-switch { align-items: center; align-self: stretch; background: var(--primary-soft); border: 1px solid #d4e6ec; border-radius: 8px; color: var(--primary); cursor: pointer; display: inline-flex; font: inherit; font-size: .84rem; font-weight: 800; gap: 10px; justify-content: center; line-height: 1.15; min-height: 44px; padding: 0 14px; text-align: left; user-select: none; width: fit-content; }",
              ".active-filter-switch > span:last-child { max-width: 12rem; }",
              ".active-filter-input { border: 0; height: 1px; margin: 0; opacity: 0; padding: 0; position: absolute; width: 1px; }",
              ".active-filter-switch .toggle-track { align-items: center; background: #cbd5e1; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 20px; padding: 2px; transition: background .18s ease; width: 38px; }",
              ".active-filter-switch .toggle-thumb { background: #fff; border-radius: 999px; box-shadow: 0 1px 3px rgba(15, 23, 42, .24); display: block; height: 16px; transform: translateX(0); transition: background .18s ease, transform .18s ease; width: 16px; }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-track { background: var(--primary); }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-thumb { background: #22d3ee; transform: translateX(18px); }",
              ".active-filter-switch:focus-within { box-shadow: 0 0 0 3px rgba(59, 130, 246, .24); }",
              ".additional-card-section { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 12px; grid-column: 1 / -1; padding: 12px; }",
              ".additional-card-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }",
              ".additional-card-add { background: transparent; color: var(--primary); min-height: 36px; padding: 0 10px; }",
              ".additional-card-list, .additional-card-saved-list { display: grid; gap: 10px; }",
              ".additional-card-row { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) minmax(0, .75fr) minmax(12rem, auto); }",
              ".additional-card-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }",
              ".additional-card-save { background: var(--primary); color: white; min-height: 44px; min-width: 9.25rem; padding: 0 12px; white-space: nowrap; }",
              ".additional-card-remove { background: var(--danger-bg); border: 1px solid #fecaca; color: var(--danger); min-height: 44px; min-width: 7rem; padding: 0 12px; white-space: nowrap; }",
              ".additional-card-saved-row { align-items: center; background: var(--surface); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; padding: 10px; }",
              ".additional-card-saved-row span { color: var(--muted); font-size: .88rem; }",
              "@media (max-width: 760px) { .active-filter-switch, .additional-card-row { width: 100%; } .active-filter-switch > span:last-child { max-width: none; } .additional-card-row, .additional-card-saved-row { grid-template-columns: 1fr; } .additional-card-actions { display: grid; grid-template-columns: 1fr; justify-content: stretch; } .additional-card-heading { align-items: stretch; display: grid; } }",
            ].join("");
            document.head.appendChild(style);
          }

          function readActiveOnlyPreference() {
            try {
              return window.localStorage.getItem(activeFilterStorageKey) === "true";
            } catch (_error) {
              return false;
            }
          }

          function saveActiveOnlyPreference(activeOnly) {
            try {
              window.localStorage.setItem(activeFilterStorageKey, String(activeOnly));
            } catch (_error) {
              // Keep the filter working for the current session if storage is unavailable.
            }
          }

          function setActiveFilterState(activeOnly) {
            if (!activeFilterButton) return;
            const input = activeFilterButton.querySelector("[data-active-filter-input]");
            activeFilterButton.setAttribute("aria-pressed", String(activeOnly));
            if (input) input.checked = activeOnly;
          }

          function readActiveFilterState() {
            const input = activeFilterButton ? activeFilterButton.querySelector("[data-active-filter-input]") : null;
            if (input) return input.checked === true;
            return String(statusSelect && statusSelect.value || "all") === "active";
          }

          function resolveRequestedTab(tab) {
            return knownTabs.has(tab) ? tab : "accounts";
          }

          function focusFirstDialogField(dialog) {
            const firstField = dialog.querySelector("input, select, textarea, button");
            if (firstField && typeof firstField.focus === "function") firstField.focus();
          }

          function openAccountsCardsDialog(button) {
            const dialogId = button ? button.dataset.openDialog : undefined;
            const dialog = dialogId ? document.getElementById(dialogId) : null;
            if (!dialog) return false;

            if (typeof dialog.showModal === "function") {
              if (!dialog.open) dialog.showModal();
            } else {
              dialog.setAttribute("open", "");
            }

            focusFirstDialogField(dialog);
            return true;
          }

          function closeAccountsCardsDialog(form) {
            const dialog = form ? form.closest("dialog") : null;
            if (!dialog) return false;

            if (typeof dialog.close === "function") {
              dialog.close();
            } else {
              dialog.removeAttribute("open");
            }

            return true;
          }

          function applyFilters() {
            const term = String((searchInput && searchInput.value) || "").trim().toLowerCase();
            const activeOnly = readActiveFilterState();
            const visiblePanel = panels.find((panel) => panel.hidden === false);
            if (!visiblePanel) return;

            let visibleItems = 0;
            visiblePanel.querySelectorAll("[data-master-item]").forEach((item) => {
              const itemStatus = item.dataset.status;
              const matchesSearch = !term || String(item.dataset.search || "").includes(term);
              const matchesStatus = !activeOnly || itemStatus === "active";
              const isVisible = matchesSearch && matchesStatus;
              item.hidden = !isVisible;
              if (isVisible) visibleItems += 1;
            });

            const emptyState = visiblePanel.querySelector("[data-filter-empty]");
            if (emptyState) emptyState.hidden = visibleItems > 0 || visiblePanel.querySelectorAll("[data-master-item]").length === 0;
          }

          function activateTab(tab, options) {
            const activeTab = resolveRequestedTab(tab);

            tabButtons.forEach((button) => {
              const isActive = button.dataset.tab === activeTab;
              button.setAttribute("aria-selected", String(isActive));
              button.classList.toggle("is-active", isActive);
              button.tabIndex = 0;
            });

            panels.forEach((panel) => {
              const isActive = panel.dataset.tabPanel === activeTab;
              if (isActive) {
                panel.removeAttribute("hidden");
                panel.setAttribute("aria-hidden", "false");
              } else {
                panel.setAttribute("hidden", "");
                panel.setAttribute("aria-hidden", "true");
              }
            });

            applyFilters();

            if (!options || options.updateHash !== false) {
              const nextHash = activeTab === "accounts" ? "" : "#" + activeTab;
              const nextUrl = window.location.pathname + window.location.search + nextHash;
              if (window.history && window.location.hash !== nextHash) window.history.replaceState(null, "", nextUrl);
            }
          }

          function additionalCardRowHtml() {
            return '<label>Nome do cartão adicional<input data-additional-card-name placeholder="Ex.: Virtual - 0322" /></label><label>Identificador mascarado<input data-additional-card-identifier placeholder="Ex.: final 0322" /></label><div class="additional-card-actions"><button type="submit" class="additional-card-save">Salvar adicional</button><button type="button" class="additional-card-remove">Remover</button></div>';
          }

          function appendAdditionalCardRowFromButton(button) {
            const section = button ? button.closest(".additional-card-section") : null;
            const list = section ? section.querySelector("[data-additional-card-list]") : null;
            if (!list) return false;

            const row = document.createElement("div");
            row.className = "additional-card-row";
            row.innerHTML = additionalCardRowHtml();
            const removeButton = row.querySelector(".additional-card-remove");
            if (removeButton) removeButton.addEventListener("click", () => row.remove());
            list.appendChild(row);
            const firstInput = row.querySelector("input");
            if (firstInput && typeof firstInput.focus === "function") firstInput.focus();
            return true;
          }

          window.__solverFinAddAdditionalCard = appendAdditionalCardRowFromButton;

          function readFormPayload(form) {
            const payload = {};
            new FormData(form).forEach((value, key) => {
              if (value === "") return;
              const field = form.querySelector('[name="' + key + '"]');
              if (field && field.dataset.money !== undefined) {
                payload[key] = Math.round(parseFloat(String(value).replace(",", ".")) * 100);
              } else if (field && field.type === "number") {
                payload[key] = Number(value);
              } else {
                payload[key] = value;
              }
            });
            return payload;
          }

          function readAdditionalCards(form) {
            return Array.from(form.querySelectorAll(".additional-card-row"))
              .map((row) => {
                const nameField = row.querySelector("[data-additional-card-name]");
                const identifierField = row.querySelector("[data-additional-card-identifier]");
                const name = String(nameField ? nameField.value : "").trim();
                const maskedIdentifier = String(identifierField ? identifierField.value : "").trim();
                return { name, maskedIdentifier };
              })
              .filter((card) => card.name.length > 0);
          }

          async function readApiMessage(response) {
            const body = await response.json().catch(() => ({}));
            if (response.ok) return "Ação concluída. Atualizando a tela...";
            return (body.error && body.error.message) || "Não foi possível concluir a ação.";
          }

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

          async function sendCardPayload(path, method, payload) {
            return fetch(path, {
              method,
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            });
          }

          function isCardMutationForm(form) {
            if (!form || !form.dataset || !form.dataset.apiPath) return false;
            if (form.dataset.apiPath === "/api/cards") return true;
            return form.dataset.apiMethod === "PATCH" && form.dataset.apiPath.indexOf("/api/cards/") === 0;
          }

          function cardIdFromPath(path) {
            const match = String(path || "").match(/^\/api\/cards\/([^/]+)$/);
            return match ? match[1] : "";
          }

          function sameText(left, right) {
            return String(left || "") === String(right || "");
          }

          function sameNumber(left, right) {
            return Number(left || 0) === Number(right || 0);
          }

          function isSavedAdditionalForForm(form, card) {
            const base = readFormPayload(form);
            const baseId = cardIdFromPath(form.dataset.apiPath);
            if (!baseId || !card || card.id === baseId) return false;
            return sameText(base.institutionKey, card.institutionKey)
              && sameText(base.brandKey, card.brandKey)
              && sameText(base.paymentAccountId, card.paymentAccountId)
              && sameNumber(base.closingDay, card.closingDay)
              && sameNumber(base.dueDay, card.dueDay)
              && sameNumber(base.creditLimitMinor, card.creditLimitMinor);
          }

          function ensureSavedAdditionalList(form) {
            const section = form.querySelector(".additional-card-section");
            if (!section) return null;
            let savedList = section.querySelector("[data-additional-card-saved-list]");
            if (!savedList) {
              savedList = document.createElement("div");
              savedList.className = "additional-card-saved-list";
              savedList.setAttribute("data-additional-card-saved-list", "");
              savedList.hidden = true;
              const newList = section.querySelector("[data-additional-card-list]");
              section.insertBefore(savedList, newList || null);
            }
            return savedList;
          }

          function renderSavedAdditionalCards(form, cards) {
            const savedList = ensureSavedAdditionalList(form);
            if (!savedList) return;
            const additions = cards.filter((card) => isSavedAdditionalForForm(form, card));
            savedList.replaceChildren();
            savedList.hidden = additions.length === 0;
            if (additions.length === 0) return;

            const title = document.createElement("strong");
            title.textContent = "Adicionais salvos";
            savedList.appendChild(title);

            additions.forEach((card) => {
              const row = document.createElement("div");
              row.className = "additional-card-saved-row";

              const text = document.createElement("div");
              const name = document.createElement("strong");
              name.textContent = card.name || "Cartão adicional";
              const meta = document.createElement("span");
              meta.textContent = card.maskedIdentifier ? card.maskedIdentifier : "Identificador não informado";
              text.appendChild(name);
              text.appendChild(meta);

              const editButton = document.createElement("button");
              editButton.type = "button";
              editButton.className = "secondary-button";
              editButton.dataset.openDialog = "edit-card-dialog-" + card.id;
              editButton.textContent = "Editar";

              row.appendChild(text);
              row.appendChild(editButton);
              savedList.appendChild(row);
            });
          }

          async function loadSavedAdditionalCards() {
            const forms = Array.from(document.querySelectorAll('form[data-api-method="PATCH"][data-api-path^="/api/cards/"]'));
            if (forms.length === 0) return;

            const response = await fetch("/api/cards?status=all").catch(() => null);
            if (!response || !response.ok) return;
            const body = await response.json().catch(() => ({}));
            const cards = Array.isArray(body.cards) ? body.cards : [];
            forms.forEach((form) => renderSavedAdditionalCards(form, cards));
          }

          async function submitCardBatch(event, form) {
            event.preventDefault();
            event.stopImmediatePropagation();

            const submitButton = form.querySelector('button[type="submit"]');
            const status = ensureStatus(form);
            const basePayload = readFormPayload(form);
            const additionalCards = readAdditionalCards(form);
            const method = form.dataset.apiMethod || "POST";
            const isEdit = method.toUpperCase() === "PATCH";

            if (submitButton) submitButton.disabled = true;
            status.className = "form-status muted";
            status.textContent = additionalCards.length > 0 ? "Salvando cartões..." : "Salvando...";

            const baseResponse = await sendCardPayload(form.dataset.apiPath, method, basePayload);
            if (!baseResponse.ok) {
              status.className = "form-status error";
              status.textContent = await readApiMessage(baseResponse);
              if (submitButton) submitButton.disabled = false;
              return;
            }

            for (const card of additionalCards) {
              const response = await sendCardPayload("/api/cards", "POST", {
                ...basePayload,
                name: card.name,
                ...(card.maskedIdentifier ? { maskedIdentifier: card.maskedIdentifier } : {}),
              });

              if (!response.ok) {
                status.className = "form-status error";
                status.textContent = await readApiMessage(response);
                if (submitButton) submitButton.disabled = false;
                return;
              }
            }

            status.className = "form-status success";
            status.textContent = isEdit || additionalCards.length > 0 ? "Cartões salvos. Atualizando a tela..." : "Cartão criado. Atualizando a tela...";
            window.setTimeout(() => window.location.reload(), 450);
          }

          ensureAccountsCardsStyles();
          setActiveFilterState(readActiveOnlyPreference());
          void loadSavedAdditionalCards();

          const activeFilterInput = activeFilterButton ? activeFilterButton.querySelector("[data-active-filter-input]") : null;
          if (activeFilterInput) {
            activeFilterInput.addEventListener("change", () => {
              const activeOnly = activeFilterInput.checked === true;
              setActiveFilterState(activeOnly);
              saveActiveOnlyPreference(activeOnly);
              applyFilters();
            });
          }

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const addButton = target ? target.closest("[data-additional-card-add]") : null;
            if (!addButton) return;

            if (appendAdditionalCardRowFromButton(addButton)) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
          }, true);

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const removeButton = target ? target.closest(".additional-card-remove") : null;
            if (!removeButton) return;
            const row = removeButton.closest(".additional-card-row");
            if (row) row.remove();
          });

          document.addEventListener("submit", (event) => {
            const target = getEventElement(event);
            const form = target ? target.closest("form") : null;
            if (!isCardMutationForm(form)) return;
            void submitCardBatch(event, form);
          }, true);

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const button = target ? target.closest("[data-open-dialog]") : null;
            if (!button) return;

            if (openAccountsCardsDialog(button)) event.preventDefault();
          });

          document.addEventListener("submit", (event) => {
            const target = getEventElement(event);
            const form = target ? target.closest(".dialog-close-form") : null;
            if (!form) return;

            if (closeAccountsCardsDialog(form)) event.preventDefault();
          });

          document.addEventListener("click", (event) => {
            const target = getEventElement(event);
            const button = target ? target.closest("[data-tab]") : null;
            if (!button) return;
            event.preventDefault();
            activateTab(button.dataset.tab);
          });

          if (searchInput) {
            searchInput.addEventListener("input", applyFilters);
            searchInput.addEventListener("change", applyFilters);
          }

          window.addEventListener("hashchange", () => activateTab(window.location.hash.slice(1), { updateHash: false }));

          const selectedButton = tabButtons.find((button) => button.getAttribute("aria-selected") === "true");
          const initialTab = window.location.hash ? window.location.hash.slice(1) : selectedButton && selectedButton.dataset.tab;
          activateTab(initialTab, { updateHash: !window.location.hash });
        })();
      </script>`;
}
