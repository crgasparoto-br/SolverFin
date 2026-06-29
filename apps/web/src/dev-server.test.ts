import assert from "node:assert/strict";

import {
  enhanceAccountsCardsTabs,
  enhanceSolverFinBrandLogo,
  renderLoginPage,
  resolveRoute,
} from "./dev-server.js";
import { privateRoutes } from "./dev-server/routes.js";

loginRouteIsRealPage();
loginPageKeepsOnlyCenteredLogo();
privateRouteRedirectsWithoutSession();
privateRouteAllowsSessionAndIdentifiesDashboardRoute();
accountsCardsRouteRendersMasterPage();
accountsCardsEnhancementIgnoresNonAccountsCardsHtml();
accountsCardsDirectEnhancementIsInjectedOnce();
accountsCardsAdditionalButtonUsesDirectController();
accountsCardsEditAdditionalSubmitIsCapturedDirectly();
brandEnhancementAddsLogoBesideSidebarName();
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
  assert.doesNotMatch(login, /demo@solverfin\.example\.invalid/);
}

function loginPageKeepsOnlyCenteredLogo(): void {
  const login = renderLoginPage();

  assert.match(login, /class="login-logo"/);
  assert.match(login, /src="\/brand\/Solverfin_02\.png"/);
  assert.match(login, /justify-self: center/);
  assert.doesNotMatch(login, /position:\s*(fixed|absolute)/);
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

function accountsCardsEnhancementIgnoresNonAccountsCardsHtml(): void {
  const html = "<html><body><main>Outra tela</main></body></html>";
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.equal(enhanced, html);
  assert.doesNotMatch(enhanced, /data-accounts-cards-direct-enhancement/);
}

function accountsCardsDirectEnhancementIsInjectedOnce(): void {
  const html =
    '<html><body><button data-tab="cards" aria-selected="false">Cartões</button><section data-tab-panel="accounts"></section><section data-tab-panel="cards" hidden></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);
  const enhancedAgain = enhanceAccountsCardsTabs(enhanced);

  assert.match(enhanced, /data-accounts-cards-direct-enhancement/);
  assert.equal((enhancedAgain.match(/data-accounts-cards-direct-enhancement/g) ?? []).length, 1);
  assert.match(enhanced, /installCardFormHandlers\(\)/);
  assert.match(enhanced, /form\.onsubmit = \(event\) =>/);
  assert.match(enhanced, /document\.addEventListener\("submit"/);
}

function accountsCardsAdditionalButtonUsesDirectController(): void {
  const html =
    '<html><body><dialog id="new-card-dialog"><form data-api-form data-api-path="/api/cards" class="edit-grid"><label>Identificador mascarado<input name="maskedIdentifier" placeholder="Ex.: final 9876" /></label>\n        <button type="submit">Criar cartão</button></form></dialog><section data-tab-panel="accounts"></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.match(enhanced, />\+ adicional<\/button>/);
  assert.match(enhanced, /Cartões vinculados/);
  assert.match(enhanced, /additional-card-save/);
  assert.match(enhanced, /additional-card-actions/);
  assert.match(enhanced, /additional-card-saved-list/);
  assert.match(enhanced, /cardLinksApiPath = "\/api\/card-additional-links"/);
  assert.match(enhanced, /Definir principal/);
  assert.match(enhanced, /additional-card-primary-marker/);
  assert.match(enhanced, /addAdditionalRow\(addButton\)/);
  assert.match(enhanced, /loadSavedCards\(\)/);
  assert.doesNotMatch(enhanced, /event\.defaultPrevented/);
  assert.doesNotMatch(enhanced, /\?\./);
}

function accountsCardsEditAdditionalSubmitIsCapturedDirectly(): void {
  const html =
    '<html><body><dialog id="edit-card-dialog-card-1"><form data-api-form data-api-method="PATCH" data-api-path="/api/cards/card-1" class="edit-grid"><label>Identificador mascarado<input name="maskedIdentifier" value="final 1234" placeholder="Ex.: final 9876" /></label>\n        <button type="submit">Salvar cartão</button></form></dialog><section data-tab-panel="accounts"></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.match(enhanced, /data-api-path="\/api\/cards\/card-1"/);
  assert.match(enhanced, /data-additional-card-add/);
  assert.match(enhanced, /form\.addEventListener\("submit", \(event\) =>/);
  assert.match(enhanced, /submitCardForm\(event, form\)/);
  assert.match(
    enhanced,
    /sendJson\(cardLinksApiPath, "POST", \{ groupCardId, cardId: additionalCard\.id \}\)/,
  );
  assert.match(
    enhanced,
    /status\.textContent = isEdit \? "Cartão salvo\." : "Cartão criado\. Atualizando a tela\.\.\."/,
  );
  assert.match(enhanced, /await loadSavedCards\(\)/);
  assert.match(enhanced, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(enhanced, /window\.location\.reload\(\)/);
}

function brandEnhancementAddsLogoBesideSidebarName(): void {
  const html =
    '<html><head></head><body><aside class="sidebar"><a class="brand" href="/dashboard">SolverFin</a></aside></body></html>';
  const enhanced = enhanceSolverFinBrandLogo(html);

  assert.match(enhanced, /data-solverfin-brand-logo/);
  assert.match(enhanced, /class="brand-logo"/);
  assert.match(enhanced, /src="\/brand\/Solverfin_02\.png"/);
  assert.match(enhanced, /<span>SolverFin<\/span>/);
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
