import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
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

export { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
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
    const accountsCardsHtml = await renderAccountsCardsPage(token);
    sendHtml(response, 200, enhanceAccountsCardsTabs(stabilizeAccountsCardsAdditionalForms(accountsCardsHtml)));
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

function stabilizeAccountsCardsAdditionalForms(html: string): string {
  if (html.includes("data-accounts-cards-additional-stability")) return html;

  return html.replace(
    "      <script>\n      function ensureStatus(container)",
    `${accountsCardsAdditionalStabilityScript()}
      <script>
      function ensureStatus(container)`,
  );
}

function accountsCardsAdditionalStabilityScript(): string {
  return `
      <script data-accounts-cards-additional-stability>
        (() => {
          const nativeAddEventListener = EventTarget.prototype.addEventListener;

          function isEnhancedCardForm(target) {
            if (!(target instanceof HTMLFormElement)) return false;
            const apiPath = String(target.dataset.apiPath || "");
            const apiMethod = String(target.dataset.apiMethod || "POST").toUpperCase();
            return apiPath === "/api/cards" || (apiMethod === "PATCH" && apiPath.indexOf("/api/cards/") === 0);
          }

          EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
            if (type === "submit" && isEnhancedCardForm(this)) return;
            return nativeAddEventListener.call(this, type, listener, options);
          };

          const style = document.createElement("style");
          style.id = "accounts-cards-additional-stability-style";
          style.textContent = [
            ".additional-card-row { align-items: end !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; }",
            ".additional-card-actions { grid-column: 1 / -1 !important; justify-content: flex-start !important; }",
            ".additional-card-save, .additional-card-remove { flex: 0 0 auto !important; min-width: 10rem !important; }",
            ".additional-card-group-row { grid-template-columns: 28px minmax(0, 1fr) !important; }",
            ".additional-card-group-actions { grid-column: 2 !important; justify-content: flex-start !important; }",
            ".additional-card-primary-action, .additional-card-edit-action { min-width: 9rem !important; }",
            "@media (max-width: 760px) { .additional-card-row { grid-template-columns: 1fr !important; } .additional-card-actions, .additional-card-group-actions { display: grid !important; grid-template-columns: 1fr !important; } .additional-card-save, .additional-card-remove, .additional-card-primary-action, .additional-card-edit-action { width: 100% !important; } }",
          ].join("");
          document.head.appendChild(style);
        })();
      </script>`;
}
