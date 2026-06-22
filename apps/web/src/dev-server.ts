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
  const additionalCardSectionHtml = `        <section class="additional-card-section" aria-label="Cartões adicionais">
          <div class="additional-card-heading">
            <div>
              <strong>Cartões adicionais</strong>
              <p class="muted">Inclua cartões físicos, virtuais ou de outras pessoas vinculados a este cadastro.</p>
            </div>
            <button type="button" class="additional-card-add" data-additional-card-add>+ adicional</button>
          </div>
          <div class="additional-card-list" data-additional-card-list></div>
        </section>`;

  const htmlWithActiveFilter = html.replace(
    `          <label>Status
            <select data-master-status>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>`,
    activeFilterToggleHtml,
  );

  const htmlWithNewCardAdditions = htmlWithActiveFilter.replace(
    `        <label>Identificador mascarado<input name="maskedIdentifier" placeholder="Ex.: final 9876" /></label>
        <button type="submit">Criar cartão</button>`,
    `        <label>Identificador mascarado<input name="maskedIdentifier" placeholder="Ex.: final 9876" /></label>
${additionalCardSectionHtml}
        <button type="submit">Criar cartão</button>`,
  );

  const htmlWithEditCardAdditions = htmlWithNewCardAdditions.replace(
    /(<form data-api-form data-api-method="PATCH" data-api-path="\/api\/cards\/[^"]+" class="edit-grid">[\s\S]*?<label>Identificador mascarado<input name="maskedIdentifier"[^>]*><\/label>\n)\s*<button type="submit">Salvar cartão<\/button>/g,
    `$1${additionalCardSectionHtml}
        <button type="submit">Salvar cartão</button>`,
  );

  return htmlWithEditCardAdditions.replace("</body>", `${accountsCardsTabsFallbackScript()}</body>`);
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
          const activeFilterButton = buildActiveFilterToggle(statusSelect);
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
              ".active-filter-switch { align-items: center; align-self: end; color: var(--text); cursor: pointer; display: inline-flex; font: inherit; font-size: .9rem; font-weight: 800; gap: 8px; justify-content: flex-start; min-height: 34px; text-align: left; user-select: none; width: fit-content; }",
              ".active-filter-input { border: 0; height: 1px; margin: 0; opacity: 0; padding: 0; position: absolute; width: 1px; }",
              ".active-filter-switch .toggle-track { align-items: center; background: #263348; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 18px; padding: 2px; transition: background .18s ease; width: 36px; }",
              ".active-filter-switch .toggle-thumb { background: #94a3b8; border-radius: 999px; box-shadow: 0 1px 2px rgba(15, 23, 42, .28); display: block; height: 14px; transform: translateX(0); transition: background .18s ease, transform .18s ease; width: 14px; }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-track { background: #1e293b; }",
              ".active-filter-switch[aria-pressed=\"true\"] .toggle-thumb { background: #3b82f6; transform: translateX(18px); }",
              ".active-filter-switch:focus-within .toggle-track { box-shadow: 0 0 0 3px rgba(59, 130, 246, .24); }",
              ".additional-card-section { background: var(--surface-soft); border: 1px solid #d8e7ec; border-radius: 8px; display: grid; gap: 12px; grid-column: 1 / -1; padding: 12px; }",
              ".additional-card-heading { align-items: center; display: flex; gap: 12px; justify-content: space-between; }",
              ".additional-card-add { background: transparent; color: var(--primary); min-height: 36px; padding: 0 10px; }",
              ".additional-card-list { display: grid; gap: 10px; }",
              ".additional-card-row { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) minmax(0, .75fr) auto; }",
              ".additional-card-remove { background: var(--danger-bg); border: 1px solid #fecaca; color: var(--danger); min-height: 44px; padding: 0 12px; }",
              "@media (max-width: 760px) { .additional-card-row { grid-template-columns: 1fr; } .additional-card-heading { align-items: stretch; display: grid; } }",
            ].join("");
            document.head.appendChild(style);
          }

          function buildActiveFilterToggle(statusControl) {
            const existingToggle = document.querySelector("[data-active-filter]");
            if (existingToggle) {
              ensureAccountsCardsStyles();
              return existingToggle;
            }
            if (!statusControl) return null;

            ensureAccountsCardsStyles();

            const statusLabel = statusControl.closest("label");
            const toggle = document.createElement("label");
            toggle.className = "active-filter-switch";
            toggle.dataset.activeFilter = "";
            toggle.setAttribute("aria-pressed", "false");
            toggle.innerHTML = '<input type="checkbox" class="active-filter-input" data-active-filter-input /><span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span><span>Exibir apenas contas ativas</span>';

            if (statusLabel) {
              statusLabel.replaceWith(toggle);
            } else {
              statusControl.replaceWith(toggle);
            }

            return toggle;
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
              // Prefer keeping the filter working for the current session if storage is unavailable.
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
            return input ? input.checked === true : false;
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

            visiblePanel.querySelectorAll("[data-master-item]").forEach((item) => {
              const itemStatus = item.dataset.status;
              const matchesSearch = !term || String(item.dataset.search || "").includes(term);
              const matchesStatus = !activeOnly || itemStatus === "active";
              item.hidden = !(matchesSearch && matchesStatus);
            });
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

          function appendAdditionalCardRow(list) {
            if (!list) return;

            const row = document.createElement("div");
            row.className = "additional-card-row";
            row.innerHTML = '<label>Nome do cartão adicional<input data-additional-card-name placeholder="Ex.: Virtual - 0322" /></label><label>Identificador mascarado<input data-additional-card-identifier placeholder="Ex.: final 0322" /></label><button type="button" class="additional-card-remove">Remover</button>';
            const removeButton = row.querySelector("button");
            if (removeButton) removeButton.addEventListener("click", () => row.remove());
            list.appendChild(row);
            const firstInput = row.querySelector("input");
            if (firstInput && typeof firstInput.focus === "function") firstInput.focus();
          }

          window.__solverFinAddAdditionalCard = (button) => {
            const section = button ? button.closest(".additional-card-section") : null;
            const list = section ? section.querySelector("[data-additional-card-list]") : null;
            appendAdditionalCardRow(list);
          };

          function enhanceAdditionalCardCreation() {
            const forms = Array.from(
              document.querySelectorAll('#new-card-dialog form[data-api-path="/api/cards"], form[data-api-method="PATCH"][data-api-path^="/api/cards/"]'),
            );

            forms.forEach((form) => enhanceAdditionalCardForm(form));
          }

          function enhanceAdditionalCardForm(form) {
            if (!form || form.dataset.additionalCardsEnhanced === "true") return;

            ensureAccountsCardsStyles();
            form.dataset.additionalCardsEnhanced = "true";

            const submitButton = form.querySelector('button[type="submit"]');
            let section = form.querySelector(".additional-card-section");

            if (!section) {
              section = document.createElement("section");
              section.className = "additional-card-section";
              section.setAttribute("aria-label", "Cartões adicionais");
              section.innerHTML = '<div class="additional-card-heading"><div><strong>Cartões adicionais</strong><p class="muted">Inclua cartões físicos, virtuais ou de outras pessoas vinculados a este cadastro.</p></div><button type="button" class="additional-card-add" data-additional-card-add>+ adicional</button></div><div class="additional-card-list" data-additional-card-list></div>';

              if (submitButton) {
                form.insertBefore(section, submitButton);
              } else {
                form.appendChild(section);
              }
            }

            form.addEventListener(
              "submit",
              (event) => {
                void submitCardBatch(event, form);
              },
              true,
            );
          }

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

          setActiveFilterState(readActiveOnlyPreference());
          enhanceAdditionalCardCreation();

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

            const section = addButton.closest(".additional-card-section");
            const list = section ? section.querySelector("[data-additional-card-list]") : null;
            if (!list) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            appendAdditionalCardRow(list);
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
