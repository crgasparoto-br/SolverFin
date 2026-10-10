import assert from "node:assert/strict";
import { Script } from "node:vm";

import { solverFinDesignTokens } from "../design-system/tokens.js";
import {
  statementGoldenRefinementRuntime,
  statementGoldenRefinementStyles,
} from "./statement-golden-refinements.js";

const runtime = statementGoldenRefinementRuntime();
const bodies = Array.from(
  runtime.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g),
  (match) => match[1],
);
assert.equal(bodies.length, 2, "Both refinement and entry controls must be published.");
for (const body of bodies) {
  assert.ok(body, "Every emitted script must have a body.");
  assert.doesNotThrow(() => new Script(body));
}
assert.match(runtime, /data-statement-mockup-controls/);
assert.match(runtime, /metadata\.append\(category, kind\)/);
assert.match(runtime, /footer\.append\(date, balance\)/);
assert.match(runtime, /heading\.append\(context, balance\)/);
assert.match(runtime, /content\.append\(\.\.\.secondary\)/);
assert.match(runtime, /actions\?\.prepend\(primary\)/);
assert.match(runtime, /trigger\.focus\(\)/);
assert.doesNotMatch(runtime, /fetch\(|innerHTML|outerHTML/);
assert.match(runtime, /details\.open = activeCount\(\) > 0/);
assert.match(runtime, /details\.removeAttribute\('data-mobile-initialized'\)/);
assert.match(runtime, /field\.addEventListener\('change', updateTrigger\)/);
assert.match(
  runtime,
  /filterForm\.addEventListener\('reset', \(\) => queueMicrotask\(updateTrigger\)\)/,
);
assert.match(runtime, /Filtros ativos/);
const styles = statementGoldenRefinementStyles();
assert.ok(styles.includes(`@media(max-width:${solverFinDesignTokens.breakpoints.shellCompact})`));
assert.ok(styles.includes(`min-height:${solverFinDesignTokens.density.interactiveTargetMin}`));
assert.match(styles, /statement-row-metadata[^}]*display:flex/);
assert.match(styles, /statement-row-footer[^}]*display:flex/);
assert.match(styles, /div:nth-child\(2\)[^}]*grid-template-columns:subgrid[^}]*padding-right:0/);
assert.match(styles, /close-form[^}]*grid-column:2[^}]*position:static/);
assert.match(styles, /eyebrow[^}]*grid-column:1[^}]*min-width:0/);

assert.ok(styles.includes("account-summary[data-mockup-composition]"));
assert.ok(styles.includes("grid-template-columns:repeat(4,minmax(0,1fr))"));
assert.ok(styles.includes("statement-secondary-actions>summary::after{content:'⋮'"));
assert.ok(styles.includes("statement-entry-advanced-grid{display:grid"));
assert.ok(
  styles.includes('form[data-installment-mode="true"] .statement-entry-advanced{display:none}'),
);
assert.ok(styles.includes("summary-total{min-height:0;padding:"));
assert.ok(styles.includes("border-right:1px solid var(--line);min-height:0;"));
assert.ok(styles.includes("statement-status-details>summary{min-height:32px;padding:0}"));

// Mockup hierarchy regression: the canonical controls remain accessible.
assert.match(styles, /statement-query-heading>span\{display:block/);
assert.match(styles, /statement-sort-field\{min-width:0/);
assert.match(styles, /statement-body \.col-amount\{font-size:/);
assert.ok(
  styles.includes(`.col-description>strong{font-size:${solverFinDesignTokens.typography.sizes.md}`),
);
assert.ok(styles.includes(`.col-amount{font-size:${solverFinDesignTokens.typography.sizes.md}`));
assert.ok(styles.includes(".col-category{align-self:start;"));
assert.ok(styles.includes("width:max-content}"));
assert.match(styles, /summary-total\{border-right:0;border-bottom:/);

// M01: show canonical category control, preserving its native query contract.
assert.match(styles, /statement-category-field\{min-width:0/);
assert.match(styles, /statement-category-field select\{background:/);
assert.match(styles, /statement-search-field\{grid-column:1\/-1/);
assert.match(styles, /statement-mobile-advanced-filters:not\(\[open\]\)/);

assert.match(styles, /statement-status-field/);
assert.match(styles, /statement-reconciliation-field/);

assert.match(runtime, /accountInput\.setAttribute\('form', filterForm\.id\)/);
assert.match(runtime, /context\?\.append\(accountControl\)/);
assert.match(styles, /statement-account-control\{min-width:0\}/);

// CDI mobile regression: long labels must not expand the transaction row.
assert.match(styles, /account-remuneration-row \.description>strong\{[^}]*white-space:normal/);
assert.match(styles, /account-remuneration-audit summary\{[^}]*white-space:normal/);

// Density contract: desktop query keeps search and four essential selectors in one row.
assert.match(styles, /@media\(min-width:1101px\)\{/);
assert.match(styles, /\.filter-form\{grid-template-columns:repeat\(20,minmax\(0,1fr\)\)/);
assert.match(
  styles,
  /\.statement-context:has\(\.statement-account-control\) \.statement-context-main\{display:none\}/,
);

assert.match(
  runtime,
  /accountInput\.addEventListener\('change', \(\) => filterForm\.requestSubmit\(\)\)/,
);
assert.ok(styles.includes("statement-mobile-advanced-filters>summary{display:none}"));
assert.ok(styles.includes("statement-mobile-advanced-fields{display:contents}"));
assert.match(styles, /statement-row\.account-remuneration-row \.col-description\{min-width:0/);
