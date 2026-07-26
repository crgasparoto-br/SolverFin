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

const legacyNeutralAliases = [
  ".ghost-btn",
  ".icon-btn",
  ".actions-item",
  ".status-icon-btn",
  ".account-select-trigger",
  ".close-form",
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
    assert.match(css, /--neutral-control-text-hover:\s*#0f3d4c/);
    assert.match(css, /button\[aria-pressed\][^{]+:hover:not\(:disabled\)/);
    assert.match(css, /button\[aria-selected\][^{]+:focus-visible/);
    assert.match(css, /button\[aria-haspopup="listbox"\][^{]+:hover:not\(:disabled\)/);
    assert.match(css, /button\[role="menuitem"\][^{]+:hover:not\(:disabled\)/);
    assert.match(css, /button\[data-button-variant="neutral"\][^{]+:hover:not\(:disabled\)/);
    assert.match(css, /\.tab-button/);
    assert.match(css, /\.sort-button/);
    assert.match(css, /\.month-nav-button/);
    assert.match(css, /\.icon-button/);
    assert.match(css, /background:\s*var\(--neutral-control-hover\)/);
    assert.match(css, /background:\s*var\(--neutral-control-active-hover\)/);
    assert.match(css, /color:\s*var\(--neutral-control-text-hover\)/);
    assert.ok(
      css.indexOf("button[aria-pressed]:not(.danger)") > css.indexOf("button:hover:not(:disabled)"),
      "the neutral hover rule must override the generic dark primary hover",
    );
  });

  it("maps legacy operational controls and close actions to the shared neutral contract", () => {
    const css = sharedShellStyles();
    const recurrenceSource = readFileSync(join(currentDir, "recurrences-section.js"), "utf8");

    for (const alias of legacyNeutralAliases) assert.ok(css.includes(alias), `${alias} is not neutral`);
    assert.match(
      css,
      /form\.close-form > button[^,{]*,\s*button\[data-button-variant="neutral"\][^{]+\{\s*background: var\(--surface\);\s*border-color: var\(--line\);\s*color: var\(--primary\);/,
    );
    assert.match(
      css,
      /form\.close-form > button[^,{]+:hover:not\(:disabled\)[^{]+\{\s*background: var\(--neutral-control-hover\);/,
    );
    assert.match(
      recurrenceSource,
      /<button type="button" class="close-form" data-recurrence-scope-cancel aria-label="Fechar">/,
    );
    assert.ok(
      css.lastIndexOf("form.close-form > button") > css.indexOf("button:hover:not(:disabled)"),
      "close actions must override the generic primary hover",
    );
  });

  it("keeps primary and destructive actions outside the neutral hover contract", () => {
    const css = sharedShellStyles();

    assert.match(
      css,
      /button:hover:not\(:disabled\), \.button-link:hover \{ background: var\(--primary-hover\); \}/,
    );
    assert.match(
      css,
      /:not\(\.danger\):not\(\.danger-action\):not\(\.danger-menu-item\):not\(\.danger-icon-button\)/,
    );
    assert.match(
      css,
      /\.danger-action:hover:not\(:disabled\),\s*\.danger-action:focus-visible \{ background: #fecaca; \}/,
    );
  });

  it("keeps icon-only destructive controls red on hover and keyboard focus", () => {
    const css = sharedShellStyles();
    const accountsCardsSource = readFileSync(join(currentDir, "accounts-cards-page.js"), "utf8");

    assert.match(accountsCardsSource, /class="icon-button danger-icon-button"/);
    assert.match(css, /:not\(\.danger-icon-button\):hover:not\(:disabled\)/);
    assert.match(css, /:not\(\.danger-icon-button\):focus-visible/);
    assert.match(
      css,
      /\.danger-icon-button:hover:not\(:disabled\),\s*\.danger-icon-button:focus-visible \{\s*background: var\(--danger-bg\);\s*border-color: #fecaca;\s*color: var\(--danger\);\s*\}/,
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
