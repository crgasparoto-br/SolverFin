import assert from "node:assert/strict";

import { renderLoginPage, resolveRoute } from "./dev-server.js";
import { privateRoutes } from "./dev-server/routes.js";

loginRouteIsRealPage();
privateRouteRedirectsWithoutSession();
privateRouteAllowsSessionAndIdentifiesDashboardRoute();
accountsCardsRouteRendersMasterPage();
legacyAccountsRouteDoesNotAppearAsPrivateRoute();
sidebarMenuUsesPtBrLabels();
dashboardDoesNotRenderOnUnknownRoute();
rootRouteRedirectsBasedOnSession();

function loginRouteIsRealPage(): void {
  const login = renderLoginPage();

  assert.match(login, /Entrar no SolverFin/);
  assert.match(login, /<form id="login-form"/);
  assert.match(login, /Criar usuário/);
  assert.match(login, /<form id="register-form"/);
  assert.match(login, /\/api\/users/);
}

function privateRouteRedirectsWithoutSession(): void {
  const route = resolveRoute("/dashboard", false);

  assert.equal(route.statusCode, 302);
  assert.equal(route.location, "/login");
}

function privateRouteAllowsSessionAndIdentifiesDashboardRoute(): void {
  const anonymousRoute = resolveRoute("/categorias", false);

  assert.equal(anonymousRoute.statusCode, 302);
  assert.equal(anonymousRoute.location, "/login");

  const authenticatedRoute = resolveRoute("/categorias", true);

  assert.equal(authenticatedRoute.statusCode, 200);
  assert.equal(authenticatedRoute.kind, "placeholder");
}

function accountsCardsRouteRendersMasterPage(): void {
  const anonymousRoute = resolveRoute("/contas-cartoes", false);

  assert.equal(anonymousRoute.statusCode, 302);
  assert.equal(anonymousRoute.location, "/login");

  const authenticatedRoute = resolveRoute("/contas-cartoes", true);

  assert.equal(authenticatedRoute.statusCode, 200);
  assert.equal(authenticatedRoute.kind, "placeholder");
}

function legacyAccountsRouteDoesNotAppearAsPrivateRoute(): void {
  const authenticatedRoute = resolveRoute("/contas", true);

  assert.equal(authenticatedRoute.statusCode, 404);
  assert.equal(privateRoutes.has("/contas"), false);
}

function sidebarMenuUsesPtBrLabels(): void {
  assert.equal(privateRoutes.get("/lancamentos"), "Extrato da conta");
  assert.equal(privateRoutes.get("/recorrencias"), "Recorrências");
  assert.equal(privateRoutes.get("/pagar-receber"), "Pagar e receber");
  assert.equal(privateRoutes.get("/contas-cartoes"), "Contas e Cartões");
  assert.equal(privateRoutes.has("/contas"), false);
  assert.equal(
    Array.from(privateRoutes.values()).filter((label) => label === "Contas e Cartões").length,
    1,
  );
  assert.equal(privateRoutes.get("/cartoes"), "Cartões");
  assert.equal(privateRoutes.get("/orcamentos"), "Orçamentos");
  assert.equal(privateRoutes.get("/relatorios"), "Relatórios");
  assert.equal(privateRoutes.get("/configuracoes"), "Configurações");
}

function dashboardDoesNotRenderOnUnknownRoute(): void {
  const route = resolveRoute("/rota-inexistente", true);

  assert.equal(route.statusCode, 404);
  assert.equal(route.kind, "not-found");
}

function rootRouteRedirectsBasedOnSession(): void {
  const authenticated = resolveRoute("/", true);
  const anonymous = resolveRoute("/", false);

  assert.equal(authenticated.location, "/dashboard");
  assert.equal(anonymous.location, "/login");
}
