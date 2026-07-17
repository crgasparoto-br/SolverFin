import assert from "node:assert/strict";

import { enhanceAccountRemunerationDisclosure } from "./account-remuneration-disclosure-enhancement.js";

const source = `<!doctype html><html><head></head><body>
  <details class="account-remuneration-audit">
    <summary>Ver memória do cálculo</summary>
  </details>
</body></html>`;

const enhanced = enhanceAccountRemunerationDisclosure(source);

assert.match(enhanced, /data-account-remuneration-disclosure-affordance/);
assert.match(enhanced, /\.col-description\{min-width:0\}/);
assert.match(
  enhanced,
  /\.description\{grid-template-columns:minmax\(0,max-content\) minmax\(0,1fr\);min-width:0\}/,
);
assert.match(
  enhanced,
  /\.account-remuneration-summary\{[^}]*max-width:100%[^}]*overflow-wrap:anywhere/,
);
assert.match(enhanced, /summary\{[^}]*font-size:\.75rem[^}]*max-width:100%[^}]*white-space:normal/);
assert.match(enhanced, /summary::before\{content:"▸"/);
assert.match(enhanced, /\[open\] summary::before\{transform:rotate\(90deg\)\}/);
assert.match(enhanced, /summary:focus-visible\{[^}]*outline:2px solid var\(--primary\)/);
assert.equal(enhanceAccountRemunerationDisclosure(enhanced), enhanced);
assert.equal(
  enhanceAccountRemunerationDisclosure("<!doctype html><html><head></head><body></body></html>"),
  "<!doctype html><html><head></head><body></body></html>",
);
