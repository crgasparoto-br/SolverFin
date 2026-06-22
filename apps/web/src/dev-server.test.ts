import assert from "node:assert/strict";

import { enhanceAccountsCardsTabs, renderLoginPage, resolveRoute } from "./dev-server.js";
import { privateRoutes } from "./dev-server/routes.js";

loginRouteIsRealPage();
privateRouteRedirectsWithoutSession();
privateRouteAllowsSessionAndIdentifiesDashboardRoute();
accountsCardsRouteRendersMasterPage();
accountsCardsTabsFallbackIsInjectedOnce();
accountsCardsDialogFallbackIsInjected();
accountsCardsAdditionalButtonUsesScriptListener();
accountsCardsEditAdditionalButtonIsInjectedAndCaptured();
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

function accountsCardsTabsFallbackIsInjectedOnce(): void {
  const html = '<html><body><button data-tab="cards" aria-selected="false">Cartões</button><section data-tab-panel="accounts"></section><section data-tab-panel="cards" hidden></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);
  const enhancedAgain = enhanceAccountsCardsTabs(enhanced);

  assert.match(enhanced, /data-accounts-cards-tabs-fallback/);
  assert.match(enhanced, /document\.addEventListener\("click"/);
  assert.match(enhanced, /activateTab\(button\.dataset\.tab\)/);
  assert.match(enhanced, /button\.tabIndex = 0/);
  assert.match(enhanced, /panel\.setAttribute\("hidden", ""\)/);
  assert.equal((enhancedAgain.match(/data-accounts-cards-tabs-fallback/g) ?? []).length, 1);
}

function accountsCardsDialogFallbackIsInjected(): void {
  const html = '<html><body><button type="button" data-open-dialog="new-account-dialog">Adicionar</button><dialog id="new-account-dialog"><form method="dialog" class="dialog-close-form"><button type="submit">Fechar</button></form></dialog><section data-tab-panel="accounts"></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.match(enhanced, /openAccountsCardsDialog/);
  assert.match(enhanced, /closeAccountsCardsDialog/);
  assert.match(enhanced, /target\.closest\("\[data-open-dialog\]"\)/);
  assert.match(enhanced, /dialog\.setAttribute\("open", ""\)/);
  assert.match(enhanced, /target\.closest\("\.dialog-close-form"\)/);
}

function accountsCardsAdditionalButtonUsesScriptListener(): void {
  const html = '<html><body><dialog id="new-card-dialog"><form data-api-form data-api-path="/api/cards" class="edit-grid"><label>Identificador mascarado<input name="maskedIdentifier" placeholder="Ex.: final 9876" /></label><button type="submit">Criar cartão</button></form></dialog><section data-tab-panel="accounts"></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.match(enhanced, /data-additional-card-add onclick="var section=this\.closest\('\.additional-card-section'\);/);
  assert.match(enhanced, />\+ adicional<\/button>/);
  assert.match(enhanced, /Cartões vinculados/);
  assert.match(enhanced, /type=&quot;submit&quot; class=&quot;additional-card-save&quot;>Salvar adicional/);
  assert.match(enhanced, /class=&quot;additional-card-actions&quot;/);
  assert.match(enhanced, /additional-card-saved-list/);
  assert.match(enhanced, /loadSavedAdditionalCards\(\)/);
  assert.match(enhanced, /fetch\("\/api\/cards\?status=all"\)/);
  assert.match(enhanced, /primaryCardStoragePrefix/);
  assert.match(enhanced, /Definir principal/);
  assert.match(enhanced, /additional-card-primary-marker/);
  assert.match(enhanced, /Nome do cartão principal \*/);
  assert.match(enhanced, /Nome do cartão adicional \*/);
  assert.match(enhanced, /document\.createElement\('div'\)/);
  assert.doesNotMatch(enhanced, /window\.__solverFinAddAdditionalCard &&/);
  assert.doesNotMatch(enhanced, /event\.defaultPrevented/);
  assert.doesNotMatch(enhanced, /\?\./);
  assert.match(enhanced, /getEventElement\(event\)/);
  assert.match(enhanced, /appendAdditionalCardRowFromButton\(addButton\)/);
}

function accountsCardsEditAdditionalButtonIsInjectedAndCaptured(): void {
  const html = '<html><body><dialog id="edit-card-dialog-card-1"><form data-api-form data-api-method="PATCH" data-api-path="/api/cards/card-1" class="edit-grid"><label>Identificador mascarado<input name="maskedIdentifier" value="final 1234" placeholder="Ex.: final 9876" /></label>\n        <button type="submit">Salvar cartão</button></form></dialog><section data-tab-panel="accounts"></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.match(enhanced, /data-api-path="\/api\/cards\/card-1"/);
  assert.match(enhanced, /data-additional-card-add onclick="var section=this\.closest\('\.additional-card-section'\);/);
  assert.match(enhanced, />\+ adicional<\/button>/);
  assert.match(enhanced, /type=&quot;submit&quot; class=&quot;additional-card-save&quot;>Salvar adicional/);
  assert.match(enhanced, /additional-card-group-row/);
  assert.match(enhanced, /isSavedAdditionalForForm\(form, card\)/);
  assert.match(enhanced, /savePrimaryCardId\(input\.groupKey, input\.card\.id\)/);
  assert.match(enhanced, /renderSavedAdditionalCards\(input\.form, input\.cards\)/);
  assert.match(enhanced, /const target = getEventElement\(event\);\n            const addButton = target \? target\.closest\("\[data-additional-card-add\]"\) : null;/);
  assert.match(enhanced, /event\.stopImmediatePropagation\(\)/);
  assert.match(enhanced, /\}, true\);/);
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
