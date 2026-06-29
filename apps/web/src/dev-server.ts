import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { solverFinLogoPngBase64 } from "./pwa/brand-assets.js";
import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
import { handleApiRequest } from "./dev-server/api.js";
import { enhanceSolverFinBrandLogo } from "./dev-server/brand-enhancement.js";
import { renderEnhancedCardsPage } from "./dev-server/cards-page-enhancement.js";
import { renderCategoriesPage } from "./dev-server/categories-page.js";
import { sendHtml, sendJson } from "./dev-server/http.js";
import { renderInboxPage } from "./dev-server/inbox-page.js";
import { renderLoginPage } from "./dev-server/login-page.js";
import { renderNotFoundPage, renderPrivatePage } from "./dev-server/pages.js";
import { renderPayablesReceivablesPage } from "./dev-server/payables-receivables-page.js";
import { renderRecurrencesPage } from "./dev-server/recurrences-page.js";
import { resolveRoute } from "./dev-server/routes.js";
import { getSessionTokenFromRequest } from "./dev-server/session.js";
import { renderSettingsPage } from "./dev-server/settings-page.js";
import { renderTransactionsPage } from "./dev-server/transactions-page.js";

export { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
export { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
export { enhanceSolverFinBrandLogo } from "./dev-server/brand-enhancement.js";
export { renderAccountsPage, renderBudgetsPage, renderDashboardPage } from "./dev-server/pages.js";
export { renderCardsPage } from "./dev-server/cards-page.js";
export { renderEnhancedCardsPage } from "./dev-server/cards-page-enhancement.js";
export { renderCategoriesPage } from "./dev-server/categories-page.js";
export { renderInboxPage } from "./dev-server/inbox-page.js";
export { renderLoginPage } from "./dev-server/login-page.js";
export { renderPayablesReceivablesPage } from "./dev-server/payables-receivables-page.js";
export { renderRecurrencesPage } from "./dev-server/recurrences-page.js";
export { resolveRoute } from "./dev-server/routes.js";
export { renderSettingsPage } from "./dev-server/settings-page.js";
export { renderTransactionsPage } from "./dev-server/transactions-page.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const manifest = buildSolverFinWebManifest();
const solverFinLogoPng = Buffer.from(solverFinLogoPngBase64, "base64");
const solverFinLogoPaths = new Set([
  "/brand/Solverfin_02.png",
  "/icons/solverfin-192.png",
  "/icons/solverfin-512.png",
  "/icons/solverfin-maskable-512.png",
]);

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

  if (solverFinLogoPaths.has(url.pathname)) {
    response.writeHead(200, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": solverFinLogoPng.byteLength,
      "content-type": "image/png",
    });
    response.end(solverFinLogoPng);
    return;
  }

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
    sendAuthenticatedHtml(response, enhanceAccountsCardsTabs(await renderAccountsCardsPage(token)));
    return;
  }

  if (url.pathname === "/categorias" && token) {
    sendAuthenticatedHtml(response, await renderCategoriesPage(token));
    return;
  }

  if (url.pathname === "/cartoes" && token) {
    sendAuthenticatedHtml(response, await renderEnhancedCardsPage(token));
    return;
  }

  if (url.pathname === "/lancamentos" && token) {
    sendAuthenticatedHtml(response, await renderTransactionsPage(token, url));
    return;
  }

  if (url.pathname === "/pagar-receber" && token) {
    sendAuthenticatedHtml(response, await renderPayablesReceivablesPage(token));
    return;
  }

  if (url.pathname === "/recorrencias" && token) {
    sendAuthenticatedHtml(response, await renderRecurrencesPage(token));
    return;
  }

  if (url.pathname === "/inbox" && token) {
    sendAuthenticatedHtml(response, await renderInboxPage(token));
    return;
  }

  if (url.pathname === "/configuracoes" && token) {
    sendAuthenticatedHtml(response, await renderSettingsPage(token));
    return;
  }

  if ((route.kind === "dashboard" || route.kind === "placeholder") && token) {
    sendAuthenticatedHtml(response, await renderPrivatePage(url.pathname, token));
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}

function sendAuthenticatedHtml(response: ServerResponse, html: string): void {
  sendHtml(response, 200, enhanceSolverFinBrandLogo(html));
}
