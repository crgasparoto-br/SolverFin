import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";

import { solverFinDesignTokens } from "../design-system/tokens.js";
import {
  installStatementMockupControls,
  statementMockupControlsRuntime,
  statementMockupControlsStyles,
} from "./statement-mockup-controls.js";

test("entry controls serialize to executable browser JavaScript", () => {
  const runtime = statementMockupControlsRuntime();
  const bodies = Array.from(
    runtime.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g),
    (match) => match[1],
  );
  assert.equal(bodies.length, 1);
  const body = bodies[0];
  assert.ok(body);
  assert.doesNotThrow(() => new Script(body));
  assert.match(runtime, /DOMContentLoaded/);
  assert.match(runtime, /data-statement-mockup-controls/);
});

test("entry styles consume shared target size and breakpoint", () => {
  const styles = statementMockupControlsStyles();
  assert.ok(styles.includes(`min-height:${solverFinDesignTokens.density.interactiveTargetMin}`));
  assert.ok(styles.includes(`@media(max-width:${solverFinDesignTokens.breakpoints.shellCompact})`));
  assert.match(
    styles,
    /@media\(max-width:440px\)\{[\s\S]*?statement-entry-kinds\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/,
  );
  assert.match(styles, /aria-checked="true"/);
  assert.match(styles, /statement-entry-kinds\[hidden\]/);
});

test("component without the canonical dialog leaves its root untouched", () => {
  let calls = 0;
  const root = {
    ownerDocument: {
      querySelector: () => {
        calls += 1;
        return null;
      },
    },
  } as unknown as HTMLElement;
  assert.doesNotThrow(() => installStatementMockupControls(root));
  assert.equal(calls, 1);
});

test("statement hierarchy keeps compact filters and quiet metadata", () => {
  const styles = statementMockupControlsStyles();
  assert.ok(styles.includes("position:absolute;right:12px;top:8px"));
  // Reference anatomy: the category owns a chip column, so it must not be flattened to plain text.
  assert.ok(styles.includes("col-category{background:#f1f5f9"));
  assert.ok(styles.includes("border-radius:999px"));
  assert.ok(styles.includes("statement-status-posted{background:transparent"));
  assert.ok(styles.includes("account-summary[data-mockup-composition]{row-gap:"));
});
