import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPrimaryMobileRoute } from "../app-shell/navigation.js";
import { listPrivateShellRoutes } from "../app-shell/routes.js";
import { privateRoutes } from "./routes.js";
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
      content: "<section>Conteúdo da página</section>",
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
    assert.match(html, /<style>\.test-marker \{ color: #0f3d4c; \}<\/style>/);
    assert.match(html, /<main><section>Conteúdo da página<\/section><\/main>/);
    assert.match(transactionsLink.attributes, /data-nav-priority="primary"/);
    assert.match(transactionsLink.attributes, /aria-current="page"/);
    assert.match(transactionsLink.content, /Extrato da conta/);
    assert.doesNotMatch(html, /href="\/pagar-receber"/);
    assert.doesNotMatch(html, />Pagar e receber<\/a>/);
    assert.match(settingsLink.attributes, /data-nav-priority="primary"/);
    assert.match(settingsLink.content, /Configurações/);
    assert.match(html, /fetch\("\/api\/session", \{ method: "DELETE" \}\)/);
    assert.match(html, /window\.location\.assign\("\/login"\)/);
    assert.match(html, /form\.dataset\.method = "PATCH"/);
    assert.doesNotMatch(html, /document\.addEventListener\("submit"/);
    assert.match(html, /event\.target\.closest[\s\S]*data-explicit-edit-scope/);
    assert.match(html, /event\.stopImmediatePropagation\(\)/);
  });

  it("renders every private route in the shared navigation", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    for (const [path, label] of privateRoutes.entries()) {
      const link = findNavigationLink(html, path);
      assert.match(link.content, new RegExp(escapeRegExp(label)));
    }
  });

  it("marks only the active private route in the shared navigation", () => {
    for (const activePathname of privateRoutes.keys()) {
      const html = renderAuthenticatedShellDocument({
        activePathname,
        content: "<section>Conteúdo da página</section>",
        currentLabel: privateRoutes.get(activePathname) ?? "Dashboard",
        styles: ".test-marker { color: #0f3d4c; }",
      });

      for (const route of listPrivateShellRoutes()) {
        const link = findNavigationLink(html, route.path);
        const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";

        assert.match(link.attributes, new RegExp(`data-nav-priority="${priority}"`));
        assert.equal(
          link.attributes.includes('aria-current="page"'),
          route.path === activePathname,
        );

        if (priority === "secondary") {
          assert.match(link.attributes, new RegExp(`id="nav-secondary-${route.id}"`));
        }
      }
    }
  });

  it("classifies private routes into primary and secondary mobile navigation groups", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    for (const route of listPrivateShellRoutes()) {
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

  it("loads the current user and can add the admin institutions route when the user is master", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /fetch\("\/api\/me"\)/);
    assert.match(html, /body\.user\.isMaster !== true/);
    assert.match(html, /link\.href = "\/admin\/instituicoes"/);
    assert.match(html, /link\.innerHTML = .*Admin - Instituições/);
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
