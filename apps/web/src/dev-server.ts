import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { renderAdminInstitutionsPage } from "./dev-server/admin-institutions-page.js";
import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page-dialog-only.js";
import { handleApiRequest } from "./dev-server/api.js";
import { renderCardsPage } from "./dev-server/cards-page.js";
import { renderCategoriesPage } from "./dev-server/categories-page.js";
import { renderDashboardPage } from "./dev-server/dashboard-page.js";
import { sendHtml, sendJson } from "./dev-server/http.js";
import { renderInboxPage } from "./dev-server/inbox-page.js";
import { renderLoginPage } from "./dev-server/login-page.js";
import { renderNotFoundPage, renderPrivatePage } from "./dev-server/pages.js";
import { resolveRoute } from "./dev-server/routes.js";
import { getSessionTokenFromRequest } from "./dev-server/session.js";
import { renderSettingsPage } from "./dev-server/settings-page.js";
import { tryServeStaticAsset } from "./dev-server/static-assets.js";
import { renderTransactionsPage } from "./dev-server/transactions-page.js";

export { renderAdminInstitutionsPage } from "./dev-server/admin-institutions-page.js";
export { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
export { renderAccountsCardsPage } from "./dev-server/accounts-cards-page-dialog-only.js";
export { renderAccountsPage, renderBudgetsPage } from "./dev-server/pages.js";
export { renderCardsPage } from "./dev-server/cards-page.js";
export { renderCategoriesPage } from "./dev-server/categories-page.js";
export { renderDashboardPage } from "./dev-server/dashboard-page.js";
export { renderInboxPage } from "./dev-server/inbox-page.js";
export { renderLoginPage } from "./dev-server/login-page.js";
export { resolveRoute } from "./dev-server/routes.js";
export { renderSettingsPage } from "./dev-server/settings-page.js";
export { renderTransactionsPage } from "./dev-server/transactions-page.js";

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

  if (await tryServeStaticAsset(url.pathname, response)) {
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

  if (url.pathname === "/dashboard" && token) {
    sendHtml(response, 200, await renderDashboardPage(token));
    return;
  }

  if (url.pathname === "/admin/instituicoes" && token) {
    sendHtml(response, 200, await renderAdminInstitutionsPage(token, url));
    return;
  }

  if (url.pathname === "/contas-cartoes" && token) {
    sendHtml(response, 200, enhanceAccountsCardsTabs(await renderAccountsCardsPage(token)));
    return;
  }

  if (url.pathname === "/categorias" && token) {
    sendHtml(response, 200, await renderCategoriesPage(token));
    return;
  }

  if (url.pathname === "/cartoes" && token) {
    sendHtml(response, 200, await renderCardsPage(token, url));
    return;
  }

  if (url.pathname === "/lancamentos" && token) {
    sendHtml(response, 200, await renderTransactionsPage(token, url));
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

  if (route.kind === "placeholder" && token) {
    sendHtml(response, 200, await renderPrivatePage(url.pathname, token));
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}
