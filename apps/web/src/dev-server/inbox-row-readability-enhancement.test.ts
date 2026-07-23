import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxRowReadability } from "./inbox-row-readability-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body><main class="inbox-page"></main></body>
</html>`;

test("reduz visualmente o seletor circular sem diminuir o alvo acessível", () => {
  const enhanced = enhanceInboxRowReadability(page);

  assert.match(enhanced, /data-inbox-row-readability="enhanced"/);
  assert.match(
    enhanced,
    /input\[type="checkbox"\] \{[\s\S]*?appearance: none !important;[\s\S]*?background-image: radial-gradient\([\s\S]*?#64748b 6px 8px,[\s\S]*?transparent 8px[\s\S]*?border-radius: 50%;[\s\S]*?flex: 0 0 24px !important;[\s\S]*?height: 24px !important;[\s\S]*?width: 24px !important;/,
  );
  assert.match(
    enhanced,
    /input\[type="checkbox"\]:checked \{[\s\S]*?background-image: radial-gradient\([\s\S]*?var\(--primary\) 7px 8px,[\s\S]*?transparent 8px/,
  );
  assert.match(
    enhanced,
    /input\[type="checkbox"\]:focus-visible \{[\s\S]*?outline: 2px solid var\(--cyan\);/,
  );
});

test("dimensiona todas as colunas para preservar o conteúdo integral", () => {
  const enhanced = enhanceInboxRowReadability(page);

  assert.match(
    enhanced,
    /--inbox-table-columns: 28px 72px 38px 78px 76px minmax\(150px, 1\.25fr\) 100px minmax\(110px, 0\.9fr\) minmax\(84px, 1fr\) 112px;/,
  );
  assert.match(
    enhanced,
    /\.import-table-header > span,[\s\S]*?\.import-table-cell \.row-summary-value-preview,[\s\S]*?\.import-table-observations \.candidate-card p \{[\s\S]*?overflow: visible !important;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?text-overflow: clip !important;[\s\S]*?white-space: normal !important;/,
  );
  assert.match(
    enhanced,
    /\.import-table-cell-type,[\s\S]*?\.import-table-cell-type \.row-summary-value-preview \{[\s\S]*?overflow: visible !important;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?text-overflow: clip !important;[\s\S]*?white-space: normal !important;/,
  );
  assert.match(
    enhanced,
    /\.import-table-cell-account,[\s\S]*?\.row-summary-value-preview,[\s\S]*?overflow-wrap: anywhere;[\s\S]*?text-overflow: clip !important;[\s\S]*?white-space: normal !important;/,
  );
  assert.match(enhanced, /@media \(min-width: 1024px\) \{[\s\S]*?min-width: 848px;/);
  assert.match(
    enhanced,
    /\.import-table-select-cell,[\s\S]*?\.row-action-cluster \{[\s\S]*?padding-block: 2px !important;/,
  );
  assert.match(
    enhanced,
    /\.candidate-card \{[\s\S]*?gap: 2px;[\s\S]*?padding-block: 0;[\s\S]*?\.candidate-card p \{[\s\S]*?line-height: 1\.15;/,
  );
  assert.match(
    enhanced,
    /\.candidate-card \.inline-actions \{[\s\S]*?display: grid !important;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
});

test("mantém conteúdo integral e seletor compacto no fluxo responsivo", () => {
  const enhanced = enhanceInboxRowReadability(page);

  assert.match(
    enhanced,
    /@media \(max-width: 520px\) \{[\s\S]*?grid-template-columns: 24px minmax\(0, 1fr\) !important;[\s\S]*?min-width: 24px;/,
  );
});

test("não duplica o aprimoramento", () => {
  const enhanced = enhanceInboxRowReadability(page);
  const repeated = enhanceInboxRowReadability(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-row-readability="enhanced"/g)?.length, 1);
});
