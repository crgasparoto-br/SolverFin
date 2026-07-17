import assert from "node:assert/strict";

import { enhanceAccountRemunerationDisclosure } from "./account-remuneration-disclosure-enhancement.js";

const source = `<!doctype html><html><head></head><body>
  <details class="account-remuneration-audit">
    <summary>Ver memória do cálculo</summary>
  </details>
</body></html>`;

const enhanced = enhanceAccountRemunerationDisclosure(source);

assert.match(enhanced, /data-account-remuneration-disclosure-affordance/);
assert.match(
  enhanced,
  /<summary aria-label="Ver memória do cálculo" title="Ver memória do cálculo">/,
);
assert.match(enhanced, /account-remuneration-disclosure-full">Ver memória do cálculo<\/span>/);
assert.match(
  enhanced,
  /account-remuneration-disclosure-compact" aria-hidden="true">Memória<\/span>/,
);
assert.match(enhanced, /\.col-description\{min-width:0\}/);
assert.match(
  enhanced,
  /\.description\{column-gap:2px;grid-template-columns:max-content minmax\(0,1fr\);min-width:0\}/,
);
assert.match(enhanced, /\.description>strong\{[^}]*font-size:\.75rem[^}]*white-space:nowrap/);
assert.match(
  enhanced,
  /\.account-remuneration-summary\{[^}]*max-width:100%[^}]*overflow-wrap:normal[^}]*word-break:normal/,
);
assert.match(
  enhanced,
  /summary\{[^}]*font-size:\.75rem[^}]*letter-spacing:-\.01em[^}]*white-space:nowrap/,
);
assert.match(enhanced, /\.account-remuneration-disclosure-compact\{display:none\}/);
assert.match(
  enhanced,
  /@media\(max-width:1600px\)\{\.account-remuneration-disclosure-full\{display:none\}\.account-remuneration-disclosure-compact\{display:inline\}\}/,
);
assert.match(enhanced, /summary::before\{content:"▸"/);
assert.match(enhanced, /\[open\] summary::before\{transform:rotate\(90deg\)\}/);
assert.match(enhanced, /summary:focus-visible\{[^}]*outline:2px solid var\(--primary\)/);
assert.equal(enhanceAccountRemunerationDisclosure(enhanced), enhanced);
assert.equal(
  enhanceAccountRemunerationDisclosure("<!doctype html><html><head></head><body></body></html>"),
  "<!doctype html><html><head></head><body></body></html>",
);
