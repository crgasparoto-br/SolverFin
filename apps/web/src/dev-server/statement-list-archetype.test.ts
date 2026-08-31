import assert from "node:assert/strict";
import test from "node:test";

import { renderStatementListArchetype } from "./statement-list-archetype.js";

test("statement A2 archetype composes Phase 3B primitives without rewriting fragments", () => {
  const html = renderStatementListArchetype({
    actionsHtml: '<button type="button">Nova receita</button>',
    filtersHtml: '<form data-test-filter><input name="q" /></form>',
    contextHtml:
      '<section class="statement-context"><strong>Conta internacional</strong><span>USD</span></section>',
    statusHtml: '<p class="statement-insight-context">Filtro do insight ativo</p>',
    summaryHtml: '<aside data-test-summary>Resumo</aside>',
    listHtml: '<section data-test-list>Movimentações</section>',
  });

  assert.match(html, /data-statement-archetype="A2"/);
  assert.match(html, /class="sf-page-header"/);
  assert.match(html, /class="sf-page-container statement-a2-workspace"/);
  assert.match(html, /class="sf-filter-bar"/);
  assert.match(html, /class="statement-layout" data-statement-workspace="true"/);
  assert.match(html, /Conta internacional/);
  assert.match(html, /USD/);
  assert.match(html, /Filtro do insight ativo/);
  assert.match(html, /data-test-summary/);
  assert.match(html, /data-test-list/);
});
