import assert from "node:assert/strict";

import { renderDashboardPage, renderLoginPage, resolveRoute } from "./dev-server.js";

loginRouteIsRealPage();
privateRouteRedirectsWithoutSession();
privatePlaceholderRouteRequiresSessionAndRendersActiveMenu();
dashboardDoesNotRenderOnUnknownRoute();
authenticatedNavigationRendersDashboardAndMenu();

function loginRouteIsRealPage(): void {
  const login = renderLoginPage();

  assert.match(login, /Entrar no SolverFin/);
  assert.match(login, /<form id="login-form"/);
  assert.equal(login.includes("Disponibilidade de hoje"), false);
}

function privateRouteRedirectsWithoutSession(): void {
  const route = resolveRoute("/dashboard", false);

  assert.equal(route.statusCode, 302);
  assert.equal(route.location, "/login");
}

function privatePlaceholderRouteRequiresSessionAndRendersActiveMenu(): void {
  const anonymousRoute = resolveRoute("/contas", false);

  assert.equal(anonymousRoute.statusCode, 302);
  assert.equal(anonymousRoute.location, "/login");

  const authenticatedRoute = resolveRoute("/contas", true);
  const page = renderDashboardPage("/contas");

  assert.equal(authenticatedRoute.statusCode, 200);
  assert.equal(authenticatedRoute.kind, "placeholder");
  assert.match(page, /Funcionalidade em preparacao/);
  assert.match(page, /<h1>Contas<\/h1>/);
  assert.match(page, /href="\/contas" aria-current="page"/);
}

function dashboardDoesNotRenderOnUnknownRoute(): void {
  const route = resolveRoute("/rota-inexistente", true);

  assert.equal(route.statusCode, 404);
  assert.equal(route.kind, "not-found");
}

function authenticatedNavigationRendersDashboardAndMenu(): void {
  const route = resolveRoute("/", true);
  const dashboard = renderDashboardPage("/dashboard");

  assert.equal(route.location, "/dashboard");
  assert.match(dashboard, /Resumo financeiro inicial/);
  assert.match(dashboard, /Pessoal Demo/);
  assert.match(dashboard, /href="\/lancamentos"/);
  assert.match(dashboard, /data-logout/);
}
