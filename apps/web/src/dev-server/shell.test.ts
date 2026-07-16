import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import { listNavigablePrivateShellRoutes } from "../app-shell/routes.js";
import { renderAuthenticatedShellDocument, renderShellDocument } from "./shell.js";

describe("SSR shell document", () => {
  it("renders a shared HTML document with escaped title and provided body", () => {
    const html = renderShellDocument({
      body: "<main>Conteúdo público</main>",
      styles: ".test-marker { color: #0f3d4c; }",
      title: "Entrar & revisar",
    });

    assert.match(html, /<!doctype html>/);
    assert.match(html, /<html lang="pt-BR">/);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
    assert.match(html, /<title>Entrar &amp; revisar<\/title>/);
    assert.match(html, /<style>\.test-marker \{ color: #0f3d4c; \}<\/style>/);
    assert.match(html, /<body><main>Conteúdo público<\/main><\/body>/);
  });
});

describe("authenticated SSR shell", () => {
  it("renders the shared shell with active navigation and logout handling", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/lancamentos",
      content: '<section class="statement-layout">Conteúdo da página</section>',
      currentLabel: "Extrato da conta",
      styles: ".test-marker { color: #0f3d4c; }",
    });
    const transactionsLink = findNavigationLink(html, "/lancamentos");
    const settingsLink = findNavigationLink(html, "/configuracoes");

    assert.match(html, /<title>Extrato da conta - SolverFin<\/title>/);
    assert.match(html, /<strong>Extrato da conta<\/strong>/);
    assert.match(html, /<span data-current-user-name aria-live="polite">Usuário<\/span>/);
    assert.doesNotMatch(html, /Usuário Demo SolverFin/);
    assert.match(html, /const displayName = typeof body\.user\.displayName/);
    assert.match(html, /const email = typeof body\.user\.email/);
    assert.match(html, /userName\.textContent = displayName \|\| email \|\| "Usuário"/);
    assert.match(html, /\.test-marker \{ color: #0f3d4c; \}/);
    assert.match(html, /\.statement-tooltip-layer\s*\{[\s\S]*position:\s*fixed/);
    assert.match(html, /\.statement-status::after\s*\{\s*content:\s*none/);
    assert.match(html, /document\.querySelectorAll\("\.statement-status\[data-tooltip\]"\)/);
    assert.match(
      html,
      /<main><section class="statement-layout">Conteúdo da página<\/section><\/main>/,
    );
    assert.match(transactionsLink.attributes, /data-nav-priority="primary"/);
    assert.match(transactionsLink.attributes, /aria-current="page"/);
    assert.match(transactionsLink.content, /Extrato da conta/);
    assert.doesNotMatch(html, /href="\/pagar-receber"/);
    assert.doesNotMatch(html, />Pagar e receber<\/a>/);
    assert.doesNotMatch(html, /href="\/remuneracao-contas"/);
    assert.match(settingsLink.attributes, /data-nav-priority="primary"/);
    assert.match(settingsLink.content, /Configurações/);
    assert.match(html, /fetch\("\/api\/session", \{ method: "DELETE" \}\)/);
    assert.match(html, /window\.location\.assign\("\/login"\)/);
    assert.match(html, /form\.dataset\.method = "PATCH"/);
    assert.doesNotMatch(html, /document\.addEventListener\("submit"/);
    assert.match(html, /event\.target\.closest[\s\S]*data-explicit-edit-scope/);
    assert.match(html, /event\.stopImmediatePropagation\(\)/);
  });

  it("keeps the brand and logout outside the scrollable navigation region", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
      showAdminNavigation: true,
    });
    const sidebar = findSidebarContent(html);
    const brandIndex = sidebar.indexOf('class="brand"');
    const navigationIndex = sidebar.indexOf(
      '<nav aria-label="Menu principal" class="sidebar-navigation',
    );
    const navigationEndIndex = sidebar.indexOf("</nav>", navigationIndex);
    const logoutIndex = sidebar.indexOf('class="logout"');

    assert.ok(brandIndex >= 0);
    assert.ok(navigationIndex > brandIndex);
    assert.ok(navigationEndIndex > navigationIndex);
    assert.ok(logoutIndex > navigationEndIndex);
    assert.doesNotMatch(sidebar.slice(navigationIndex, navigationEndIndex), /class="logout"/);
    assert.match(
      html,
      /@media \(min-width: 761px\)[\s\S]*\.sidebar\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*\.sidebar > \.sidebar-navigation\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*min-width:\s*0;[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;[\s\S]*touch-action:\s*pan-y;/,
    );
  });

  it("keeps statement presentation assets out of unrelated authenticated pages", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.doesNotMatch(html, /statement-tooltip-layer/);
    assert.doesNotMatch(html, /statement-status::after/);
    assert.doesNotMatch(html, /restoreNativeTitle/);
  });

  it("renders every common navigable private route in the shared navigation", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    for (const route of listNavigablePrivateShellRoutes()) {
      const link = findNavigationLink(html, route.path);
      assert.match(link.content, new RegExp(escapeRegExp(route.label)));
    }
    assert.doesNotMatch(html, /href="\/remuneracao-contas"/);
    assert.doesNotMatch(html, /href="\/admin\/instituicoes"/);
    assert.doesNotMatch(html, /href="\/admin\/indices-financeiros"/);
  });

  it("renders every master route from the catalog with icon, order and accessible metadata", () => {
    const routes = listNavigablePrivateShellRoutes({ includeMaster: true });
    const masterRoutes = routes.filter((route) => route.requiresMaster === true);
    const html = renderAuthenticatedShellDocument({
      activePathname: "/admin/indices-financeiros",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Admin - Índices financeiros",
      styles: ".test-marker { color: #0f3d4c; }",
      showAdminNavigation: true,
    });
    const sidebar = findSidebarContent(html);
    const adminGroupLabels = sidebar.match(/data-nav-group="admin"/g) ?? [];
    const toggle = findNavigationToggle(sidebar);
    let previousIndex = -1;

    assert.equal(adminGroupLabels.length, 1);

    for (const route of routes) {
      const link = findNavigationLink(sidebar, route.path);
      const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";
      const elementId = `nav-${priority}-${route.id}`;

      assert.match(link.attributes, new RegExp(`id="${elementId}"`));
      assert.match(link.attributes, new RegExp(`data-nav-priority="${priority}"`));
      assert.match(link.attributes, new RegExp(`title="${escapeRegExp(route.description)}"`));
      assert.match(link.content, /<svg[^>]*aria-hidden="true"[^>]*>/);
      assert.match(link.content, new RegExp(escapeRegExp(route.label)));

      if (priority === "secondary") {
        assert.match(toggle.attributes, new RegExp(`aria-controls="[^"]*${elementId}`));
      }
    }

    for (const route of masterRoutes) {
      const routeIndex = sidebar.indexOf(`href="${route.path}"`);
      assert.ok(routeIndex > previousIndex);
      previousIndex = routeIndex;
    }

    assert.match(
      findNavigationLink(sidebar, "/admin/indices-financeiros").attributes,
      /aria-current="page"/,
    );
  });

  it("marks only the active navigable private route in the shared navigation", () => {
    for (const activeRoute of listNavigablePrivateShellRoutes()) {
      const html = renderAuthenticatedShellDocument({
        activePathname: activeRoute.path,
        content: "<section>Conteúdo da página</section>",
        currentLabel: activeRoute.label,
        styles: ".test-marker { color: #0f3d4c; }",
      });

      for (const route of listNavigablePrivateShellRoutes()) {
        const link = findNavigationLink(html, route.path);
        const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";

        assert.match(link.attributes, new RegExp(`data-nav-priority="${priority}"`));
        assert.equal(
          link.attributes.includes('aria-current="page"'),
          route.path === activeRoute.path,
        );
      }
    }
  });

  it("keeps the secondary navigation collapsed by default when a primary route is active", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /<nav aria-label="Menu principal" class="sidebar-navigation">/);
    assert.match(html, /aria-expanded="false"[^>]*>Mais<\/button>/);
  });

  it("opens the secondary navigation by default when a secondary route is active", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/categorias",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Categorias",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /<nav aria-label="Menu principal" class="sidebar-navigation nav-open">/);
    assert.match(html, /aria-expanded="true"[^>]*>Menos<\/button>/);
  });

  it("uses a delegated More/Less handler so catalog navigation can be replaced safely", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /document\.addEventListener\("click", \(event\) =>/);
    assert.match(html, /target\.closest\("\[data-nav-more\]"\)/);
    assert.doesNotMatch(html, /querySelectorAll\("\[data-nav-more\]"\)\.forEach/);
  });

  it("upgrades master navigation from the catalog without hardcoded DOM links", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /fetch\("\/api\/me"\)/);
    assert.match(html, /body\.user\.isMaster !== true/);
    assert.match(html, /const masterNavigationHtml =/);
    assert.match(html, /const masterRouteIds =/);
    assert.match(html, /masterRouteIds\.every/);
    assert.match(html, /nav\.innerHTML = masterNavigationHtml/);
    assert.match(html, /nav\.contains\(document\.activeElement\)/);
    assert.match(html, /focusedNavigationTarget\.focus\(\)/);
    assert.doesNotMatch(html, /document\.createElement\("a"\)/);
    assert.doesNotMatch(html, /link\.href = "\/admin\/instituicoes"/);
    assert.match(html, /adminInstitutions/);
    assert.match(html, /adminFinancialIndexes/);
  });
});

function findSidebarContent(html: string): string {
  const match = /<aside class="sidebar">([\s\S]*?)<\/aside>/.exec(html);

  assert.ok(match, "Expected authenticated sidebar");
  return match[1] ?? "";
}

function findNavigationToggle(html: string): { attributes: string; content: string } {
  const match = /<button([^>]*)data-nav-more([^>]*)>([\s\S]*?)<\/button>/.exec(html);

  assert.ok(match, "Expected navigation More/Less toggle");
  return {
    attributes: `${match[1] ?? ""} data-nav-more${match[2] ?? ""}`,
    content: match[3] ?? "",
  };
}

function findNavigationLink(html: string, path: string): { attributes: string; content: string } {
  const match = new RegExp(`<a href="${escapeRegExp(path)}"([^>]*)>([\\s\\S]*?)<\\/a>`).exec(html);

  assert.ok(match, `Expected navigation link for ${path}`);

  return {
    attributes: match[1] ?? "",
    content: match[2] ?? "",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
