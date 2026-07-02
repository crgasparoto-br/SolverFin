import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { financialInstitutionCatalog } from "@solverfin/domain";

import { enhanceAccountsCardsTabs, renderLoginPage, resolveRoute } from "./dev-server.js";
import { institutions, renderInstitutionIcon } from "./dev-server/institutions.js";
import { privateRoutes } from "./dev-server/routes.js";
import { renderAuthenticatedShell } from "./dev-server/shell.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

loginRouteIsRealPage();
privateRouteRedirectsWithoutSession();
privateRouteAllowsSessionAndIdentifiesDashboardRoute();
accountsCardsRouteRendersMasterPage();
adminInstitutionsRouteRequiresSessionButStaysOutOfCommonMenu();
accountsCardsEnhancementIgnoresNonAccountsCardsHtml();
accountsCardsDirectEnhancementIsInjectedOnce();
accountsCardsAdditionalButtonUsesDirectController();
accountsCardsEditAdditionalSubmitIsCapturedDirectly();
accountAndCardInstitutionSelectsUseGlobalCatalog();
institutionIconsUseExplicitLogoSources();
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

function adminInstitutionsRouteRequiresSessionButStaysOutOfCommonMenu(): void {
  const anonymousRoute = resolveRoute("/admin/instituicoes", false);

  assert.equal(anonymousRoute.statusCode, 302);
  assert.equal(anonymousRoute.location, "/login");

  const authenticatedRoute = resolveRoute("/admin/instituicoes", true);

  assert.equal(authenticatedRoute.statusCode, 200);
  assert.equal(authenticatedRoute.kind, "placeholder");
  assert.equal(privateRoutes.has("/admin/instituicoes"), false);

  const commonShell = renderAuthenticatedShell({
    activePathname: "/dashboard",
    content: "<p>Dashboard</p>",
    currentLabel: "Dashboard",
  });
  const masterShell = renderAuthenticatedShell({
    activePathname: "/admin/instituicoes",
    content: "<p>Admin</p>",
    currentLabel: "Admin - Instituições",
    showAdminNavigation: true,
  });

  assert.doesNotMatch(commonShell, /Admin - Instituições/);
  assert.match(masterShell, /Admin - Instituições/);
  assert.match(masterShell, /\/admin\/instituicoes/);
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

function accountAndCardInstitutionSelectsUseGlobalCatalog(): void {
  const expectedKeys = [
    "",
    ...[...financialInstitutionCatalog]
      .filter((institution) => institution.status === "active")
      .sort((first, second) => first.label.localeCompare(second.label, "pt-BR"))
      .map((institution) => institution.key),
  ];

  assert.deepEqual(
    institutions.map((institution) => institution.key),
    expectedKeys,
  );

  for (const catalogInstitution of financialInstitutionCatalog) {
    const webInstitution = institutions.find(
      (institution) => institution.key === catalogInstitution.key,
    );

    assert.equal(webInstitution?.label, catalogInstitution.label);
    assert.equal(webInstitution?.shortLabel, catalogInstitution.fallbackLabel);
  }

  const accountsCardsPageSource = readFileSync(
    path.join(repoRoot, "apps", "web", "src", "dev-server", "accounts-cards-page.ts"),
    "utf8",
  );

  assert.match(
    accountsCardsPageSource,
    /import \{ findInstitution, institutions, renderInstitutionIcon \} from "\.\/institutions\.js";/,
  );
  assert.match(accountsCardsPageSource, /<div class="identity-mark">\$\{renderInstitutionIcon/);
  assert.doesNotMatch(
    accountsCardsPageSource,
    /<div class="identity-mark" aria-hidden="true">\$\{renderInstitutionIcon/,
  );
}

function institutionIconsUseExplicitLogoSources(): void {
  for (const institution of institutions) {
    const icon = renderInstitutionIcon(institution.key);

    assert.doesNotMatch(icon, /logo\.clearbit\.com/);
    assert.doesNotMatch(icon, /https?:\/\/.*logo/i);
    assert.match(icon, /institution-badge-icon/);
    assert.match(icon, new RegExp(`>${institution.shortLabel}<`));
  }

  const bradescoIcon = renderInstitutionIcon("bradesco");

  assert.match(bradescoIcon, /<img\b/);
  assert.match(bradescoIcon, /alt="Logo Bradesco"/);
  assert.match(bradescoIcon, /width="44" height="44"/);
  assert.match(bradescoIcon, /decoding="async"/);
  assert.match(bradescoIcon, /data-logo-source="local"/);
  assert.match(bradescoIcon, /\/images\/institutions\/bradesco\.png/);
  assert.match(renderInstitutionIcon("inter"), /\/images\/institutions\/inter\.png/);
  assert.match(renderInstitutionIcon("c6"), />C6</);
  assert.doesNotMatch(renderInstitutionIcon("c6"), /<img\b/);
  assert.match(renderInstitutionIcon("nubank"), />NU</);
  assert.doesNotMatch(renderInstitutionIcon("nubank"), /<img\b/);
  assert.match(renderInstitutionIcon("legacy_bank"), />LB</);
  assert.match(renderInstitutionIcon("porto_bank"), /\/images\/institutions\/porto-bank\.svg/);
  assert.match(renderInstitutionIcon("bradesco"), />BR</);
  assert.match(renderInstitutionIcon("bradesco"), /aria-hidden="true"/);
  assert.match(renderInstitutionIcon("bradesco"), /removeAttribute\('aria-hidden'\)/);

  for (const institution of financialInstitutionCatalog) {
    if (institution.logoAssetPath === undefined) continue;

    assert.match(institution.logoAssetPath, /^\/images\/institutions\/[a-z0-9-]+\.(png|svg|webp)$/);
    assertLocalInstitutionLogo(institution.logoAssetPath);
  }
}

function assertLocalInstitutionLogo(src: string): void {
  assert.doesNotMatch(src, /^https?:\/\//);

  const filePath = path.join(repoRoot, "apps", "web", "public", src);
  assert.equal(existsSync(filePath), true, `${src} must exist`);

  const bytes = readFileSync(filePath);
  if (src.endsWith(".png")) {
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    return;
  }

  if (src.endsWith(".svg")) {
    const svg = bytes.subarray(0, 200).toString("utf8");
    assert.match(svg, /<svg\b/i);
    assert.doesNotMatch(svg, /<script\b/i);
    return;
  }

  if (src.endsWith(".webp")) {
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
    return;
  }

  assert.fail(`${src} must use png, svg or webp`);
}

function legacyAccountsRouteDoesNotAppearAsPrivateRoute(): void {
  const authenticatedRoute = resolveRoute("/contas", true);

  assert.equal(authenticatedRoute.statusCode, 404);
  assert.equal(privateRoutes.has("/contas"), false);
}

function sidebarMenuUsesPtBrLabels(): void {
  assert.equal(privateRoutes.get("/lancamentos"), "Extrato da conta");
  assert.equal(privateRoutes.has("/recorrencias"), false);
  assert.equal(privateRoutes.has("/pagar-receber"), false);
  assert.equal(privateRoutes.get("/contas-cartoes"), "Contas e Cartões");
  assert.equal(privateRoutes.has("/contas"), false);
  assert.equal(
    Array.from(privateRoutes.values()).filter((label) => label === "Contas e Cartões").length,
    1,
  );
  assert.equal(privateRoutes.get("/cartoes"), "Cartões de Crédito");
  assert.equal(privateRoutes.get("/orcamentos"), "Orçamentos");
  assert.equal(privateRoutes.get("/relatorios"), "Relatórios");
  assert.equal(privateRoutes.get("/configuracoes"), "Configurações");
  assert.equal(privateRoutes.has("/admin/instituicoes"), false);
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
