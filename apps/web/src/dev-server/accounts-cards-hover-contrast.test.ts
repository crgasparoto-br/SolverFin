import assert from "node:assert/strict";

import { enhanceAccountsCardsTabs } from "./accounts-cards-enhancement.js";

const html = `<!doctype html>
<html lang="pt-BR">
  <head><title>Contas e Cartões - SolverFin</title></head>
  <body>
    <main>
      <div class="tab-list" role="tablist">
        <button class="tab-button" role="tab" aria-selected="true">Contas bancárias <span>2</span></button>
        <button class="tab-button" role="tab" aria-selected="false">Cartões de crédito <span>1</span></button>
      </div>
      <section data-tab-panel="accounts"></section>
    </main>
  </body>
</html>`;

const enhanced = enhanceAccountsCardsTabs(html);

assert.match(enhanced, /data-accounts-cards-direct-enhancement/);
assert.ok(
  enhanced.includes(
    ".tab-list { background: #f8fafc; border-color: #e2e8f0; }",
  ),
);
assert.ok(
  enhanced.includes(
    "button.tab-button { background: transparent; border: 1px solid transparent; color: #475569; }",
  ),
);
assert.ok(
  enhanced.includes(
    "button.tab-button:hover:not(:disabled), button.tab-button:focus-visible { background: #f1f5f9; border-color: #e2e8f0; color: #334155; }",
  ),
);
assert.ok(
  enhanced.includes(
    'button.tab-button[aria-selected="true"] { background: #ffffff; border-color: #cbd5e1; color: #0f172a; box-shadow: 0 1px 2px rgba(15, 23, 42, .05); }',
  ),
);
assert.ok(
  enhanced.includes(
    'button.tab-button[aria-selected="true"] span { background: #e2e8f0; color: #334155; }',
  ),
);
assert.ok(
  enhanced.includes(
    '.active-filter-switch[aria-pressed="true"] .toggle-track { background: #94a3b8; }',
  ),
);
assert.doesNotMatch(
  enhanced,
  /button\.tab-button[^\n"]*var\(--primary(?:-soft)?\)/,
);
