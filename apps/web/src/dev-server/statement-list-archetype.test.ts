import assert from "node:assert/strict";
import test from "node:test";

import {
  renderStatementListArchetype,
  statementListArchetypeStyles,
} from "./statement-list-archetype.js";

test("statement A2 archetype composes Phase 3B primitives without rewriting fragments", () => {
  const html = renderStatementListArchetype({
    actionsHtml:
      '<div class="statement-heading-actions"><button data-quick-kind="expense">Nova despesa</button><button data-quick-kind="income">Nova receita</button></div>',
    filtersHtml: '<form data-test-filter><input name="q" /></form>',
    contextHtml:
      '<section class="statement-context"><strong>Conta internacional</strong><span>USD</span></section>',
    statusHtml: '<p class="statement-insight-context">Filtro do insight ativo</p>',
    summaryHtml: "<aside data-test-summary>Resumo</aside>",
    listHtml: "<section data-test-list>Movimentações</section>",
  });

  assert.match(html, /data-statement-archetype="A2"/);
  assert.match(html, /data-golden-screen="statement"/);
  assert.match(html, /class="statement-breadcrumb"/);
  assert.ok(html.includes("<span>Lançamentos</span>"));
  assert.ok(html.includes("<strong>Extrato bancário</strong>"));
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

test("statement golden screen styles preserve one dominant action and reduce card-heavy hierarchy", () => {
  const css = statementListArchetypeStyles();

  assert.match(
    css,
    /button\[data-quick-kind="expense"\][^{]*\{[^}]*box-shadow:/s,
    "expense remains the visually dominant quick action",
  );
  assert.match(
    css,
    /button\[data-quick-kind="transfer"\][\s\S]*button\[data-quick-kind="income"\][^{]*\{[^}]*background:\s*var\(--surface\)/s,
    "secondary quick actions use quieter surface treatment",
  );
  assert.match(
    css,
    /\.summary-total\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;/s,
    "summary totals no longer render as independent cards",
  );
  assert.match(
    css,
    /\.summary-balance\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
    "main balance is driven by typography and spacing instead of a card surface",
  );
  assert.match(
    css,
    /\.statement-body \.col-category,[\s\S]*\.statement-body \.col-balance\s*\{[^}]*color:\s*var\(--muted\)/s,
    "secondary transaction metadata is visually quieter than description and amount",
  );
  assert.match(
    css,
    /body dialog\[data-modal\] \.modal-panel form\[data-form\][^{]*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
    "desktop transaction dialogs use a calmer two-column form instead of the legacy dense grid",
  );
  assert.match(
    css,
    /form\[data-form\] > \[data-field="kind"\][^{]*\{[^}]*grid-column:\s*1 \/ -1;/s,
    "transaction type spans the desktop grid so transfer source and destination stay paired",
  );
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*body dialog\[data-modal\] \.modal-panel form\[data-form\][^{]*\{[^}]*grid-template-columns:\s*1fr;/s,
    "transaction dialogs reflow to one column on mobile",
  );
});

test("statement mockup filters remain independently visible and reflow on mobile", () => {
  const css = statementListArchetypeStyles();
  assert.match(css, /\.filter-form :is\(\.statement-kind-field, \.statement-status-field, \.statement-reconciliation-field, \.statement-category-field\) \{ grid-column: span 3; \}/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*\.filter-form :is\(\.account-field, \.month-field, \.statement-kind-field, \.statement-status-field, \.statement-reconciliation-field, \.statement-category-field, \.statement-sort-field\) \{ grid-column: auto; \}/);
  assert.doesNotMatch(css, /\[data-statement-options="collapsed"\] \.statement-(?:kind|status|reconciliation|category)-field \{ display: none; \}/);
});
