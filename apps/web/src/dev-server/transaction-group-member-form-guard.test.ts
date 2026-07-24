import assert from "node:assert/strict";

import { enhanceTransactionGroupMemberFormGuard } from "./transaction-group-member-form-guard.js";

const source = `<!doctype html><html><head></head><body>
<dialog data-modal><form data-form><input name="accountId"><label>Tipo<input name="kind"></label><label>Valor<input name="amountMinor"></label><label>Data prevista<input name="plannedOn"></label><label>Data efetiva<input name="effectiveOn"></label><label>Repetição<input name="repeatMode"></label><label><input name="destinationAccountId"></label><label><input name="categoryId"></label><label><input name="description"></label><label><input name="note"></label><input name="status"><div class="status-icons"><button data-status-option="posted"></button></div><button type="submit">Salvar</button><p class="form-status"></p></form></dialog>
<dialog data-group-modal><form data-group-form><div data-group-members></div></form></dialog>
</body></html>`;

const enhanced = enhanceTransactionGroupMemberFormGuard(source);
assert.match(enhanced, /data-transaction-group-member-form-guard/);
assert.match(enhanced, /data-transaction-group-member-form-controller/);
assert.match(enhanced, /data-group-member-context/);
assert.match(enhanced, /Somente descrição, data, valor e categoria podem ser alterados/);
assert.match(enhanced, /O clone será único, manual e independente/);
assert.match(enhanced, /event\.stopImmediatePropagation\(\)/);
assert.match(enhanced, /\(clone \? "\/clone" : ""\)/);
assert.match(enhanced, /transactionForm\.dataset\.groupMemberMode/);
assert.match(enhanced, /"repeatMode"/);
assert.match(enhanced, /setField\(name, true, true\)/);
assert.match(enhanced, /solverfin:transaction-group:return/);
assert.match(enhanced, /Não foi possível comunicar com o servidor/);
assert.match(enhanced, /catch \{/);
assert.match(enhanced, /finally \{/);
assert.match(enhanced, /if \(submit\) submit\.disabled = false/);
assert.doesNotMatch(enhanced, /window\.setTimeout\(function \(\) \{ window\.location\.reload\(\); \}, 350\)/);
assert.equal(
  enhanceTransactionGroupMemberFormGuard(enhanced),
  enhanced,
  "guard enhancement must be idempotent",
);
