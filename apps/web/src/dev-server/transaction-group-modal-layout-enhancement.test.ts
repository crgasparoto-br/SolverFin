import assert from "node:assert/strict";

import { solverFinDesignTokens } from "../design-system/tokens.js";
import { enhanceTransactionGroupModalLayout } from "./transaction-group-modal-layout-enhancement.js";

const source = `<!doctype html><html><head></head><body><dialog data-group-modal><section class="group-modal-panel"><header><h2>Agrupamento</h2></header><form data-group-form></form></section></dialog></body></html>`;
const enhanced = enhanceTransactionGroupModalLayout(source);
assert.match(enhanced, /data-transaction-group-modal-layout/);
assert.match(enhanced, /max-width:min\(760px,/);
assert.match(
  enhanced,
  /form\[data-group-form\]\{[^}]*grid-auto-flow:row;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
);
assert.doesNotMatch(enhanced, /row dense|nth-of-type|repeat\(12,/);
assert.match(enhanced, /label:has\(\[name="description"\]\)/);
assert.match(enhanced, /label:has\(\[data-group-effective-input\]\)/);
assert.match(enhanced, /form\[data-group-form\]\{[^}]*box-sizing:border-box/);
assert.match(enhanced, /form\[data-group-form\]\{[^}]*max-width:100%/);
assert.match(enhanced, /form\[data-group-form\]\{[^}]*overflow-x:hidden/);
assert.match(enhanced, /form\[data-group-form\]\{[^}]*width:100%/);
assert.doesNotMatch(enhanced, /form\[data-group-form\]\{[^}]*scrollbar-gutter:stable/);
assert.match(enhanced, /form\[data-group-form\]>\*\{[^}]*max-width:100%;min-width:0/);
assert.match(enhanced, /\.group-members\{[^}]*overflow-x:hidden/);
assert.match(enhanced, /min-height:min\(286px,38vh\)/);
assert.match(
  enhanced,
  /\.group-actions button\{flex:1 1 100%;max-width:100%;min-width:0;white-space:normal;width:100%\}/,
);
assert.ok(enhanced.includes(`@media(max-width:${solverFinDesignTokens.breakpoints.shellCompact})`));
assert.ok(enhanced.includes(`min-height:${solverFinDesignTokens.density.interactiveTargetMin}`));
assert.equal(
  enhanceTransactionGroupModalLayout(enhanced),
  enhanced,
  "layout enhancement must be idempotent",
);
assert.equal(enhanceTransactionGroupModalLayout("<html></html>"), "<html></html>");
