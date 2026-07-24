import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { sharedShellStyles } from "./shared-styles.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

const consumingModules = [
  "accounts-cards-page.js",
  "categories-page.js",
  "inbox-page.js",
  "pages.js",
  "settings-page.js",
] as const;

describe("shared shell styles", () => {
  it("defines the design tokens and shell chrome used across SSR pages", () => {
    const css = sharedShellStyles();

    assert.match(css, /--primary: #0f3d4c/);
    assert.match(css, /\.app-shell/);
    assert.match(css, /\.sidebar/);
    assert.match(css, /\.topbar/);
  });

  it("uses the light statement hover palette for neutral controls globally", () => {
    const css = sharedShellStyles();

    assert.match(css, /--neutral-control-hover:\s*#f1f7f9/);
    assert.match(css, /--neutral-control-border-hover:\s*#a5cbd6/);
    assert.match(css, /--neutral-control-active-hover:\s*#dceef3/);
    assert.match(css, /button\[aria-pressed\]:hover:not\(:disabled\)/);
    assert.match(css, /button\[aria-selected\]:focus-visible/);
    assert.match(css, /button\[aria-haspopup="listbox"\]:hover:not\(:disabled\)/);
    assert.match(css, /button\[role="menuitem"\][^{]+:hover:not\(:disabled\)/);
    assert.match(css, /background:\s*var\(--neutral-control-hover\)/);
    assert.match(css, /background:\s*var\(--neutral-control-active-hover\)/);
    assert.ok(
      css.indexOf('button[aria-pressed]:hover:not(:disabled)') >
        css.indexOf("button:hover:not(:disabled)"),
      "the neutral hover rule must override the generic dark primary hover",
    );
  });

  it("keeps hidden elements out of layout when components define display rules", () => {
    const css = sharedShellStyles();

    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  it("applies the authenticated content width globally", () => {
    const css = sharedShellStyles();

    assert.match(css, /\.main-area\s*>\s*main\s*\{/);
    assert.match(css, /max-width:\s*1800px/);
    assert.match(css, /width:\s*100%/);
    assert.match(css, /overflow-x:\s*hidden/);
  });

  for (const moduleFileName of consumingModules) {
    it(`${moduleFileName} composes its styles from sharedShellStyles()`, () => {
      const source = readFileSync(join(currentDir, moduleFileName), "utf8");

      assert.match(source, /sharedShellStyles\(\)/);
    });
  }
});
