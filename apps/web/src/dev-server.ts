import "./load-env.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { assertExplicitRuntimeEnvironment } from "@solverfin/shared";

import { buildSolverFinWebManifest } from "./pwa/manifest.js";
import { enhanceAccountRemunerationDisclosure } from "./dev-server/account-remuneration-disclosure-enhancement.js";
import { renderAccountRemunerationPage } from "./dev-server/account-remuneration-page.js";
import { renderAdminFinancialIndexesPage } from "./dev-server/admin-financial-indexes-page.js";
import { renderAdminInstitutionsPage } from "./dev-server/admin-institutions-page.js";
import { enhanceAccountsCardsActionMenus } from "./dev-server/accounts-cards-action-menu-enhancement.js";
import { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
import { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
import { standardizeAccountsCardsPage } from "./dev-server/accounts-cards-standardization.js";
import { apiGet, handleApiRequest } from "./dev-server/api.js";
import { enhanceCardInstrumentSubtotals } from "./dev-server/card-instrument-subtotals-enhancement.js";
import { finalizeCardsInterface } from "./dev-server/cards-interface-finalizer.js";
import { enhanceCardsInterface } from "./dev-server/cards-interface-enhancement.js";
import { renderCardsPageWithMonthNavigation } from "./dev-server/cards-page-month-navigation.js";
import { enhanceCategoriesIconsAndTooltips } from "./dev-server/categories-icons-enhancement.js";
import { renderCategoriesPage } from "./dev-server/categories-page.js";
import { renderDashboardPage } from "./dev-server/dashboard-page.js";
import { sendHtml, sendJson } from "./dev-server/http.js";
import { enhanceInboxListLayout } from "./dev-server/inbox-list-layout-enhancement.js";
import { renderInboxPage } from "./dev-server/inbox-page.js";
import { enhanceInboxWithStructuredPayloads } from "./dev-server/inbox-structured-payload-enhancement.js";
import {
  enhanceCardListSorting,
  enhanceStatementListSorting,
} from "./dev-server/list-sorting-enhancement.js";
import { renderLoginPage } from "./dev-server/login-page.js";
import { renderNotFoundPage, renderPrivatePage } from "./dev-server/pages.js";
import { resolvePasswordResetUrl } from "./dev-server/password-reset.js";
import {
  materializeAccountStatementRecurrences,
  materializeCardInvoiceRecurrences,
  renderRecurrenceMaterializationGate,
  requiresRecurrenceMaterialization,
} from "./dev-server/recurrence-materialization.js";
import { resolveReportsCanonicalLocation } from "./dev-server/reports-canonical-location.js";
import { renderReportsRoutePage } from "./dev-server/reports-route-page.js";
import { resolveRoute } from "./dev-server/routes.js";
import {
  clearApiSessionCookies,
  clearSessionCookie,
  getSessionCredentialFromRequest,
} from "./dev-server/session.js";
import { renderSettingsPage } from "./dev-server/settings-page.js";
import { tryServeStaticAsset } from "./dev-server/static-assets.js";
import { renderTransactionsPage } from "./dev-server/transactions-page.js";

export { renderAccountRemunerationPage } from "./dev-server/account-remuneration-page.js";
export { renderAdminFinancialIndexesPage } from "./dev-server/admin-financial-indexes-page.js";
export { renderAdminInstitutionsPage } from "./dev-server/admin-institutions-page.js";
export { enhanceAccountsCardsActionMenus } from "./dev-server/accounts-cards-action-menu-enhancement.js";
export { enhanceAccountsCardsTabs } from "./dev-server/accounts-cards-enhancement.js";
export { renderAccountsCardsPage } from "./dev-server/accounts-cards-page.js";
export { standardizeAccountsCardsPage } from "./dev-server/accounts-cards-standardization.js";
export { enhanceCategoriesIconsAndTooltips } from "./dev-server/categories-icons-enhancement.js";
export { renderAccountsPage, renderBudgetsPage } from "./dev-server/pages.js";
export { renderCardsPage } from "./dev-server/cards-page.js";
export { renderCategoriesPage } from "./dev-server/categories-page.js";
export { renderDashboardPage } from "./dev-server/dashboard-page.js";
export { enhanceInboxListLayout } from "./dev-server/inbox-list-layout-enhancement.js";
export { renderInboxPage } from "./dev-server/inbox-page.js";
export { renderLoginPage } from "./dev-server/login-page.js";
export {
  materializeAccountStatementRecurrences,
  materializeCardInvoiceRecurrences,
  renderRecurrenceMaterializationGate,
  requiresRecurrenceMaterialization,
} from "./dev-server/recurrence-materialization.js";
export { renderReportsPage } from "./dev-server/reports-page.js";
export { renderReportsRoutePage } from "./dev-server/reports-route-page.js";
export { resolveRoute } from "./dev-server/routes.js";
export { renderSettingsPage } from "./dev-server/settings-page.js";
export { renderTransactionsPage } from "./dev-server/transactions-page.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const passwordResetUrl = resolvePasswordResetUrl();
const manifest = buildSolverFinWebManifest();

export function createSolverFinWebServer() {
  return createServer((request, response) => {
    void handleRequest(request, response);
  });
}

const server = createSolverFinWebServer();

if (process.argv[1]?.endsWith("dev-server.js") === true) {
  assertExplicitRuntimeEnvironment(process.env);
  server.listen(port, host, () => {
    console.log(
      `SolverFin web dev server running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
    );
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const token = getSessionCredentialFromRequest(request);

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

  if (url.pathname === "/login" && url.searchParams.get("auth") === "complete") {
    await handleOidcCompletion(response, url, token);
    return;
  }

  const route = resolveRoute(url.pathname, token !== undefined);

  if (token && route.kind !== "not-found" && shouldValidateProductivePageSession()) {
    const session = await apiGet<{ user: { id: string } }>(token, "/api/me");
    if (!session.ok) {
      response.writeHead(302, {
        location: "/login?erro=sessao",
        "cache-control": "no-store",
        "set-cookie": [...clearApiSessionCookies(), clearSessionCookie()],
      });
      response.end();
      return;
    }
  }

  if (route.statusCode === 302 && route.location) {
    response.writeHead(302, { location: route.location });
    response.end();
    return;
  }

  if (route.kind === "login") {
    sendHtml(
      response,
      200,
      renderLoginPage(url.searchParams.get("erro") ?? undefined, passwordResetUrl, {
        productiveOidc: isProductiveWebAuthEnabled(),
      }),
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

  if (url.pathname === "/admin/indices-financeiros" && token) {
    sendHtml(response, 200, await renderAdminFinancialIndexesPage(token));
    return;
  }

  if (url.pathname === "/contas-cartoes" && token) {
    const html = enhanceAccountsCardsTabs(await renderAccountsCardsPage(token));
    const standardizedHtml = standardizeAccountsCardsPage(html);
    sendHtml(response, 200, enhanceAccountsCardsActionMenus(standardizedHtml));
    return;
  }

  if (url.pathname === "/remuneracao-contas" && token) {
    sendHtml(response, 200, await renderAccountRemunerationPage(token));
    return;
  }

  if (url.pathname === "/categorias" && token) {
    sendHtml(response, 200, enhanceCategoriesIconsAndTooltips(await renderCategoriesPage(token)));
    return;
  }

  if (url.pathname === "/cartoes" && token) {
    if (shouldUseProductiveRecurrenceGate() && requiresRecurrenceMaterialization(url)) {
      sendHtml(response, 200, renderRecurrenceMaterializationGate("card", url));
      return;
    }

    if (shouldUseLocalRecurrenceAdapter()) {
      await materializeLocally("card", token, url);
    }

    const html = await renderCardsPageWithMonthNavigation(token, url);
    const sortedHtml = enhanceCardListSorting(html, url);
    const groupedHtml = enhanceCardInstrumentSubtotals(sortedHtml);
    const enhancedHtml = enhanceCardsInterface(groupedHtml);
    sendHtml(response, 200, finalizeCardsInterface(enhancedHtml));
    return;
  }

  if (url.pathname === "/lancamentos" && token) {
    if (shouldUseProductiveRecurrenceGate() && requiresRecurrenceMaterialization(url)) {
      sendHtml(response, 200, renderRecurrenceMaterializationGate("account", url));
      return;
    }

    if (shouldUseLocalRecurrenceAdapter()) {
      await materializeLocally("account", token, url);
    }

    const html = await renderTransactionsPage(token, url);
    const sortedHtml = enhanceStatementListSorting(html, url);
    sendHtml(response, 200, enhanceAccountRemunerationDisclosure(sortedHtml));
    return;
  }

  if (url.pathname === "/inbox" && token) {
    const html = await enhanceInboxWithStructuredPayloads(await renderInboxPage(token), token);
    sendHtml(response, 200, enhanceInboxListLayout(html, url));
    return;
  }

  if (url.pathname === "/relatorios" && token) {
    const canonicalLocation = resolveReportsCanonicalLocation(url);
    if (canonicalLocation) {
      response.writeHead(302, { location: canonicalLocation });
      response.end();
      return;
    }

    sendHtml(response, 200, await renderReportsRoutePage(token, url));
    return;
  }

  if (url.pathname === "/configuracoes" && token) {
    sendHtml(response, 200, await renderSettingsPage(token, url));
    return;
  }

  if (route.kind === "placeholder" && token) {
    sendHtml(response, 200, await renderPrivatePage(url.pathname, token));
    return;
  }

  sendHtml(response, 404, renderNotFoundPage());
}

async function handleOidcCompletion(
  response: ServerResponse,
  url: URL,
  credential: string | undefined,
): Promise<void> {
  const returnTo = validateInternalReturnTo(url.searchParams.get("returnTo"));

  if (!returnTo || !credential) {
    sendHtml(
      response,
      200,
      renderLoginPage("cookie-unavailable", passwordResetUrl, {
        productiveOidc: true,
      }),
    );
    return;
  }

  const session = await apiGet<{ user: { id: string } }>(credential, "/api/me");
  if (!session.ok) {
    response.setHeader("set-cookie", [...clearApiSessionCookies(), clearSessionCookie()]);
    sendHtml(
      response,
      200,
      renderLoginPage("cookie-unavailable", passwordResetUrl, {
        productiveOidc: true,
      }),
    );
    return;
  }

  response.writeHead(303, { location: returnTo, "cache-control": "no-store" });
  response.end();
}

async function materializeLocally(
  surface: "account" | "card",
  credential: string,
  url: URL,
): Promise<void> {
  try {
    if (surface === "card") {
      await materializeCardInvoiceRecurrences(credential, url, process.env.APP_ORIGIN);
    } else {
      await materializeAccountStatementRecurrences(credential, url, process.env.APP_ORIGIN);
    }
  } catch (error) {
    console.error("Local recurrence materialization failed", {
      surface,
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "unknown",
    });
  }
}

function shouldValidateProductivePageSession(): boolean {
  return (
    process.env.NODE_ENV?.trim().toLowerCase() === "production" &&
    process.env.AUTH_ALLOW_DEMO?.trim().toLowerCase() !== "true" &&
    process.env.SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION !== "1"
  );
}

function shouldUseProductiveRecurrenceGate(): boolean {
  return process.env.NODE_ENV?.trim().toLowerCase() === "production";
}

function shouldUseLocalRecurrenceAdapter(): boolean {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  return (
    process.env.SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION !== "1" &&
    (nodeEnv === "development" || nodeEnv === "local" || nodeEnv === "test")
  );
}

function validateInternalReturnTo(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (
    !normalized ||
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("#") ||
    normalized.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    return undefined;
  }

  const parsed = new URL(normalized, "https://solverfin.invalid");
  if (parsed.origin !== "https://solverfin.invalid" || parsed.username || parsed.password) {
    return undefined;
  }

  return `${parsed.pathname}${parsed.search}`;
}

function isProductiveWebAuthEnabled(): boolean {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (!nodeEnv || nodeEnv === "development" || nodeEnv === "local" || nodeEnv === "test") {
    return false;
  }

  return Boolean(
    process.env.OIDC_ISSUER_URL &&
    process.env.OIDC_CLIENT_ID &&
    process.env.OIDC_AUTHORIZATION_URL &&
    process.env.OIDC_TOKEN_URL &&
    process.env.OIDC_REDIRECT_URI,
  );
}
