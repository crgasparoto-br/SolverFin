import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { solverFinDesignTokens, type SolverFinDesignTokens } from "../design-system/tokens.js";
import { createSolverFinDesignSystemCss } from "../design-system/styles.js";
import { sharedShellStyles } from "./shared-styles.js";
import { solverFinSsrStyleContracts } from "./ssr-style-contract.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

const consumingModules = [
  ...new Set(
    solverFinSsrStyleContracts
      .filter((contract) => contract.shell === "authenticated")
      .map((contract) =>
        contract.routeId === "accountsCards"
          ? "accounts-cards/styles.js"
          : contract.moduleFileName,
      ),
  ),
].sort();

const legacyNeutralAliases = [
  ".ghost-btn",
  ".icon-btn",
  ".actions-item",
  ".status-icon-btn",
  ".account-select-trigger",
  ".close-form",
] as const;

describe("shared shell styles", () => {
  it("publishes the canonical design-system variables before legacy shell aliases", () => {
    const css = sharedShellStyles();

    assert.ok(css.includes(createSolverFinDesignSystemCss()));
    assert.match(css, /--sf-color-primary:\s*#0F3D4C/);
    assert.match(css, /--primary:\s*var\(--sf-color-primary\)/);
    assert.match(css, /--radius:\s*var\(--sf-radius-md\)/);
    assert.match(css, /--shadow-focus:\s*var\(--sf-shadow-focus\)/);
    assert.match(css, /\.app-shell/);
    assert.match(css, /\.sidebar/);
    assert.match(css, /\.topbar/);
  });

  it("derives executable SSR output from a changed canonical token without a second edit", () => {
    const changedTokens: SolverFinDesignTokens = {
      ...solverFinDesignTokens,
      colors: {
        ...solverFinDesignTokens.colors,
        primary: "#123456",
      },
      layout: {
        ...solverFinDesignTokens.layout,
        contentMaxWidth: "99rem",
      },
    };

    const css = sharedShellStyles(changedTokens);

    assert.match(css, /--sf-color-primary:\s*#123456/);
    assert.match(css, /--sf-layout-content-max-width:\s*99rem/);
    assert.doesNotMatch(css, /--primary:\s*#0F3D4C/i);
    assert.match(css, /--primary:\s*var\(--sf-color-primary\)/);
    assert.match(css, /max-width:\s*var\(--sf-layout-content-max-width\)/);
  });

  it("publishes layout, density, motion and responsive foundation tokens", () => {
    const css = sharedShellStyles();

    assert.match(css, /--sf-density-interactive-target-min:\s*2\.75rem/);
    assert.match(css, /--sf-layout-gutter-mobile:\s*0\.875rem/);
    assert.match(css, /--sf-layout-gutter-desktop:\s*1\.25rem/);
    assert.match(css, /--sf-layout-grid-gap:\s*1rem/);
    assert.match(css, /--sf-motion-fast:\s*120ms ease-out/);
    assert.ok(
      css.includes(`@media (max-width: ${solverFinDesignTokens.breakpoints.shellCompact})`),
    );
    assert.match(css, /--sf-breakpoint-dialog-stack:\s*56\.25rem/);
  });

  it("gives positive, negative, neutral, attention and information states a non-color marker", () => {
    const css = createSolverFinDesignSystemCss();

    for (const state of ["positive", "negative", "neutral", "attention", "information"] as const) {
      assert.match(css, new RegExp(`\\.sf-semantic-state\\[data-state="${state}"\\]`));
      assert.match(css, new RegExp(`--sf-state-${state}-marker:`));
    }

    assert.match(css, /\.sf-semantic-state::before\s*\{[^}]*content:\s*var\(--sf-state-marker\)/s);
    assert.match(css, /border-inline-start-width:\s*var\(--sf-space-1\)/);
  });

  it("uses the light statement hover palette for neutral controls globally", () => {
    const css = sharedShellStyles();

    assert.match(css, /--neutral-control-hover:\s*var\(--sf-color-neutral-control-hover\)/);
    assert.match(
      css,
      /--neutral-control-border-hover:\s*var\(--sf-color-neutral-control-border-hover\)/,
    );
    assert.match(
      css,
      /--neutral-control-active-hover:\s*var\(--sf-color-neutral-control-active-hover\)/,
    );
    assert.match(
      css,
      /--neutral-control-text-hover:\s*var\(--sf-color-neutral-control-text-hover\)/,
    );
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

    for (const alias of legacyNeutralAliases) {
      assert.ok(css.includes(alias), `${alias} is not neutral`);
    }
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

  it("keeps legacy semantic resting states outside the neutral base selector", () => {
    const css = sharedShellStyles();
    const transactionsSource = readFileSync(join(currentDir, "transactions-page.js"), "utf8");
    const baseRuleStart = css.indexOf("form.close-form > button");
    const hoverRuleStart = css.indexOf("button[aria-pressed]", baseRuleStart);
    const neutralBaseRule = css.slice(baseRuleStart, hoverRuleStart);

    assert.doesNotMatch(neutralBaseRule, /\.status-icon-btn/);
    assert.doesNotMatch(neutralBaseRule, /\.actions-item/);
    assert.match(
      transactionsSource,
      /\.status-icon-btn\[data-status-option=posted\]\.active \{ background: #e0f2fe;/,
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
      /\.danger-action:hover:not\(:disabled\),\s*\.danger-action:focus-visible \{ background: var\(--sf-color-danger-border\); \}/,
    );
  });

  it("keeps icon-only destructive controls red on hover and keyboard focus", () => {
    const css = sharedShellStyles();
    const accountsCardsSource = readFileSync(
      join(currentDir, "accounts-cards", "components.js"),
      "utf8",
    );

    assert.match(accountsCardsSource, /class="icon-button danger-icon-button"/);
    assert.match(css, /:not\(\.danger-icon-button\):hover:not\(:disabled\)/);
    assert.match(css, /:not\(\.danger-icon-button\):focus-visible/);
    assert.match(
      css,
      /\.danger-icon-button:hover:not\(:disabled\),\s*\.danger-icon-button:focus-visible \{\s*background: var\(--danger-bg\);\s*border-color: var\(--sf-color-danger-border\);\s*color: var\(--danger\);\s*\}/,
    );
  });

  it("keeps hidden elements out of layout when components define display rules", () => {
    const css = sharedShellStyles();

    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  it("applies the authenticated content width through the canonical layout token", () => {
    const css = sharedShellStyles();

    assert.match(css, /\.main-area\s*>\s*main\s*\{/);
    assert.match(css, /--sf-layout-content-max-width:\s*112\.5rem/);
    assert.match(css, /max-width:\s*var\(--sf-layout-content-max-width\)/);
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
