import assert from "node:assert/strict";

import { enhanceAccountRemunerationDisclosure } from "./account-remuneration-disclosure-enhancement.js";

const source = `<!doctype html><html><head></head><body>
  <details class="account-remuneration-audit">
    <summary>Ver memória do cálculo</summary>
  </details>
</body></html>`;

const enhanced = enhanceAccountRemunerationDisclosure(source);

assert.match(enhanced, /data-account-remuneration-disclosure-affordance/);
assert.match(enhanced, /summary\{gap:4px;font-size:\.75rem;min-height:24px/);
assert.match(enhanced, /summary::before\{content:"▸"/);
assert.match(enhanced, /\[open\] summary::before\{transform:rotate\(90deg\)\}/);
assert.match(
  enhanced,
  /summary:focus-visible\{[^}]*outline:2px solid var\(--primary\)/,
);
assert.equal(enhanceAccountRemunerationDisclosure(enhanced), enhanced);
assert.equal(
  enhanceAccountRemunerationDisclosure(
    "<!doctype html><html><head></head><body></body></html>",
  ),
  "<!doctype html><html><head></head><body></body></html>",
);
