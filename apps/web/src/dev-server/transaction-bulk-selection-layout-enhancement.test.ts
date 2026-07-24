import assert from "node:assert/strict";

import { enhanceTransactionBulkSelectionLayout } from "./transaction-bulk-selection-layout-enhancement.js";

const source = `<!doctype html><html><head><style data-transaction-bulk-selection-enhancement></style></head><body><aside class="selection-bar"><strong><span data-selection-count>0</span> selecionados</strong><span data-selection-total>R$ 0,00</span><button data-selection-clear>Limpar</button><span class="bulk-selection-actions"></span><button data-group-open>Unificar lançamentos</button><span class="bulk-selection-help"></span><span class="bulk-selection-status"></span></aside></body></html>`;

const enhanced = enhanceTransactionBulkSelectionLayout(source);
assert.match(enhanced, /data-transaction-bulk-selection-layout-enhancement/);
assert.match(enhanced, /display: grid/);
assert.match(enhanced, /grid-template-columns: auto auto minmax\(0, 1fr\) auto auto/);
assert.match(enhanced, /position: fixed/);
assert.match(enhanced, /bottom: 16px/);
assert.match(enhanced, /left: 50%/);
assert.match(enhanced, /transform: translateX\(-50%\)/);
assert.match(enhanced, /max-width: calc\(100vw - 32px\)/);
assert.doesNotMatch(enhanced, /position: relative/);
assert.match(enhanced, /grid-column: 1 \/ -1/);
assert.match(enhanced, /bulk-selection-status:empty \{ display: none; \}/);
assert.match(enhanced, /min-width: 0/);
assert.match(enhanced, /overflow-wrap: anywhere/);
assert.match(enhanced, /text-align: left/);
assert.match(
  enhanced,
  /statement-panel:has\(> \.selection-bar:not\(\[hidden\]\)\) > \.statement-table/,
);
assert.match(enhanced, /padding-bottom: 192px/);
assert.match(enhanced, /scroll-padding-bottom: 192px/);
assert.match(enhanced, /padding-bottom: 360px/);
assert.match(enhanced, /scroll-padding-bottom: 360px/);
assert.equal(
  enhanceTransactionBulkSelectionLayout(enhanced),
  enhanced,
  "layout enhancement must be idempotent",
);
assert.equal(
  enhanceTransactionBulkSelectionLayout("<!doctype html><html><head></head><body></body></html>"),
  "<!doctype html><html><head></head><body></body></html>",
);
