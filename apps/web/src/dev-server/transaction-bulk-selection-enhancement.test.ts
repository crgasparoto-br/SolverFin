import assert from "node:assert/strict";

import { enhanceTransactionBulkSelection } from "./transaction-bulk-selection-enhancement.js";

const source = `<!doctype html><html><head></head><body>
  <h1>Extrato Bancário</h1>
  <article class="statement-row statement-body" role="row">
    <label class="col-select"><input type="checkbox" data-select-transaction value="11111111-1111-4111-8111-111111111111" data-kind="expense" data-status="posted" data-currency="BRL" data-amount="-1000"></label>
  </article>
  <article class="statement-row statement-body grouped-row" role="row" data-group-row="22222222-2222-4222-8222-222222222222">
    <span class="col-select group-indicator" aria-label="Grupo de lançamentos">link</span>
    <span class="statement-status statement-status-posted col-status" role="img" tabindex="0" aria-label="Efetivado não conciliado"></span>
  </article>
  <script type="application/json" data-group="22222222-2222-4222-8222-222222222222">{"id":"22222222-2222-4222-8222-222222222222","description":"Grupo","kind":"expense","status":"posted","currency":"BRL","totalAmountMinor":3000,"members":[{"id":"33333333-3333-4333-8333-333333333331"},{"id":"33333333-3333-4333-8333-333333333332"}]}</script>
  <aside class="selection-bar" data-selection-bar hidden><strong><span data-selection-count>0</span> selecionados</strong><span data-selection-total>R$ 0,00</span><button data-selection-clear>Limpar</button><button data-group-open>Unificar lançamentos</button></aside>
</body></html>`;

const enhanced = enhanceTransactionBulkSelection(source);
assert.match(enhanced, /data-transaction-bulk-selection-enhancement/);
assert.match(enhanced, /data-transaction-bulk-selection-controller/);
assert.match(enhanced, /dataset\.selectionEntity = "group"/);
assert.match(enhanced, /data-transaction-group-state/);
assert.match(enhanced, /statement-status transaction-group-state/);
assert.match(enhanced, /Agrupamento com/);
assert.match(enhanced, /grouped-status/);
assert.match(enhanced, /Marcar como conciliado/);
assert.match(enhanced, /data-button-variant="neutral" data-bulk-selection-action="reconcile"/);
assert.match(enhanced, /data-button-variant="neutral" data-bulk-selection-action="unreconcile"/);
assert.match(enhanced, /statement-status-option bulk-selection-action bulk-reconciliation-action/);
assert.match(enhanced, /aria-label="Marcar como conciliado" title="Marcar como conciliado" data-tooltip="Marcar como conciliado"/);
assert.match(enhanced, /aria-label="Desmarcar conciliado" title="Desmarcar conciliado" data-tooltip="Desmarcar conciliado"/);
assert.match(enhanced, /icon\.reconcile \+ '<\/button>'/);
assert.match(enhanced, /icon\.unreconcile \+ '<\/button>'/);
assert.match(enhanced, /statement-status statement-status-ok/);
assert.match(enhanced, /statement-status statement-status-posted/);
assert.match(enhanced, /44px/);
assert.match(enhanced, /26px/);
assert.match(enhanced, /15px/);
assert.match(enhanced, /button\.setAttribute\("data-tooltip", tooltip\)/);
assert.doesNotMatch(enhanced, /<span>Marcar como conciliado<\/span>|<span>Desmarcar conciliado<\/span>/);
assert.doesNotMatch(enhanced, /refresh-cw/);
assert.match(enhanced, /item\.dataset\.status === "planned"/);
assert.match(enhanced, /item\.dataset\.status === "posted"/);
assert.match(enhanced, /hasReconcileTarget/);
assert.match(enhanced, /item\.dataset\.reconcileProtected === "true"/);
assert.match(enhanced, /Conciliação indisponível: remuneração automática exige seu fluxo próprio/);
assert.match(enhanced, /!eligibleStatuses \|\| !hasReconcileTarget/);
assert.match(enhanced, /!eligibleStatuses \|\| !hasReconciled/);
assert.match(enhanced, /Todos os lançamentos selecionados já estão conciliados/);
assert.doesNotMatch(enhanced, /Efetive os lançamentos previstos antes de alterar a conciliação/);
assert.match(enhanced, /Desmarcar conciliado/);
assert.match(enhanced, /Excluir selecionados/);
assert.match(enhanced, /\/api\/transactions\/bulk-actions/);
assert.match(enhanced, /groupIds:/);
assert.match(enhanced, /transactionIds:/);
assert.match(enhanced, /Desmarque os agrupamentos para unificar somente lançamentos simples/);
assert.match(enhanced, /bulk-selection-help/);
assert.match(enhanced, /aria-describedby/);
assert.match(enhanced, /Não foi possível comunicar com o servidor/);
assert.match(enhanced, /aria-live/);
assert.equal(enhanceTransactionBulkSelection(enhanced), enhanced, "enhancement must be idempotent");
