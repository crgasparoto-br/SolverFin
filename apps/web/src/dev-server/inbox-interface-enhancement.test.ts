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

test("isola estados claros e contínuos para os lotes da inbox", () => {
  const enhanced = enhanceInboxInterface(page);

  assert.match(
    enhanced,
    /\.inbox-page \.import-batch-list \{[\s\S]*?gap: 0;[\s\S]*?padding: 0;/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.batch-item \{[\s\S]*?background: transparent;[\s\S]*?border-bottom: 1px solid var\(--line\);[\s\S]*?border-radius: 0;[\s\S]*?color: var\(--text\);/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.batch-item\.selected,[\s\S]*?background: var\(--primary-soft\);[\s\S]*?border-left-color: var\(--primary\);/,
  );
  assert.match(enhanced, /\.inbox-page \.batch-item:focus-visible \{/);
});

test("mantém seleção em lote compacta e com checkbox intrínseco", () => {
  const enhanced = enhanceInboxInterface(page);

  assert.match(
    enhanced,
    /\.inbox-page \.bulk-actions > label \{[\s\S]*?display: inline-flex;[\s\S]*?width: auto;/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.bulk-actions > label input\[type="checkbox"\] \{[\s\S]*?height: 18px;[\s\S]*?min-height: 18px;[\s\S]*?width: 18px;/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.bulk-actions > div \{[\s\S]*?display: flex;[\s\S]*?justify-content: flex-end;/,
  );
  assert.match(enhanced, /\.inbox-page \.bulk-actions button \{[\s\S]*?width: auto;/);
});

test("renderiza lançamentos como lista corrida sem divisores internos excessivos", () => {
  const enhanced = enhanceInboxInterface(page);

  assert.match(
    enhanced,
    /\.inbox-page \.import-row \{[\s\S]*?border: 0;[\s\S]*?border-bottom: 1px solid var\(--line\);[\s\S]*?border-radius: 0;/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.row-summary div,[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?padding: 0;/,
  );
  assert.match(enhanced, /data-row-state="pending_invalid"/);
  assert.match(enhanced, /data-row-state="candidate_pending"/);
});

test("usa navegação horizontal compacta e ações intrínsecas no mobile", () => {
  const enhanced = enhanceInboxInterface(page);

  assert.match(
    enhanced,
    /@media \(max-width: 800px\) \{[\s\S]*?\.inbox-section-nav \{[\s\S]*?display: flex;[\s\S]*?overflow-x: auto;/,
  );
  assert.match(
    enhanced,
    /@media \(max-width: 520px\) \{[\s\S]*?\.inbox-page \.heading-actions > \*,[\s\S]*?width: auto;/,
  );
  assert.doesNotMatch(enhanced, /\.inbox-page \.maintenance-actions button \{\s*width: 100%;/);
});

test("não duplica o aprimoramento quando aplicado novamente", () => {
  const enhanced = enhanceInboxInterface(page);
  const repeated = enhanceInboxInterface(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-interface="enhanced"/g)?.length, 1);
});
