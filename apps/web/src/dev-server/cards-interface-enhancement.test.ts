import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enhanceCardsInterface } from "./cards-interface-enhancement.js";

const cardHtml = `<!doctype html>
<html lang="pt-BR">
<head><title>Cart\u00f5es de Cr\u00e9dito - SolverFin</title><style></style></head>
<body>
<main>
<section class="cards-heading"><div><p class="eyebrow">Rotina de cart\u00f5es</p><h1>Cart\u00f5es de Cr\u00e9dito</h1><p class="muted">Acompanhe a fatura do cart\u00e3o, registre compras e fa\u00e7a a baixa do pagamento.</p></div><button type="button" data-open-modal="purchase" title="Registrar nova compra no cart\u00e3o">Nova compra</button></section>
<section class="panel card-filter"><form class="filter-form"><div class="filter-controls"></div></form></section>
<section class="cards-layout">
<aside class="panel invoice-summary" aria-label="Resumo da fatura">
<section class="summary-block"><p class="eyebrow">Fatura Aberta</p><h2>Fatura atual (R$)</h2><dl class="summary-list">
<div class="summary-row"><dt>Fechamento</dt><dd>20/07/2026</dd></div>
<div class="summary-row"><dt>Vencimento</dt><dd>10/08/2026</dd></div>
<div class="summary-row"><dt>Saldo anterior</dt><dd>R$ 0,00</dd></div>
<div class="summary-row"><dt>Total pago</dt><dd>R$ 0,00</dd></div>
<div class="summary-row"><dt>Total</dt><dd class="debit">-R$ 173,45</dd></div>
<div class="summary-row summary-row-strong"><dt>Valor a pagar</dt><dd class="debit">-R$ 173,45</dd></div>
</dl><div class="invoice-actions"><button type="button">Fechar fatura</button><button type="button" data-open-modal="payment">Lan\u00e7ar pagamento</button></div></section>
<section class="summary-block"><h2>Detalhamento</h2><dl class="summary-list"><div class="summary-row"><dt>Despesas</dt><dd>-R$ 173,45</dd></div></dl></section>
<section class="summary-block"><h2>Totais por cart\u00e3o (R$)</h2><dl class="summary-list"><div class="summary-row"><dt>Cart\u00e3o</dt><dd>-R$ 173,45</dd></div></dl></section>
<section class="summary-block"><h2>Limite (Total)</h2><dl class="summary-list"><div class="summary-row"><dt>Dispon\u00edvel</dt><dd>R$ 1.826,55</dd></div></dl></section>
</aside>
<section class="panel invoice-panel"><div class="invoice-toolbar"><div><p class="eyebrow">Compras e parcelas</p><h2>Fatura de Cart\u00e3o principal</h2></div><div class="filter-controls"><input type="search" data-purchase-search placeholder="Buscar descri\u00e7\u00e3o, categoria ou cart\u00e3o" /><button type="button" class="toggle-chip" data-reconciliation-toggle="unreconciled" aria-pressed="true">N\u00e3o conciliados</button><button type="button" class="toggle-chip" data-reconciliation-toggle="reconciled" aria-pressed="true">Conciliados</button></div></div>
<div class="purchase-list" aria-label="Compras da fatura">
<details class="purchase-group instrument-purchase-group" data-instrument-purchase-group open><summary class="purchase-group-summary"><span class="purchase-group-name">F\u00edsico</span><span class="muted">2 compras</span><strong class="debit">-R$ 173,45</strong></summary><div class="purchase-group-rows">
<article class="purchase-row" data-purchase-item data-reconciliation="reconciled" data-search="mercado"><time datetime="2026-07-19">19/07/2026</time><div class="description"><strong>Mercado</strong><span>Alimenta\u00e7\u00e3o</span></div><span class="chip chip-ok">Conciliada</span><strong class="debit">-R$ 100,00</strong><details class="actions"><summary aria-label="A\u00e7\u00f5es da compra Mercado">...</summary><div class="actions-menu"></div></details></article>
<article class="purchase-row" data-purchase-item data-reconciliation="unreconciled" data-search="transporte"><time datetime="2026-07-18">18/07/2026</time><div class="description"><strong>Transporte</strong><span>Mobilidade</span></div><span class="chip chip-posted">N\u00e3o conciliada</span><strong class="debit">-R$ 73,45</strong><details class="actions"><summary aria-label="A\u00e7\u00f5es da compra Transporte">...</summary><div class="actions-menu"></div></details></article>
</div></details>
</div></section></section>
<dialog data-modal="purchase"><section class="modal-panel"><form method="dialog" class="close-form"><button type="submit">Fechar</button></form><div><p class="eyebrow">Compra no cart\u00e3o</p><h2 data-purchase-modal-title>Nova compra</h2></div><form data-purchase-form><label>Valor<input name="amountMinor" /></label><button>Salvar</button></form></section></dialog>
<dialog data-modal="payment"><section class="modal-panel"><form method="dialog" class="close-form"><button type="submit">Fechar</button></form><div><p class="eyebrow">Pagamento</p><h2>Lan\u00e7ar pagamento</h2></div><form><label>Conta<select></select></label><button>Salvar</button></form></section></dialog>
</main>
</body></html>`;

describe("cards interface enhancement", () => {
  it("prioritizes the selected invoice and preserves its actions", () => {
    const enhanced = enhanceCardsInterface(cardHtml);

    assert.match(enhanced, /<main data-cards-interface-enhanced>/);
    assert.match(enhanced, /id="cards-page-title"/);
    assert.match(enhanced, /Fatura selecionada/);
    assert.match(enhanced, /<strong>R\$ 173,45<\/strong>/);
    assert.match(enhanced, /invoice-status-active/);
    assert.match(enhanced, /Composi\u00e7\u00e3o da fatura/);
    assert.match(enhanced, /Compras por instrumento/);
    assert.match(enhanced, /data-open-modal="payment"/);
    assert.doesNotMatch(enhanced, /Fatura atual \(R\$\)/);
  });

  it("adds accessible search, reconciliation counters and result feedback", () => {
    const enhanced = enhanceCardsInterface(cardHtml);

    assert.match(enhanced, /aria-label="Buscar compras da fatura"/);
    assert.match(enhanced, /data-purchase-results-status aria-live="polite">2 compras exibidas/);
    assert.match(
      enhanced,
      /data-reconciliation-toggle="unreconciled"[^>]*>[\s\S]*?<small>1<\/small>/,
    );
    assert.match(
      enhanced,
      /data-reconciliation-toggle="reconciled"[^>]*>[\s\S]*?<small>1<\/small>/,
    );
    assert.match(enhanced, /data-clear-purchase-search/);
    assert.match(enhanced, /data-purchase-filter-empty/);
    assert.match(enhanced, /data-reset-purchase-filters/);
  });

  it("turns the purchases into a comparable desktop table and labelled mobile rows", () => {
    const enhanced = enhanceCardsInterface(cardHtml);

    assert.match(enhanced, /role="table" aria-rowcount="2"/);
    assert.match(enhanced, /purchase-table-head/);
    assert.match(enhanced, /purchase-status-ok/);
    assert.match(enhanced, /purchase-status-pending/);
    assert.match(enhanced, /data-label="Data"/);
    assert.match(enhanced, /data-label="Situa\u00e7\u00e3o"/);
    assert.match(enhanced, /data-label="Valor"/);
    assert.match(enhanced, /data-label="A\u00e7\u00f5es"/);
    assert.match(enhanced, /@media\(max-width:760px\)/);
  });

  it("improves both dialogs and keeps the transformation isolated and idempotent", () => {
    const enhanced = enhanceCardsInterface(cardHtml);

    assert.match(enhanced, /aria-labelledby="purchase-modal-title"/);
    assert.match(enhanced, /aria-describedby="payment-modal-title-description"/);
    assert.match(enhanced, /class="modal-close"/);
    assert.match(enhanced, /data-cards-interface-styles/);
    assert.match(enhanced, /data-cards-interface-controller/);
    assert.equal(enhanceCardsInterface(enhanced), enhanced);
    assert.equal(
      enhanceCardsInterface("<title>Outra tela - SolverFin</title><main></main>"),
      "<title>Outra tela - SolverFin</title><main></main>",
    );
  });
});
