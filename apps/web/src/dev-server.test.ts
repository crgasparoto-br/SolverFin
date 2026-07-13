import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { financialInstitutionCatalog } from "@solverfin/domain";

import {
  enhanceAccountsCardsTabs,
  renderAccountsCardsPage,
  renderLoginPage,
  resolveRoute,
} from "./dev-server.js";
import { institutions, renderInstitutionIcon } from "./dev-server/institutions.js";
import { privateRoutes } from "./dev-server/routes.js";
import { renderAuthenticatedShell } from "./dev-server/shell.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

loginRouteIsRealPage();
privateRouteRedirectsWithoutSession();
privateRouteAllowsSessionAndIdentifiesDashboardRoute();
accountsCardsRouteRendersMasterPage();
await accountsCardsPageRendersCreditCardAccountsWithNestedInstruments();
adminInstitutionsRouteRequiresSessionButStaysOutOfCommonMenu();
accountsCardsEnhancementIgnoresNonAccountsCardsHtml();
accountsCardsDirectEnhancementIsInjectedOnce();
accountsCardsEnhancementKeepsOnlyActiveFilter();
accountsCardsPageDoesNotFetchRetiredLinks();
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

async function accountsCardsPageRendersCreditCardAccountsWithNestedInstruments(): Promise<void> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);

    if (url.endsWith("/api/accounts?status=all")) {
      return jsonResponse({
        accounts: [
          {
            id: "account-main",
            name: "Conta pagamento",
            kind: "checking",
            status: "active",
            openingBalanceMinor: 0,
            currency: "BRL",
            institutionKey: "c6",
          },
        ],
      });
    }

    if (url.endsWith("/api/credit-card-accounts?status=all")) {
      return jsonResponse({
        creditCardAccounts: [
          {
            id: "card-c6",
            name: "Cartão C6",
            status: "active",
            closingDay: 20,
            dueDay: 10,
            creditLimitMinor: 500_000,
            institutionKey: "c6",
            brandKey: "mastercard",
            paymentAccountId: "account-main",
            instruments: [
              {
                id: "instrument-physical",
                type: "physical",
                holder: "primary",
                status: "active",
                isDefault: true,
                name: "Físico titular",
                maskedIdentifier: "**** 1111",
                creditLimitMinor: 300_000,
              },
              {
                id: "instrument-virtual",
                type: "virtual",
                holder: "additional",
                status: "active",
                isDefault: false,
                name: "Virtual adicional",
                maskedIdentifier: "**** 2222",
                creditLimitMinor: 100_000,
              },
            ],
          },
          {
            id: "card-blocked",
            name: "Cartão bloqueado",
            status: "blocked",
            closingDay: 5,
            dueDay: 15,
            creditLimitMinor: 200_000,
            institutionKey: "nubank",
            brandKey: "visa",
            paymentAccountId: "account-main",
            instruments: [
              {
                id: "instrument-archived",
                type: "virtual",
                holder: "primary",
                status: "archived",
                isDefault: false,
                name: "Virtual antigo",
                maskedIdentifier: "**** 9999",
                creditLimitMinor: 50_000,
              },
            ],
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const html = await renderAccountsCardsPage("session-token");

    assert.match(html, /Cartão C6/);
    assert.match(html, /Cartões de crédito <span>2<\/span>/);
    assert.match(html, /Conta de pagamento: Conta pagamento · 2 instrumentos ativos/);
    assert.match(html, /aria-label="Instrumentos de Cartão C6"/);
    assert.match(html, /Físico titular/);
    assert.match(html, /Físico · Titular principal · \*\*\*\* 1111 · limite/);
    assert.match(html, /3\.000,00/);
    assert.match(html, /Virtual adicional/);
    assert.match(html, /Virtual · Adicional · \*\*\*\* 2222 · limite/);
    assert.match(html, /1\.000,00/);
    assert.match(html, />Default<\/span>/);
    assert.match(html, /aria-label="Adicionar instrumento em Cartão C6"/);
    assert.match(html, /data-open-dialog="new-card-instrument-dialog-card-c6"/);
    assert.match(html, /data-api-path="\/api\/credit-card-accounts\/card-c6\/instruments"/);
    assert.match(html, /<label>Tipo<select name="type" required>/);
    assert.match(html, /<label>Titularidade<select name="holder" required>/);
    assert.match(
      html,
      /<button type="submit" title="Criar novo instrumento">[\s\S]*?Criar instrumento<\/button>/,
    );
    assert.match(html, /aria-label="Editar instrumento Físico titular"/);
    assert.match(html, /aria-label="Editar instrumento Virtual adicional"/);
    assert.match(html, /data-api-path="\/api\/credit-card-instruments\/instrument-physical"/);
    assert.match(html, /data-api-path="\/api\/credit-card-instruments\/instrument-virtual"/);
    assert.match(
      html,
      /<button type="submit" title="Salvar alterações do instrumento">[\s\S]*?Salvar instrumento<\/button>/,
    );
    assert.equal(
      (html.match(/\/api\/credit-card-accounts\/card-c6\/default-instrument/g) ?? []).length,
      1,
    );
    assert.match(html, /name="instrumentId" value="instrument-virtual"/);
    assert.match(html, /aria-label="Definir Virtual adicional como default"/);
    assert.match(
      html,
      /data-api-path="\/api\/credit-card-instruments\/instrument-physical\/archive"/,
    );
    assert.match(
      html,
      /data-api-path="\/api\/credit-card-instruments\/instrument-virtual\/archive"/,
    );
    assert.match(html, /aria-label="Arquivar Físico titular"/);
    assert.match(html, /aria-label="Arquivar Virtual adicional"/);
    assert.match(html, /Cartão bloqueado/);
    assert.match(html, />Bloqueado<\/span>/);
    assert.match(html, /Conta de pagamento: Conta pagamento · 0 instrumentos ativos/);
    assert.match(
      html,
      /Sem instrumento ativo para novos lançamentos\. Cadastre um novo instrumento para voltar a usar este cartão\./,
    );
    assert.match(html, /Virtual antigo/);
    assert.match(html, /Virtual · Titular principal · \*\*\*\* 9999 · limite/);
    assert.match(html, /500,00/);
    assert.match(html, /aria-label="Adicionar instrumento em Cartão bloqueado"/);
    assert.match(html, /data-open-dialog="new-card-instrument-dialog-card-blocked"/);
    assert.match(html, /data-api-path="\/api\/credit-card-accounts\/card-blocked\/instruments"/);
    assert.match(html, /aria-label="Editar instrumento Virtual antigo"/);
    assert.doesNotMatch(html, /Definir Virtual antigo como default/);
    assert.doesNotMatch(html, /Arquivar Virtual antigo/);
    assert.match(html, /data-api-path="\/api\/credit-card-accounts"/);
    assert.match(html, /data-payload-kind="credit-card-account"/);
    assert.match(html, /data-api-path="\/api\/credit-card-accounts\/card-c6\/archive"/);
    assert.doesNotMatch(html, /data-api-path="\/api\/cards"/);
    assert.doesNotMatch(html, /\/api\/card-additional-links/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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

  assert.doesNotMatch(commonShell, /<a[^>]+href="\/admin\/instituicoes"/);
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
  assert.match(enhanced, /activeFilterStorageKey/);
  assert.match(enhanced, /wireActiveFilter\(\)/);
  assert.doesNotMatch(enhanced, /card-additional-links/);
  assert.doesNotMatch(enhanced, /installCardFormHandlers/);
}

function accountsCardsEnhancementKeepsOnlyActiveFilter(): void {
  const html =
    '<html><body><div class="master-actions" aria-label="Ações principais">\n          <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>\n        </div>\n        <div class="filter-row">\n          <label>Status\n            <select data-master-status>\n              <option value="all">Todos</option>\n              <option value="active">Ativos</option>\n              <option value="inactive">Inativos</option>\n            </select>\n          </label>\n        </div><dialog id="new-card-dialog"><form data-api-form data-api-path="/api/cards" class="edit-grid"><label>Identificador<input name="maskedIdentifier" /></label>\n        <button type="submit">Criar cartão</button></form></dialog><section data-tab-panel="accounts"></section></body></html>';
  const enhanced = enhanceAccountsCardsTabs(html);

  assert.match(enhanced, /active-filter-switch/);
  assert.match(enhanced, /Exibir apenas ativos/);
  assert.doesNotMatch(enhanced, /data-master-status/);
  assert.doesNotMatch(enhanced, /Cartões vinculados/);
  assert.doesNotMatch(enhanced, /data-additional-card-add/);
  assert.doesNotMatch(enhanced, /additional-card-save/);
  assert.doesNotMatch(enhanced, /cardLinksApiPath/);
  assert.doesNotMatch(enhanced, /\/api\/card-additional-links/);
  assert.doesNotMatch(enhanced, /Definir principal/);
}

function accountsCardsPageDoesNotFetchRetiredLinks(): void {
  const accountsCardsPageSource = readFileSync(
    path.join(repoRoot, "apps", "web", "src", "dev-server", "accounts-cards-page.ts"),
    "utf8",
  );

  assert.match(accountsCardsPageSource, /\/api\/credit-card-accounts\?status=all/);
  assert.match(accountsCardsPageSource, /creditCardAccounts/);
  assert.doesNotMatch(accountsCardsPageSource, /\/api\/cards\?status=all/);
  assert.doesNotMatch(accountsCardsPageSource, /\/api\/card-additional-links/);
  assert.doesNotMatch(accountsCardsPageSource, /CardAdditionalLinkRecord/);
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
