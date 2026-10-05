import assert from "node:assert/strict";
import { Script } from "node:vm";

import { solverFinDesignTokens } from "../design-system/tokens.js";
import {
  statementGoldenRefinementRuntime,
  statementGoldenRefinementStyles,
} from "./statement-golden-refinements.js";

const runtime = statementGoldenRefinementRuntime();
const bodies = Array.from(runtime.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g), (match) => match[1]);
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
assert.doesNotMatch(runtime, /details\.open = true|fetch\(|innerHTML|outerHTML/);
const styles = statementGoldenRefinementStyles();
assert.ok(styles.includes(`@media(max-width:${solverFinDesignTokens.breakpoints.shellCompact})`));
assert.ok(styles.includes(`min-height:${solverFinDesignTokens.density.interactiveTargetMin}`));
assert.match(styles, /statement-row-metadata[^}]*display:flex/);
assert.match(styles, /statement-row-footer[^}]*display:flex/);
assert.match(styles, /div:nth-child\(2\)[^}]*grid-template-columns:subgrid[^}]*padding-right:0/);
assert.match(styles, /close-form[^}]*grid-column:2[^}]*position:static/);
assert.match(styles, /eyebrow[^}]*grid-column:1[^}]*min-width:0/);
