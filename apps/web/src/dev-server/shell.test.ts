import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
      activePathname: "/pagar-receber",
      content: "<section>Conteúdo da página</section>",
      currentLabel: "Pagar & receber",
      styles: ".test-marker { color: #0f3d4c; }",
    });

    assert.match(html, /<title>Pagar &amp; receber - SolverFin<\/title>/);
    assert.match(html, /<strong>Pagar &amp; receber<\/strong>/);
    assert.match(html, /<style>\.test-marker \{ color: #0f3d4c; \}<\/style>/);
    assert.match(html, /<main><section>Conteúdo da página<\/section><\/main>/);
    assert.match(html, /<a href="\/pagar-receber" aria-current="page">Pagar e receber<\/a>/);
    assert.match(html, /<a href="\/configuracoes" >Configurações<\/a>/);
    assert.match(html, /fetch\("\/api\/session", \{ method: "DELETE" \}\)/);
    assert.match(html, /window\.location\.assign\("\/login"\)/);
  });
});
