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

  return html.replace("</body>", `${accountsCardsTabsFallbackScript()}</body>`);
}

function accountsCardsTabsFallbackScript(): string {
  return `
      <script data-accounts-cards-tabs-fallback>
        (() => {
          if (window.__solverFinAccountsCardsTabs === true) return;
          window.__solverFinAccountsCardsTabs = true;

          const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
          const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
          const searchInput = document.querySelector("[data-master-search]");
          const statusSelect = document.querySelector("[data-master-status]");
          const knownTabs = new Set(panels.map((panel) => panel.dataset.tabPanel).filter(Boolean));

          function resolveRequestedTab(tab) {
            return knownTabs.has(tab) ? tab : "accounts";
          }

          function applyFilters() {
            const term = String((searchInput && searchInput.value) || "").trim().toLowerCase();
            const status = String((statusSelect && statusSelect.value) || "all");
            const visiblePanel = panels.find((panel) => panel.hidden === false);
            if (!visiblePanel) return;

            visiblePanel.querySelectorAll("[data-master-item]").forEach((item) => {
              const itemStatus = item.dataset.status;
              const matchesSearch = !term || String(item.dataset.search || "").includes(term);
              const matchesStatus = status === "all" || (status === "active" ? itemStatus === "active" : itemStatus !== "active");
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

          document.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target ? target.closest("[data-tab]") : null;
            if (!button) return;
            event.preventDefault();
            activateTab(button.dataset.tab);
          });

          [searchInput, statusSelect].forEach((control) => {
            if (!control) return;
            control.addEventListener("input", applyFilters);
            control.addEventListener("change", applyFilters);
          });

          window.addEventListener("hashchange", () => activateTab(window.location.hash.slice(1), { updateHash: false }));

          const selectedButton = tabButtons.find((button) => button.getAttribute("aria-selected") === "true");
          const initialTab = window.location.hash ? window.location.hash.slice(1) : selectedButton && selectedButton.dataset.tab;
          activateTab(initialTab, { updateHash: !window.location.hash });
        })();
      </script>`;
}
