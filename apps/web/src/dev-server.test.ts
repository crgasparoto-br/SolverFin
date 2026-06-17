import assert from "node:assert/strict";

import { renderDashboardPage, renderLoginPage, resolveRoute } from "./dev-server.js";

loginRouteIsRealPage();
privateRouteRedirectsWithoutSession();
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
