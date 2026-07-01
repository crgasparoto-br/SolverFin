import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderAuthenticatedShellDocument } from "./shell.js";

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
