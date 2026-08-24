import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSolverFinDesignSystemCss } from "./styles.js";
import { solverFinDesignTokens } from "./tokens.js";

describe("canonical design token source", () => {
  it("derives dialog backdrop styling from the canonical color token", () => {
    const alternateBackdrop = "rgba(1, 2, 3, 0.44)";
    const css = createSolverFinDesignSystemCss({
      ...solverFinDesignTokens,
      colors: {
        ...solverFinDesignTokens.colors,
        dialogBackdrop: alternateBackdrop,
      },
    });

    assert.match(css, /--sf-color-dialog-backdrop:\s*rgba\(1, 2, 3, 0\.44\);/);
    assert.match(
      css,
      /\.sf-dialog::backdrop\s*\{[^}]*background:\s*var\(--sf-color-dialog-backdrop\);/s,
    );
    assert.doesNotMatch(css, /background:\s*rgba\(6,\s*25,\s*35,\s*0\.52\)/);
  });

  it("derives strong-action foregrounds from canonical semantic color tokens", () => {
    const alternatePrimaryForeground = "#F0F1F2";
    const alternateDangerForeground = "#010203";
    const css = createSolverFinDesignSystemCss({
      ...solverFinDesignTokens,
      colors: {
        ...solverFinDesignTokens.colors,
        onPrimary: alternatePrimaryForeground,
        onDanger: alternateDangerForeground,
      },
    });
    const primaryRule = [
      ".sf-button-primary {",
      "  background: var(--sf-color-primary);",
      "  border: 1px solid transparent;",
      "  color: var(--sf-color-on-primary);",
      "}",
    ].join("\n");
    const dangerRule = [
      ".sf-button-danger {",
      "  background: var(--sf-color-danger);",
      "  border: 1px solid transparent;",
      "  color: var(--sf-color-on-danger);",
      "}",
    ].join("\n");
    const dangerInteractionRule = [
      ".sf-button-danger:hover:not(:disabled),",
      ".sf-button-danger:focus-visible {",
      "  background: var(--sf-color-danger);",
      "  border-color: var(--sf-color-danger-border);",
      "  color: var(--sf-color-on-danger);",
      "}",
    ].join("\n");

    assert.ok(css.includes("--sf-color-on-primary: #F0F1F2;"));
    assert.ok(css.includes("--sf-color-on-danger: #010203;"));
    assert.ok(css.includes(primaryRule));
    assert.ok(css.includes(dangerRule));
    assert.ok(css.includes(dangerInteractionRule));
    assert.doesNotMatch(css, /color:\s*white\b/i);
  });
});
