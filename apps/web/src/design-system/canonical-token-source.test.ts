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
});
