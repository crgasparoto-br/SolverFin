import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxInterfaceAccessibility } from "./inbox-interface-accessibility-enhancement.js";
import { enhanceInboxInterface } from "./inbox-interface-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox</title></head>
  <body>
    <main data-inbox-category-hierarchy-enhanced>
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

function enhancePage(html: string): string {
  return enhanceInboxInterfaceAccessibility(enhanceInboxInterface(html));
}

test("organiza a inbox como uma lista operacional com navegação por seção", () => {
  const enhanced = enhancePage(page);

  assert.match(enhanced, /<main class="inbox-page" data-inbox-category-hierarchy-enhanced>/);
  assert.match(enhanced, /id="inbox-imports"/);
  assert.match(enhanced, /id="inbox-suggestions"/);
  assert.match(enhanced, /id="inbox-messages"/);
  assert.match(enhanced, /5 itens para revisar/);
  assert.match(enhanced, /Revise importações e sugestões/);
  assert.match(enhanced, /\.inbox-page \.maintenance-item/);
});

test("isola estados claros e contínuos para os lotes da inbox", () => {
  const enhanced = enhancePage(page);

  assert.match(enhanced, /\.inbox-page \.import-batch-list \{[\s\S]*?gap: 0;[\s\S]*?padding: 0;/);
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

test("mantém seleção compacta com alvos acessíveis e botões no padrão do design system", () => {
  const enhanced = enhancePage(page);
  const accessibilityStyles = enhanced.slice(
    enhanced.indexOf('<style data-inbox-interface-accessibility="enhanced">'),
  );

  assert.match(
    enhanced,
    /\.inbox-page \.bulk-actions > label \{[\s\S]*?display: inline-flex;[\s\S]*?width: auto;/,
  );
  assert.match(
    accessibilityStyles,
    /\.inbox-page \.bulk-actions > label input\[type="checkbox"\],[\s\S]*?height: 24px;[\s\S]*?min-height: 24px;[\s\S]*?width: 24px;/,
  );
  assert.match(
    accessibilityStyles,
    /\.inbox-page \.heading-actions button,[\s\S]*?\.inbox-page \.bulk-actions button \{[\s\S]*?min-height: 34px !important;/,
  );
  assert.match(enhanced, /\.inbox-page \.bulk-actions button \{[\s\S]*?width: auto;/);
});

test("mantém todos os dados financeiros integralmente acessíveis e contraste AA desabilitado", () => {
  const enhanced = enhancePage(page);
  const accessibilityStyles = enhanced.slice(
    enhanced.indexOf('<style data-inbox-interface-accessibility="enhanced">'),
  );

  assert.match(enhanced, /data-inbox-interface-accessibility-script="enhanced"/);
  assert.match(
    enhanced,
    /new Set\(\[[\s\S]*?"Data",[\s\S]*?"Tipo",[\s\S]*?"Valor",[\s\S]*?"Descrição",[\s\S]*?"Conta de referência",[\s\S]*?"Outra conta",[\s\S]*?\]\)/,
  );
  assert.match(enhanced, /value\.dataset\.fullValueEnhanced = "true"/);
  assert.match(enhanced, /value\.setAttribute\("aria-label", label \+ ": " \+ fullValue\)/);
  assert.match(enhanced, /value\.tabIndex = 0/);
  assert.match(enhanced, /row-summary-value-preview/);
  assert.match(enhanced, /row-summary-full-value/);
  assert.match(
    accessibilityStyles,
    /\.inbox-page button:disabled,[\s\S]*?background: #e2e8f0 !important;[\s\S]*?color: #334155 !important;[\s\S]*?opacity: 1 !important;/,
  );
});

test("usa tipografia operacional legível sem perder a lista contínua", () => {
  const enhanced = enhancePage(page);
  const accessibilityStyles = enhanced.slice(
    enhanced.indexOf('<style data-inbox-interface-accessibility="enhanced">'),
  );

  assert.match(
    enhanced,
    /\.inbox-page \.import-row \{[\s\S]*?border: 0;[\s\S]*?border-bottom: 1px solid var\(--line\);[\s\S]*?border-radius: 0;/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.row-editor \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(88px, 0\.65fr\) minmax\(0, 3fr\) auto;/,
  );
  assert.match(
    enhanced,
    /\.inbox-page \.row-summary div,[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?padding: 0;/,
  );
  assert.match(
    accessibilityStyles,
    /\.inbox-page \.row-heading \.status-pill,[\s\S]*?\.inbox-page \.row-summary dt \{[\s\S]*?font-size: 0\.6875rem !important;/,
  );
  assert.match(enhanced, /data-row-state="pending_invalid"/);
  assert.match(enhanced, /data-row-state="candidate_pending"/);
});

test("usa navegação horizontal compacta e ações intrínsecas no mobile", () => {
  const enhanced = enhancePage(page);

  assert.match(
    enhanced,
    /@media \(max-width: 800px\) \{[\s\S]*?\.inbox-section-nav \{[\s\S]*?display: flex;[\s\S]*?overflow-x: auto;/,
  );
  assert.match(
    enhanced,
    /@media \(max-width: 520px\) \{[\s\S]*?\.inbox-page \.heading-actions > \*,[\s\S]*?width: auto;/,
  );
  assert.match(
    enhanced,
    /@media \(max-width: 520px\) \{[\s\S]*?\.inbox-page \.compact-filters button \{[\s\S]*?flex: 0 0 auto !important;[\s\S]*?width: max-content !important;/,
  );
  assert.doesNotMatch(enhanced, /\.inbox-page \.maintenance-actions button \{\s*width: 100%;/);
});

test("não duplica os aprimoramentos quando aplicados novamente", () => {
  const enhanced = enhancePage(page);
  const repeated = enhancePage(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-interface="enhanced"/g)?.length, 1);
  assert.equal(repeated.match(/data-inbox-interface-accessibility="enhanced"/g)?.length, 1);
  assert.equal(repeated.match(/data-inbox-interface-accessibility-script="enhanced"/g)?.length, 1);
});
