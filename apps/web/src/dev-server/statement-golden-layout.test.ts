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
  filtersHtml: [
    '<form method="get" action="/lancamentos">',
    '<select id="statement-sort" name="sort">',
    '<option value="date_asc">Date</option></select>',
    '<input name="profileId" value="profile-b"></form>',
  ].join(""),
  listHtml: '<section class="statement-panel">Transaction EUR 98.76</section>',
  statusHtml: "<p data-insight-context>Active filter</p>",
};

test("golden composition preserves financial fragments and currencies", () => {
  const html = renderStatementListArchetype(fragments);
  for (const fragment of Object.values(fragments)) {
    assert.ok(html.includes(fragment));
  }
  assert.ok(html.indexOf(fragments.contextHtml) < html.indexOf(fragments.summaryHtml));
  assert.ok(html.indexOf(fragments.summaryHtml) < html.indexOf(fragments.filtersHtml));
  assert.ok(html.indexOf(fragments.filtersHtml) < html.indexOf(fragments.listHtml));
  assert.match(html, /data-golden-screen-state="candidate"/);
  assert.doesNotMatch(html, /data-golden-screen-state="approved"/);
});

test("SSR retains the GET form and canonical controls", () => {
  const html = renderStatementListArchetype(fragments);
  assert.match(html, /aria-expanded="true" aria-controls="statement-query-fields" hidden/);
  assert.ok(html.includes(fragments.filtersHtml));
  const runtime = /<script data-statement-a2-context-runtime="true">([\s\S]*?)<\/script>/;
  const script = html.match(runtime)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("summary and statement use a vertical composition and secondary row metadata", () => {
  const css = statementListArchetypeStyles();
  assert.match(css, /\[data-statement-archetype="A2"\] \{ display: grid;/);
  assert.match(css, /\.statement-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.account-summary\s*\{[^}]*position:\s*static/);
  const rows = /grid-template-areas:\s*"([^"]+)"\s*"([^"]+)"/.exec(css);
  assert.equal(rows?.[1], "select date description description status amount actions");
  assert.equal(rows?.[2], "select date category kind status balance actions");
  assert.doesNotMatch(css, /statement-kind-native/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("narrow controls shrink while table overflow stays local", () => {
  const css = statementListArchetypeStyles();
  assert.match(css, /\.statement-table\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.account-select-text\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.account-select-trigger\s*\{[^}]*width:\s*100%/);
});
