import assert from "node:assert/strict";

import { enhanceTransactionBulkSelectionLayout } from "./transaction-bulk-selection-layout-enhancement.js";

const source = `<!doctype html><html><head><style data-transaction-bulk-selection-enhancement></style></head><body><aside class="selection-bar"><span class="bulk-selection-help"></span><span class="bulk-selection-status"></span></aside></body></html>`;

const enhanced = enhanceTransactionBulkSelectionLayout(source);
assert.match(enhanced, /data-transaction-bulk-selection-layout-enhancement/);
assert.match(enhanced, /flex: 1 1 100%/);
assert.match(enhanced, /min-width: 0/);
assert.match(enhanced, /overflow-wrap: anywhere/);
assert.match(enhanced, /text-align: left/);
assert.equal(enhanceTransactionBulkSelectionLayout(enhanced), enhanced, "layout enhancement must be idempotent");
assert.equal(enhanceTransactionBulkSelectionLayout("<!doctype html><html><head></head><body></body></html>"), "<!doctype html><html><head></head><body></body></html>");
