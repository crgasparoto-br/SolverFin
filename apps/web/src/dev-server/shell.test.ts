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

  it("renders every navigable private route in the shared navigation", () => {
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

        if (priority === "secondary") {
          assert.match(link.attributes, new RegExp(`id="nav-secondary-${route.id}"`));
        }
      }
    }
  });

  it("classifies navigable private routes into primary and secondary mobile groups", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    for (const route of listNavigablePrivateShellRoutes()) {
      const link = findNavigationLink(html, route.path);
      const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";
      assert.match(link.attributes, new RegExp(`data-nav-priority="${priority}"`));

      if (priority === "secondary") {
        assert.match(link.attributes, new RegExp(`id="nav-secondary-${route.id}"`));
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

    assert.doesNotMatch(html, /<nav aria-label="Menu principal" class="nav-open">/);
    assert.match(html, /aria-expanded="false"[^>]*>Mais<\/button>/);
  });

  it("opens the secondary navigation by default when a secondary route is active", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/categorias",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Categorias",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /<nav aria-label="Menu principal" class="nav-open">/);
    assert.match(html, /aria-expanded="true"[^>]*>Menos<\/button>/);
  });

  it("loads the current user and derives every master route from the central catalog", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });
    const masterRoutes = listNavigablePrivateShellRoutes({ includeMaster: true }).filter(
      (route) => route.requiresMaster === true,
    );

    assert.match(html, /fetch\("\/api\/me"\)/);
    assert.match(html, /body\.user\.isMaster !== true/);
    assert.match(html, /for \(const route of masterRoutes\)/);
    assert.match(html, /link\.href = route\.path/);
    assert.match(html, /link\.innerHTML = route\.iconHtml \+ route\.label/);

    for (const route of masterRoutes) {
      assert.match(html, new RegExp(`"id":"${escapeRegExp(route.id)}"`));
      assert.match(html, new RegExp(`"path":"${escapeRegExp(route.path)}"`));
      assert.match(html, new RegExp(`"label":"${escapeRegExp(route.label)}"`));
    }
  });
});

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
