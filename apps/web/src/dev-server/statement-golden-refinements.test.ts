import assert from "node:assert/strict";
import { Script } from "node:vm";

import { solverFinDesignTokens } from "../design-system/tokens.js";
import {
  statementGoldenRefinementRuntime,
  statementGoldenRefinementStyles,
} from "./statement-golden-refinements.js";
import { resolveCategoryDirection } from "./transactions-page-v2.js";

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
// G1: four glanceable indicators, each a soft card with its own glyph tile.
assert.ok(
  styles.includes(
    ".summary-total{align-items:flex-start;background:#fff;border:1px solid var(--line);border-radius:10px;",
  ),
);
assert.match(styles, /\.summary-total-icon\{[^}]*height:34px/);
assert.match(styles, /\.summary-total-copy>strong\{font-size:/);
assert.match(styles, /\[data-summary-total="income"\] \.summary-total-icon\{background:#dcfce7/);
assert.match(styles, /\[data-summary-total="expense"\] \.summary-total-icon\{background:#fee2e2/);
assert.ok(styles.includes("statement-status-details>summary{min-height:32px;padding:0}"));

// Mockup hierarchy regression: the canonical controls remain accessible.
assert.match(styles, /statement-query-heading>span\{display:block/);
assert.match(styles, /statement-sort-field\{min-width:0/);
assert.match(styles, /statement-body \.col-amount\{font-size:/);
assert.ok(
  styles.includes(`.col-description>strong{font-size:${solverFinDesignTokens.typography.sizes.md}`),
);
assert.ok(styles.includes(`.col-amount{font-size:${solverFinDesignTokens.typography.sizes.md}`));
// Reference chip: the category is a pill that carries its own glyph and its own tint.
assert.ok(styles.includes(".col-category{align-items:center;align-self:start;"));
assert.ok(styles.includes("width:max-content}"));
// The chip leads with the movement direction, so its tint follows the direction.
assert.match(
  styles,
  /\.col-category\[data-category-direction="in"\]\{background:#ecfdf5;color:#047857/,
);
assert.match(
  styles,
  /\.col-category\[data-category-direction="out"\]\{background:#fef2f2;color:#b91c1c/,
);
assert.match(
  styles,
  /\.col-category\[data-category-direction="transfer"\]\{background:#f1f5f9;color:#475569/,
);
assert.match(styles, /\.col-category-label\{overflow:hidden/);
// Reference description: a strong title over a muted second line.
assert.match(styles, /\.description-note\{color:var\(--muted\);display:block/);
// Reference selection control: a rounded square instead of the native circle.
assert.match(styles, /\.col-select input\[type="checkbox"\]\{appearance:none/);
assert.match(styles, /checkbox"\]\{appearance:none;background:#fff;border:1\.5px solid #cbd5e1/);
// Reference glyph tile keeps the larger reference geometry.
assert.match(styles, /\.col-row-icon\{[^}]*height:44px/);
// Reference status chip is a defined pill, not bare text.
assert.match(styles, /\.statement-status\{align-items:center;border:1px solid transparent/);
assert.match(styles, /\.statement-status-ok\{background:#dcfce7;border-color:#bbf7d0/);
// Reference header is a quiet label row, not a heavy uppercase band.
assert.match(
  styles,
  /\.statement-head\{background:transparent;border-bottom:1px solid var\(--line\)/,
);
// F-702-04: long amounts at 390px must wrap within their own summary card.
assert.match(styles, /@media\(min-width:361px\) and \(max-width:760px\)\{/);
assert.match(
  styles,
  /summary-total-copy>strong\{display:block;font-size:clamp\(11px,2\.9vw,13px\)/,
);
assert.match(styles, /summary-total-copy>strong\{[^}]*overflow-wrap:anywhere/);

// Progressive reduction drops the decorative glyph so long values keep their width.
assert.match(styles, /\.summary-total-icon\{display:none\}/);

// M01: show canonical category control, preserving its native query contract.
assert.match(styles, /statement-category-field\{min-width:0/);
assert.match(styles, /statement-category-field select\{background:/);
assert.match(styles, /statement-search-field\{grid-column:1\/-1/);
assert.match(styles, /statement-mobile-advanced-filters:not\(\[open\]\)/);

assert.match(styles, /statement-status-field/);
assert.match(styles, /statement-reconciliation-field/);

assert.match(runtime, /accountInput\.setAttribute\('form', filterForm\.id\)/);
assert.match(runtime, /context\?\.append\(accountControl\)/);
assert.match(styles, /statement-account-control\{min-width:0;width:100%\}/);
assert.match(styles, /statement-account-control \.account-field\{[^}]*max-width:none/);
// A subtle 1px contour must keep the full-width selector and right-aligned chevron.
assert.match(
  styles,
  /statement-account-control \.account-select-trigger\{background:transparent;border:1px solid var\(--line\);border-radius:10px;column-gap:/,
);
assert.match(
  styles,
  /statement-account-control \.account-select-chevron\{flex:0 0 auto;margin-inline-start:auto/,
);
assert.match(styles, /statement-body \.statement-status-label\{display:none\}/);

// CDI mobile regression: long labels must not expand the transaction row.
assert.match(styles, /account-remuneration-row \.description>strong\{[^}]*white-space:normal/);
assert.match(styles, /account-remuneration-audit summary\{[^}]*white-space:normal/);

// Density contract: desktop query keeps search and four essential selectors in one row.
assert.match(styles, /@media\(min-width:1101px\)\{/);
// M01 legibility: the compact bar is content-aware, so a fractional track cannot clip a
// default filter value or the search placeholder while the composition still measures green.
assert.match(
  styles,
  /grid-template-columns:minmax\(14rem,1\.5fr\) repeat\(4,minmax\(9\.375rem,1fr\)\) minmax\(0,max-content\)/,
);
assert.ok(styles.includes("statement-sort-field{grid-column:auto;min-width:0}"));
assert.ok(
  styles.includes("statement-filter-actions{grid-column:auto;flex-wrap:nowrap;min-width:0}"),
);
// Narrow desktops give the action group its own row instead of shrinking the filters.
assert.ok(styles.includes("@media(min-width:1101px) and (max-width:1339px){"));
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

// G2: the period shortcuts occupy their own grid row and reuse the canonical month/day/range
// query, so they can never steal the search track or hide an essential filter.
assert.match(styles, /statement-period-shortcuts\{[^}]*grid-column:1\/-1/);
assert.match(styles, /statement-period-chip\{[^}]*border-radius:999px/);
assert.match(styles, /statement-period-chip\[aria-current="true"\]\{/);
assert.match(styles, /statement-period-shortcuts\{display:none\}/);

// G3: the account control reads as the financial identity and the balance is maskable.
assert.match(styles, /statement-account-control \.account-select-icon\{[^}]*height:44px/);
assert.match(styles, /statement-account-control \.account-select-sub\{color:var\(--muted\)/);
assert.match(styles, /summary-balance-toggle\{[^}]*cursor:pointer/);
assert.match(runtime, /toggle\.setAttribute\('aria-pressed', String\(!hidden\)\)/);
assert.match(runtime, /target\.dataset\.balanceValue = target\.textContent/);

// G4: every filter carries its own glyph and the bar reports the active filter count.
assert.match(styles, /filter-field-heading\{align-items:center;display:inline-flex/);
assert.match(styles, /statement-filter-count\{[^}]*border-radius:999px/);
assert.match(styles, /statement-search-field input\{background-image:url\("data:image\/svg\+xml/);

// The category chip leads with the movement direction, so the mapping must be total and
// case-insensitive: the API has returned both spellings across environments.
assert.equal(resolveCategoryDirection("income"), "in");
assert.equal(resolveCategoryDirection("INCOME"), "in");
assert.equal(resolveCategoryDirection("transfer"), "transfer");
assert.equal(resolveCategoryDirection("TRANSFER"), "transfer");
assert.equal(resolveCategoryDirection("expense"), "out");
assert.equal(resolveCategoryDirection(""), "out");

// Both create and edit dialogs must remain centered within the viewport.
// The browser-level geometry check covers the actual layout; this guards the stylesheet.
assert.match(
  styles,
  /dialog\[data-modal\]\{[^}]*height:fit-content;margin:auto;max-height:calc\(100dvh - 32px\)/,
);
assert.match(
  styles,
  /dialog\[data-modal\]:has\(form\[data-method="PATCH"\]\)\{height:fit-content;margin:auto;max-height:calc\(100dvh - 32px\)\}/,
);

assert.match(styles, /statement-day-group>summary\.statement-date-group/);
assert.match(styles, /statement-day-group:not\(\[open\]\) \.statement-day-chevron/);
assert.match(
  styles,
  /grid-template-areas:"select icon date description category amount balance status actions"/,
);
assert.match(styles, /\.statement-body \.col-kind[^}]*display:none/);
assert.match(styles, /\.statement-body \.col-balance[^}]*text-align:right/);
assert.match(styles, /statement-day-field\{display:grid/);
