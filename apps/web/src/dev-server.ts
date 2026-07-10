import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { renderAdminInstitutionsPage } from "./dev-server/admin-institutions-page.js";
import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
import { apiGet, handleApiRequest } from "./dev-server/api.js";
import { renderCardsPage } from "./dev-server/cards-page.js";
import { renderCategoriesPage } from "./dev-server/categories-page.js";
import { renderDashboardPage } from "./dev-server/dashboard-page.js";
import { sendHtml, sendJson } from "./dev-server/http.js";
import { renderInboxPage } from "./dev-server/inbox-page.js";
import { renderLoginPage } from "./dev-server/login-page.js";
import { renderNotFoundPage, renderPrivatePage } from "./dev-server/pages.js";
import { resolvePasswordResetUrl } from "./dev-server/password-reset.js";
import { renderReportsPage } from "./dev-server/reports-page.js";
import { resolveRoute } from "./dev-server/routes.js";
import { getSessionTokenFromRequest } from "./dev-server/session.js";
import { renderSettingsPage } from "./dev-server/settings-page.js";
import { tryServeStaticAsset } from "./dev-server/static-assets.js";
import { renderTransactionsPage } from "./dev-server/transactions-page.js";

export { renderAdminInstitutionsPage } from "./dev-server/admin-institutions-page.js";
export { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
export { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
export { renderAccountsPage, renderBudgetsPage } from "./dev-server/pages.js";
export { renderCardsPage } from "./dev-server/cards-page.js";
export { renderCategoriesPage } from "./dev-server/categories-page.js";
export { renderDashboardPage } from "./dev-server/dashboard-page.js";
export { renderInboxPage } from "./dev-server/inbox-page.js";
export { renderLoginPage } from "./dev-server/login-page.js";
export { renderReportsPage } from "./dev-server/reports-page.js";
export { resolveRoute } from "./dev-server/routes.js";
export { renderSettingsPage } from "./dev-server/settings-page.js";
export { renderTransactionsPage } from "./dev-server/transactions-page.js";

interface StatementAccountRecord {
  id: string;
  status: string;
}

interface StatementRecurrenceRecord {
  id: string;
  status: string;
}

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
const passwordResetUrl = resolvePasswordResetUrl();
const monthPattern = /^\d{4}-\d{2}$/;
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
    sendHtml(
      response,
      200,
      renderLoginPage(url.searchParams.get("erro") ?? undefined, passwordResetUrl),
    );
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
    await materializeAccountStatementRecurrences(token, url);
    sendHtml(response, 200, await renderTransactionsPage(token, url));
    return;
  }

  if (url.pathname === "/inbox" && token) {
    sendHtml(response, 200, await renderInboxPage(token));
    return;
  }

  if (url.pathname === "/relatorios" && token) {
    sendHtml(response, 200, await renderReportsPage(token, url));
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

export async function materializeAccountStatementRecurrences(
  token: string,
  url: URL,
): Promise<void> {
  const month = resolveStatementMonth(url);

  if (month === undefined) {
    return;
  }

  const accountsResult = await apiGet<{ accounts: StatementAccountRecord[] }>(
    token,
    "/api/accounts",
  );

  if (!accountsResult.ok) {
    return;
  }

  const accountId =
    url.searchParams.get("accountId") ??
    accountsResult.data.accounts.find((account) => account.status === "active")?.id;

  if (!accountId) {
    return;
  }

  const recurrencesResult = await apiGet<{ recurrences: StatementRecurrenceRecord[] }>(
    token,
    `/api/recurrences?${new URLSearchParams({ accountId, status: "all" }).toString()}`,
  );

  if (!recurrencesResult.ok) {
    return;
  }

  const through = monthToLastDay(month);
  const activeRecurrences = recurrencesResult.data.recurrences.filter(
    (recurrence) => recurrence.status === "active",
  );

  await Promise.all(
    activeRecurrences.map((recurrence) =>
      fetch(
        `${apiBaseUrl}/api/recurrences/${encodeURIComponent(recurrence.id)}/generate-installments`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ through }),
        },
      ).catch(() => undefined),
    ),
  );
}

function resolveStatementMonth(url: URL): string | undefined {
  const requestedMonth = url.searchParams.get("month");

  if (monthPattern.test(requestedMonth ?? "")) {
    return requestedMonth ?? undefined;
  }

  const startsOnMonth = url.searchParams.get("startsOn")?.slice(0, 7);

  if (monthPattern.test(startsOnMonth ?? "")) {
    return startsOnMonth;
  }

  return new Date().toISOString().slice(0, 7);
}

function monthToLastDay(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;

  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}
