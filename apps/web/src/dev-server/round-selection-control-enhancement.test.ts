import assert from "node:assert/strict";
import test from "node:test";

import {
  enhanceRoundSelectionControls,
  roundSelectionControlStyles,
} from "./round-selection-control-enhancement.js";

const statementPage = `<!doctype html>
<html lang="pt-BR">
  <head><title>Extrato - SolverFin</title></head>
  <body>
    <main>
      <h1>Extrato Bancário</h1>
      <article class="statement-row statement-body">
        <label class="col-select">
          <input type="checkbox" data-select-transaction aria-label="Selecionar lançamento Mercado" />
        </label>
        <time class="col-date">23/07/2026</time>
      </article>
    </main>
  </body>
</html>`;

const inboxPage = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body>
    <main class="inbox-page">
      <input type="checkbox" data-select-suggestion aria-label="Selecionar linha 1" />
    </main>
  </body>
</html>`;

test("injeta o mesmo marcador circular no Extrato e na Inbox", () => {
  for (const page of [statementPage, inboxPage]) {
    const enhanced = enhanceRoundSelectionControls(page);

    assert.match(enhanced, /data-round-selection-control="enhanced"/);
    assert.match(enhanced, /system-round-selector/);
    assert.match(
      enhanced,
      /input\[type="checkbox"\]\[data-select-suggestion\], input\[type="checkbox"\]\[data-select-transaction\]/,
    );
    assert.match(enhanced, /MutationObserver/);
  }
});

test("mantém alvo acessível, foco, estados e aparência circular", () => {
  const styles = roundSelectionControlStyles();

  assert.match(
    styles,
    /\.system-round-selector \{[\s\S]*?appearance: none !important;[\s\S]*?border-radius: 50%;[\s\S]*?height: 24px !important;[\s\S]*?width: 24px !important;/,
  );
  assert.match(
    styles,
    /\.system-round-selector:checked \{[\s\S]*?var\(--primary\) 0 5px,[\s\S]*?var\(--primary\) 7px 8px/,
  );
  assert.match(
    styles,
    /\.system-round-selector:focus-visible \{[\s\S]*?outline: 2px solid var\(--cyan\);/,
  );
  assert.match(styles, /\.system-round-selector:disabled \{[\s\S]*?opacity: 0\.55;/);
  assert.match(styles, /@media \(forced-colors: active\)/);
});

test("realça somente a linha selecionada do Extrato e preserva o fluxo responsivo", () => {
  const styles = roundSelectionControlStyles();

  assert.match(
    styles,
    /\.statement-body:has\(> \.col-select \.system-round-selector:checked\) \{[\s\S]*?background: var\(--primary-soft\);[\s\S]*?box-shadow: inset 3px 0 0 var\(--primary\);/,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\) \{[\s\S]*?flex: 0 0 24px;[\s\S]*?padding-inline-start: 0;/,
  );
});

test("não altera documentos sem seleção e não duplica o enhancement", () => {
  const unrelated = "<!doctype html><html><head></head><body><main>Dashboard</main></body></html>";
  assert.equal(enhanceRoundSelectionControls(unrelated), unrelated);

  const enhanced = enhanceRoundSelectionControls(statementPage);
  const repeated = enhanceRoundSelectionControls(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-round-selection-control="enhanced"/g)?.length, 1);
});
