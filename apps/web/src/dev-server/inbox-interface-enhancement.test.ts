import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxInterface } from "./inbox-interface-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox</title></head>
  <body>
    <main>
      <section class="page-heading">
        <p>Importe extratos ou registre mensagens e confirme cada efeito financeiro antes de salvar.</p>
      </section>
      <section class="panel import-workspace"></section>
      <section class="panel list-panel">
        <div class="section-heading"><h2>Outras sugestões</h2><span>2 pendentes</span></div>
      </section>
      <section class="panel list-panel">
        <div class="section-heading"><h2>Mensagens recebidas</h2><span>3 itens</span></div>
      </section>
    </main>
  </body>
</html>`;

test("organiza a inbox como uma lista operacional com navegação por seção", () => {
  const enhanced = enhanceInboxInterface(page);

  assert.match(enhanced, /<main class="inbox-page">/);
  assert.match(enhanced, /id="inbox-imports"/);
  assert.match(enhanced, /id="inbox-suggestions"/);
  assert.match(enhanced, /id="inbox-messages"/);
  assert.match(enhanced, /5 itens para revisar/);
  assert.match(enhanced, /Revise importações e sugestões/);
  assert.match(enhanced, /\.inbox-page \.maintenance-item/);
});

test("não duplica o aprimoramento quando aplicado novamente", () => {
  const enhanced = enhanceInboxInterface(page);
  const repeated = enhanceInboxInterface(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-interface="enhanced"/g)?.length, 1);
});
