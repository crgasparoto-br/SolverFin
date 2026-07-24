import assert from "node:assert/strict";

import { enhanceTransactionGroupPendingFixes } from "./transaction-group-pending-fixes.js";

const source = `<!doctype html><html><head></head><body>
<form data-form><label>Descrição<input name="description"></label></form>
<article class="statement-row statement-body grouped-row" data-group-row="group-1">
  <div class="col-description"><strong>Grupo</strong><span>3 lançamentos agrupados</span></div>
  <span class="statement-status statement-status-posted col-status"></span>
  <strong class="col-amount credit">R$ 60,00</strong>
  <strong class="col-balance">R$ 100,00</strong>
  <script type="application/json" data-group="group-1">{"id":"group-1","kind":"income","status":"posted","currency":"BRL","totalAmountMinor":6000,"members":[{},{},{}]}</script>
</article>
<article class="statement-row statement-body"><strong class="col-balance">R$ 130,00</strong></article>
<dialog data-group-modal><form data-group-form><div data-group-members><button data-member-action="clone"></button></div></form></dialog>
</body></html>`;

const enhanced = enhanceTransactionGroupPendingFixes(source);
assert.match(enhanced, /data-transaction-group-pending-fixes/);
assert.match(enhanced, /MAX_DESCRIPTION_LENGTH = 240/);
assert.match(enhanced, /descriptionInput\.maxLength = MAX_DESCRIPTION_LENGTH/);
assert.match(
  enhanced,
  /descriptionInput\.value\.slice\(0, MAX_DESCRIPTION_LENGTH\)/,
);
assert.match(enhanced, /data-group-member-mode/);
assert.match(enhanced, /MutationObserver/);
assert.match(enhanced, /groupProjectionAmountMinor/);
assert.match(enhanced, /deltaMinor = nextAmountMinor - previousAmountMinor/);
assert.match(
  enhanced,
  /updateBalance\(affectedRow, deltaMinor, group\.currency\)/,
);
assert.match(enhanced, /statement-status-/);
assert.match(enhanced, /lançamentos agrupados/);
assert.equal(
  enhanceTransactionGroupPendingFixes(enhanced),
  enhanced,
  "pending fixes enhancement must be idempotent",
);
