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
