import assert from "node:assert/strict";

import { enhanceTransactionGroupModalLayout } from "./transaction-group-modal-layout-enhancement.js";

const source = `<!doctype html><html><head></head><body>
<dialog data-group-modal><section class="group-modal-panel"><header><h2>Agrupamento</h2></header><form data-group-form><label><input data-group-effective-input></label><label><input name="description"></label><label><input name="displayOn"></label><label><input readonly></label><label><input data-group-kind-input></label><label><input data-group-status-input></label><label><input data-group-currency-input></label><div class="group-members"><article class="group-member-row"><div class="group-member-main"><strong>Descrição longa</strong><div class="group-member-meta"><span>Categoria</span></div></div><time class="group-member-date"></time><strong class="group-member-amount"></strong><div class="group-member-actions"></div></article></div><div class="group-actions"></div><div class="save-row"></div></form></section></dialog>
</body></html>`;

const enhanced = enhanceTransactionGroupModalLayout(source);
assert.match(enhanced, /data-transaction-group-modal-layout/);
assert.match(
  enhanced,
  /dialog\[data-group-modal\]\{[^}]*max-width:min\(1220px,calc\(100vw - 24px\)\)/,
);
assert.match(
  enhanced,
  /form\[data-group-form\]\{[^}]*grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/,
);
assert.match(enhanced, /form\[data-group-form\]\{[^}]*overflow-x:hidden/);
assert.match(enhanced, /\.group-members\{[^}]*overflow-x:hidden/);
assert.match(enhanced, /\.group-member-row\{[^}]*min-width:0;[^}]*width:100%/);
assert.match(enhanced, /min-height:min\(286px,38vh\)/);
assert.match(enhanced, /@media\(max-width:760px\)/);
assert.match(enhanced, /@media\(max-width:520px\)/);
assert.equal(
  enhanceTransactionGroupModalLayout(enhanced),
  enhanced,
  "layout enhancement must be idempotent",
);
