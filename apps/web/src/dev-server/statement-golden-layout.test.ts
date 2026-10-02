import assert from "node:assert/strict";
import test from "node:test";

import {
  renderStatementListArchetype,
  statementListArchetypeStyles,
} from "./statement-list-archetype.js";

const fragments = {
  actionsHtml: '<button data-quick-kind="expense">Create</button>',
  contextHtml: '<section class="statement-context">Account USD</section>',
  summaryHtml: '<aside class="account-summary"><strong>USD 12.34</strong></aside>',
  filtersHtml:
    '<form method="get" action="/lancamentos"><select id="statement-sort" name="sort"><option value="date_asc">Date</option></select><input name="profileId" value="profile-b"></form>',
  listHtml: '<section class="statement-panel">Transaction EUR 98.76</section>',
  statusHtml: '<p data-insight-context>Active filter</p>',
};

test("golden composition retains canonical financial fragments without changing values or currency", () => {
  const html = renderStatementListArchetype(fragments);
  for (const fragment of Object.values(fragments)) assert.ok(html.includes(fragment));
  assert.ok(html.indexOf(fragments.contextHtml) < html.indexOf(fragments.summaryHtml));
  assert.ok(html.indexOf(fragments.summaryHtml) < html.indexOf(fragments.filtersHtml));
  assert.ok(html.indexOf(fragments.filtersHtml) < html.indexOf(fragments.listHtml));
  assert.match(html, /data-golden-screen-state="candidate"/);
  assert.doesNotMatch(html, /data-golden-screen-state="approved"/);
});

test("SSR leaves the complete GET form available and enhancement preserves canonical controls", () => {
  const html = renderStatementListArchetype(fragments);
  assert.match(html, /aria-expanded="true" aria-controls="statement-query-fields" hidden/);
  assert.ok(html.includes(fragments.filtersHtml));
  assert.match(html, /select\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(html, /button\.disabled = select\.disabled \|\| option\.disabled/);
  assert.match(html, /if \(buttons\.length !== select\.options\.length\) return/);
  const script = html.match(
    /<script data-statement-a2-context-runtime="true">([\s\S]*?)<\/script>/,
  )?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("summary and statement use a vertical composition and secondary row metadata", () => {
  const css = statementListArchetypeStyles();
  assert.match(css, /\.statement-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.account-summary\s*\{[^}]*position:\s*static/);
  assert.match(
    css,
    /grid-template-areas:\s*"select date description description status amount actions"\s*"select date category kind status balance actions"/,
  );
  assert.match(css, /\.statement-kind-tabs/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
