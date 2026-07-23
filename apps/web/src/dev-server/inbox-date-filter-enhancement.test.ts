import assert from "node:assert/strict";
import test from "node:test";

import {
  enhanceInboxDateFilter,
  normalizeInboxFilterDate,
  resolveInboxFilterDate,
} from "./inbox-date-filter-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body>
    <select id="import-line-filter"></select>
    <div id="import-batch-detail"></div>
  </body>
</html>`;

test("normaliza datas mesmo quando o conteúdo acessível está duplicado", () => {
  assert.equal(normalizeInboxFilterDate("23/07/202623/07/2026"), "2026-07-23");
  assert.equal(normalizeInboxFilterDate("Data: 2026-07-15"), "2026-07-15");
  assert.equal(normalizeInboxFilterDate("31/02/2026"), undefined);
});

test("prioriza o valor integral persistido pelo aprimoramento de acessibilidade", () => {
  assert.equal(
    resolveInboxFilterDate([undefined, "15/07/2026", "15/07/202615/07/2026"]),
    "2026-07-15",
  );
});

test("injeta correção para filtrar, ordenar e atualizar o contador", () => {
  const enhanced = enhanceInboxDateFilter(page);

  assert.match(enhanced, /data-inbox-date-filter="fixed"/);
  assert.match(enhanced, /value\?\.dataset\.fullValue/);
  assert.match(enhanced, /row-summary-value-preview/);
  assert.match(enhanced, /row\.hidden = !visible/);
  assert.match(enhanced, /inbox-visible-lines/);
  assert.match(enhanced, /inbox-date-empty-state/);
  assert.match(enhanced, /MutationObserver\(schedule\)/);
});

test("não duplica a correção e não altera páginas sem filtro de linhas", () => {
  const enhanced = enhanceInboxDateFilter(page);
  assert.equal(enhanceInboxDateFilter(enhanced), enhanced);
  assert.equal(
    enhanceInboxDateFilter("<!doctype html><html><body><main>Dashboard</main></body></html>"),
    "<!doctype html><html><body><main>Dashboard</main></body></html>",
  );
});
