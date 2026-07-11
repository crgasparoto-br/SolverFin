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

    assert.match(html, /<title>Extrato da conta - SolverFin<\/title>/);
    assert.match(html, /<strong>Extrato da conta<\/strong>/);
    assert.match(html, /<style>\.test-marker \{ color: #0f3d4c; \}<\/style>/);
    assert.match(html, /<main><section>Conteúdo da página<\/section><\/main>/);
    assert.match(
      html,
      /<a href="\/lancamentos" data-nav-priority="primary" aria-current="page">Extrato da conta<\/a>/,
    );
    assert.doesNotMatch(html, /href="\/pagar-receber"/);
    assert.doesNotMatch(html, />Pagar e receber<\/a>/);
    assert.match(html, /<a href="\/configuracoes" data-nav-priority="primary" >Configurações<\/a>/);
    assert.match(html, /fetch\("\/api\/session", \{ method: "DELETE" \}\)/);
    assert.match(html, /window\.location\.assign\("\/login"\)/);
    assert.match(html, /form\.dataset\.method = "PATCH"/);
    assert.doesNotMatch(html, /document\.addEventListener\("submit"/);
    assert.doesNotMatch(html, /event\.stopImmediatePropagation\(\)/);
  });

  it("renders every private route in the shared navigation", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    for (const [path, label] of privateRoutes.entries()) {
      assert.ok(html.includes(`<a href="${path}"`));
      assert.ok(html.includes(`>${label}</a>`));
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
        const isPrimary = isPrimaryMobileRoute(route);
        const priority = isPrimary ? "primary" : "secondary";
        const idAttribute = isPrimary ? "" : ` id="nav-secondary-${route.id}"`;
        const activeAttribute = route.path === activePathname ? ` aria-current="page"` : " ";
        assert.ok(
          html.includes(
            `<a href="${route.path}"${idAttribute} data-nav-priority="${priority}"${activeAttribute}>${route.label}</a>`,
          ),
        );
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
      const priority = isPrimaryMobileRoute(route) ? "primary" : "secondary";
      assert.ok(html.includes(`data-nav-priority="${priority}"`));

      if (priority === "secondary") {
        assert.ok(html.includes(`id="nav-secondary-${route.id}"`));
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
    assert.match(html, /aria-expanded="false"[^>]*>Mais rotas<\/button>/);
  });

  it("opens the secondary navigation by default when a secondary route is active", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/categorias",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Categorias",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /<nav aria-label="Menu principal" class="nav-open">/);
    assert.match(html, /aria-expanded="true"[^>]*>Menos rotas<\/button>/);
  });

  it("can add the admin institutions route when the current user is master", () => {
    const html = renderAuthenticatedShellDocument({
      activePathname: "/dashboard",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Dashboard",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /fetch\("\/api\/me"\)/);
    assert.match(html, /body\.user\.isMaster !== true/);
    assert.match(html, /link\.href = "\/admin\/instituicoes"/);
    assert.match(html, /link\.textContent = \["Admin", "Instituições"\]\.join\(" - "\)/);
  });
});
