import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxTableLayout } from "./inbox-table-layout-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body><main class="inbox-page"><div id="import-batch-detail"></div></main></body>
</html>`;

test("adiciona uma visão tabular compacta e responsiva às linhas da inbox", () => {
  const enhanced = enhanceInboxTableLayout(page);

  assert.match(enhanced, /data-inbox-table-layout="enhanced"/);
  assert.match(enhanced, /data-inbox-table-layout-script="enhanced"/);
  assert.match(
    enhanced,
    /\["selection", "Sel\."\],[\s\S]*?\["status", "Status"\],[\s\S]*?\["observations", "Observações"\],[\s\S]*?\["actions", "Ações"\]/,
  );
  assert.match(enhanced, /role", "table"/);
  assert.match(enhanced, /aria-label", "Linhas importadas para revisão"/);
  assert.match(enhanced, /MutationObserver\(enhanceTable\)/);
});

test("preserva os dados e transforma apenas a apresentação das colunas", () => {
  const enhanced = enhanceInboxTableLayout(page);

  assert.match(enhanced, /\["Conta de referência", "account"\]/);
  assert.match(enhanced, /\["Outra conta", "other-account"\]/);
  assert.match(enhanced, /otherAccountValue\.dataset\.fullValue/);
  assert.match(enhanced, /legacyNotice/);
  assert.match(enhanced, /candidateList/);
  assert.match(enhanced, /row\.setAttribute\("role", "row"\)/);
});

test("usa ações compactas por ícone com nome acessível e tooltip", () => {
  const enhanced = enhanceInboxTableLayout(page);

  assert.match(enhanced, /makeIconOnly/);
  assert.match(enhanced, /setAttribute\("aria-label", label\)/);
  assert.match(enhanced, /setAttribute\("title", label\)/);
  assert.match(enhanced, /"Corrigir linha"/);
  assert.match(enhanced, /"Confirmar linha"/);
  assert.match(enhanced, /"Rejeitar linha"/);
  assert.match(enhanced, /"Ver no Extrato"/);
});

test("mantém tabela no desktop e retorna ao fluxo vertical em telas menores", () => {
  const enhanced = enhanceInboxTableLayout(page);

  assert.match(
    enhanced,
    /@media \(min-width: 1024px\) \{[\s\S]*?grid-template-columns: var\(--inbox-table-columns\) !important;/,
  );
  assert.match(enhanced, /@media \(max-width: 1023px\)/);
  assert.match(enhanced, /@media \(max-width: 520px\)/);
  assert.match(enhanced, /overflow-x: auto/);
  assert.match(enhanced, /:has\(\.import-table-select-cell input:checked\)/);
  assert.match(
    enhanced,
    /\.import-table-select-cell input\[type="checkbox"\] \{[\s\S]*?height: 24px;[\s\S]*?width: 24px;/,
  );
});

test("não duplica o aprimoramento quando aplicado novamente", () => {
  const enhanced = enhanceInboxTableLayout(page);
  const repeated = enhanceInboxTableLayout(enhanced);

  assert.equal(repeated, enhanced);
  assert.equal(repeated.match(/data-inbox-table-layout="enhanced"/g)?.length, 1);
  assert.equal(repeated.match(/data-inbox-table-layout-script="enhanced"/g)?.length, 1);
});
