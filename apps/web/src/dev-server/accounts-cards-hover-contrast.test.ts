import assert from "node:assert/strict";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

const html = `<!doctype html>
<html lang="pt-BR">
  <head><title>Contas e Cartões - SolverFin</title></head>
  <body>
    <main>
      <div class="tab-list" role="tablist">
        <button class="tab-button" role="tab" aria-selected="true">Contas bancárias</button>
        <button class="tab-button" role="tab" aria-selected="false">Cartões de crédito</button>
      </div>
      <section data-tab-panel="accounts"></section>
    </main>
  </body>
</html>`;

const enhanced = enhanceAccountsCardsTabs(html);

assert.match(enhanced, /data-accounts-cards-direct-enhancement/);
assert.ok(
  enhanced.includes(
    "button.tab-button:hover:not(:disabled), button.tab-button:focus-visible { background: #f1f7f9; border-color: #c8dde5; color: var(--primary); }",
  ),
);
assert.ok(
  enhanced.includes(
    'button.tab-button[aria-selected="true"]:hover:not(:disabled), button.tab-button[aria-selected="true"]:focus-visible { background: var(--surface); border-color: #bfd6de; color: var(--text); }',
  ),
);
