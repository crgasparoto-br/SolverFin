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
  "payables-receivables-page.js",
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

  for (const moduleFileName of consumingModules) {
    it(`${moduleFileName} composes its styles from sharedShellStyles()`, () => {
      const source = readFileSync(join(currentDir, moduleFileName), "utf8");

      assert.match(source, /sharedShellStyles\(\)/);
    });
  }
});
