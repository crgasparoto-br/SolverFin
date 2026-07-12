import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

const html = `<!doctype html>
<html lang="pt-BR">
  <head><title>Contas e Cartões - SolverFin</title></head>
  <body>
    <main>
      <div class="tab-list" role="tablist">
        <button class="tab-button" data-tab="accounts" aria-selected="true">Contas <span>1</span></button>
        <button class="tab-button" data-tab="cards" aria-selected="false">Cartões <span>1</span></button>
      </div>
      <button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button>
      <section data-tab-panel="accounts">
        <button type="button" class="icon-button" data-open-dialog="edit-account-dialog-account-1" title="Editar conta"></button>
      </section>
    </main>
  </body>
</html>`;

describe("accounts and cards contrast enhancement", () => {
  it("injects neutral styles in the document head", () => {
    const enhanced = enhanceAccountsCardsTabs(html);
    const styleIndex = enhanced.indexOf("data-accounts-cards-neutral-styles");
    const bodyIndex = enhanced.indexOf("<body>");

    assert.ok(styleIndex >= 0);
    assert.ok(styleIndex < bodyIndex);
    assert.match(
      enhanced,
      /button\.icon-button\[data-open-dialog\^="edit-account-dialog-"\] \{ background: #ffffff; border-color: #e2e8f0; color: #64748b; \}/,
    );
    assert.match(
      enhanced,
      /button\.icon-button\[data-open-dialog\^="edit-account-dialog-"\]:hover:not\(:disabled\), button\.icon-button\[data-open-dialog\^="edit-account-dialog-"\]:focus-visible \{ background: #f1f5f9; border-color: #cbd5e1; color: #334155; \}/,
    );
  });

  it("keeps the enhancement idempotent", () => {
    const enhanced = enhanceAccountsCardsTabs(html);
    assert.equal(enhanceAccountsCardsTabs(enhanced), enhanced);
  });
});
