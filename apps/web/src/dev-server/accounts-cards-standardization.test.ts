import assert from "node:assert/strict";
import test from "node:test";

import { standardizeAccountsCardsPage } from "./accounts-cards-standardization.js";

const fixture = `<!doctype html><html><head></head><body>
<section class="master-heading"><div><p class="eyebrow">Cadastros financeiros</p><h1>Contas e Cartões</h1><p class="muted">Mantenha contas, dinheiro, investimentos e cartões em um único cadastro mestre.</p></div><div class="master-actions" aria-label="Ações principais"><button type="button" data-open-dialog="new-account-dialog">Adicionar conta</button><button type="button" data-open-dialog="new-card-dialog">Adicionar cartão</button></div></section>
<div class="tab-list"><button id="accounts-tab" data-tab="accounts" aria-selected="true">Contas bancárias <span>2</span></button><button id="cards-tab" data-tab="cards" aria-selected="false">Cartões de crédito <span>1</span></button><button id="connections-tab" data-tab="connections">Conexões</button></div>
<input data-master-search />
<section data-tab-panel="accounts"></section><section data-tab-panel="cards"><article class="card-account-item"><div class="instrument-list"><div data-card-instrument></div></div></article></section><section id="connections-panel">Futuro</section>
</body></html>`;

test("padroniza cabecalho, abas e acao contextual", () => {
  const html = standardizeAccountsCardsPage(fixture);

  assert.match(html, /<h1>Contas e cartões<\/h1>/);
  assert.doesNotMatch(html, /Cadastros financeiros/);
  assert.doesNotMatch(html, /connections-tab/);
  assert.doesNotMatch(html, /connections-panel/);
  assert.match(html, /data-context-action/);
  assert.match(html, /Adicionar conta/);
  assert.match(html, /Contas <span>2<\/span>/);
  assert.match(html, /Cartões <span>1<\/span>/);
});

test("injeta comportamento acessivel e confirmacao sem window confirm", () => {
  const html = standardizeAccountsCardsPage(fixture);

  assert.match(html, /instrument-disclosure/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Buscar por nome, instituição, bandeira ou final/);
  assert.match(html, /requestSubmit\(\)/);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.equal(standardizeAccountsCardsPage(html), html);
});
