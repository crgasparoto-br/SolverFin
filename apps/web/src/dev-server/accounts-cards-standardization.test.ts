import assert from "node:assert/strict";
import test from "node:test";

import { standardizeAccountsCardsPage } from "./accounts-cards-standardization.js";

const fixture = `<!doctype html><html><head></head><body>
<section class="master-heading"><div><p class="eyebrow">Cadastros financeiros</p><h1>Contas e Cartões</h1><p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre.</p></div><div class="master-actions" aria-label="Ações principais"><button type="button" data-open-dialog="new-account-dialog">Adicionar conta</button><button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button></div></section>
<section class="master-toolbar"><div class="tab-list"><button id="accounts-tab" data-tab="accounts" aria-selected="true">Contas bancárias <span>2</span></button><button id="cards-tab" data-tab="cards" aria-selected="false">Cartões de crédito <span>1</span></button><button id="connections-tab" data-tab="connections">Conexões</button></div><div class="filter-row"><label>Buscar<input data-master-search /></label><label class="active-filter-switch"><input data-active-filter-input /></label></div></section>
<section data-tab-panel="accounts"><article data-master-item><div class="amount-stack"></div><div class="item-actions"></div></article></section><section data-tab-panel="cards"><article class="card-account-item" data-master-item><div class="item-main"><div class="instrument-list"><div data-card-instrument></div></div></div><div class="amount-stack"></div><div class="item-actions"></div></article></section><section id="connections-panel">Futuro</section>
<script>if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;</script>
</body></html>`;

test("padroniza cabecalho, abas, filtros e acao contextual", () => {
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
  assert.match(html, /<option value="inactive">Inativos<\/option>/);
  assert.match(html, /accounts-cards-toolbar/);
});

test("injeta estrutura visual e interacoes acessiveis", () => {
  const html = standardizeAccountsCardsPage(fixture);

  assert.match(html, /standardizeRows/);
  assert.match(html, /item-footer/);
  assert.match(html, /instrument-disclosure/);
  assert.match(html, /aria-expanded/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Buscar por nome, instituição, bandeira ou final/);
  assert.match(html, /Processando\.\.\./);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.equal(standardizeAccountsCardsPage(html), html);
});
