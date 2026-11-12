import assert from "node:assert/strict";

import { enhanceTransactionGroupModal } from "./transaction-group-modal-enhancement.js";

const source = `<!doctype html><html><head></head><body>
<dialog data-modal><section><h2 data-modal-title>Novo lançamento</h2><form data-form><input name="kind"><input name="amountMinor"><input name="plannedOn"><input name="effectiveOn"><input name="repeatMode"><input name="destinationAccountId"><input name="categoryId"><input name="description"><input name="status"></form></section></dialog>
<dialog class="modal" data-group-modal>
  <section class="modal-panel group-modal-panel">
    <header><h2 data-group-title>Unificar lançamentos</h2></header>
    <form data-group-form>
      <label>Descrição<input name="description"></label>
      <label>Data<input name="displayOn"></label>
      <label>Conta<input readonly></label>
      <div data-group-summary></div>
      <div data-group-members></div>
      <div class="save-row"><button data-group-ungroup>Desagrupar</button></div>
    </form>
  </section>
</dialog>
</body></html>`;

const enhanced = enhanceTransactionGroupModal(source);
assert.match(enhanced, /data-transaction-group-modal-enhancement/);
assert.match(enhanced, /data-transaction-group-modal-controller/);
assert.match(enhanced, /Valor efetivo/);
assert.match(enhanced, /Moeda/);
assert.match(enhanced, /Lançamentos unificados/);
assert.match(enhanced, /data-member-action="clone"/);
assert.match(enhanced, /data-member-action="edit"/);
assert.match(enhanced, /data-member-action="void"/);
assert.match(enhanced, /Marcar como conciliado/);
assert.match(enhanced, /Clonar grupo/);
assert.match(enhanced, /Excluir grupo/);
assert.match(enhanced, /Efetive os lançamentos previstos antes de conciliar/);
assert.match(enhanced, /solverfin:transaction-group:return/);
assert.match(enhanced, /storeGroup\(responseBody\.group\)/);
assert.match(enhanced, /renderDetailsMode\(responseBody\.group\)/);
assert.match(enhanced, /Não foi possível comunicar com o servidor/);
assert.match(enhanced, /catch \{/);
assert.match(enhanced, /finally \{/);
assert.doesNotMatch(enhanced, /function openTransactionFlow/);
assert.doesNotMatch(enhanced, /data-group-member-editor/);
assert.equal(enhanceTransactionGroupModal(enhanced), enhanced, "enhancement must be idempotent");
