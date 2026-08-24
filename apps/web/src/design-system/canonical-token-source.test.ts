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

    assert.match(css, /--sf-color-on-primary:\s*#F0F1F2;/);
    assert.match(css, /--sf-color-on-danger:\s*#010203;/);
    assert.match(
      css,
      /\.sf-button-primary\s*\{[^}]*color:\s*var\(--sf-color-on-primary\);/s,
    );
    assert.match(
      css,
      /\.sf-button-danger\s*\{[^}]*color:\s*var\(--sf-color-on-danger\);/s,
    );
    assert.match(
      css,
      /\.sf-button-danger:hover:not\(:disabled\),[\s\S]*?\.sf-button-danger:focus-visible\s*\{[^}]*color:\s*var\(--sf-color-on-danger\);/s,
    );
    assert.doesNotMatch(css, /color:\s*white\b/i);
  });
});
