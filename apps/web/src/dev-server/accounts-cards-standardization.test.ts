// Issue 556/#612: contratos históricos do standardizer e retirada do runtime servido.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { standardizeAccountsCardsPage } from "./accounts-cards-standardization.js";

const fixture = `<!doctype html><html><head></head><body>
<section class="master-heading"><div><p class="eyebrow">Cadastros financeiros</p><h1>Contas e Cartões</h1><p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre.</p></div><div class="master-actions" aria-label="Ações principais"><button type="button" data-open-dialog="new-account-dialog">Adicionar conta</button><button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button></div></section>
<section class="master-toolbar"><div class="tab-list"><button id="accounts-tab" data-tab="accounts" aria-selected="true">Contas bancárias <span>2</span></button><button id="cards-tab" data-tab="cards" aria-selected="false">Cartões de crédito <span>1</span></button><button id="connections-tab" data-tab="connections">Conexões</button></div><div class="filter-row"><label>Buscar<input data-master-search /></label><label class="active-filter-switch"><input data-active-filter-input /></label></div></section>
<section data-tab-panel="accounts"><article data-master-item><div class="amount-stack"></div><div class="item-actions"><button data-account-remuneration-action>Ativar CDI</button></div></article></section>
<section data-tab-panel="cards"><article class="card-account-item" data-master-item><div class="item-main"></div><div class="amount-stack"></div><div class="item-actions"><button type="button" class="icon-button" data-view-instruments data-open-dialog="card-instruments-dialog-card-1" aria-label="Ver instrumentos">lista</button></div></article></section>
<section id="connections-panel">Futuro</section>
<dialog id="new-card-dialog" class="master-dialog"><form data-api-form data-payload-kind="credit-card-account"><label>Nome<input name="name" /></label><label>Instituição<select name="institutionKey"></select></label><label>Bandeira<select name="brandKey"></select></label><label>Fechamento<input name="closingDay" /></label><label>Vencimento<input name="dueDay" /></label><label>Limite<input name="creditLimitMinor" /></label><label>Conta<select name="paymentAccountId"></select></label><label>Tipo<select name="instrumentType"></select></label><label>Titular<select name="instrumentHolder"></select></label><label>Nome instrumento<input name="instrumentName" /></label><label>Final<input name="instrumentMaskedIdentifier" /></label><label>Limite instrumento<input name="instrumentCreditLimitMinor" /></label><button type="submit">Criar</button></form></dialog>
<script>if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;</script>
</body></html>`;

test("mantém o comportamento histórico do standardizer isolado", () => {
  const html = standardizeAccountsCardsPage(fixture);
  assert.match(html, /<h1>Contas e cartões<\/h1>/);
  assert.doesNotMatch(html, /Cadastros financeiros/);
  assert.doesNotMatch(html, /connections-tab/);
  assert.doesNotMatch(html, /connections-panel/);
  assert.doesNotMatch(html, /active-filter-switch/);
  assert.match(html, /data-context-action/);
  assert.match(html, /data-context-action-label>Adicionar conta/);
  assert.match(html, /Contas <span>2<\/span>/);
  assert.match(html, /Cartões <span>1<\/span>/);
  assert.match(html, /data-master-status/);
  assert.match(html, /accounts-cards-toolbar/);
});

test("preserva confirmação, tooltips e agrupamento no código histórico", () => {
  const html = standardizeAccountsCardsPage(fixture);
  assert.match(html, /standardizeRows/);
  assert.match(html, /item-footer/);
  assert.match(html, /standardizeCdiActions/);
  assert.match(html, /MutationObserver/);
  assert.match(html, /data-tooltip/);
  assert.match(html, /Identificação do cartão/);
  assert.match(html, /Instrumento inicial/);
  assert.match(html, /Processando\.\.\./);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.equal(standardizeAccountsCardsPage(html), html);
});

test("gate visual comprova o A3 direto sem tabs ou menus pós-processados", () => {
  const visualGateSource = readFileSync(
    new URL("../../../scripts/statement-visual/accounts-cards-interface.mjs", import.meta.url),
    "utf8",
  );
  assert.match(visualGateSource, /data-accounts-cards-archetype/);
  assert.match(visualGateSource, /\.sf-detail-layout/);
  assert.match(visualGateSource, /data-resource-master-item/);
  assert.match(visualGateSource, /data-resource-detail/);
  assert.match(visualGateSource, /hasTabs/);
  assert.match(visualGateSource, /legacyActionMenuCount/);
  assert.match(visualGateSource, /Moeda indisponível|currencyContext/);
  assert.doesNotMatch(visualGateSource, /expectedTab/);
  assert.doesNotMatch(visualGateSource, /row-action-menu/);
});
