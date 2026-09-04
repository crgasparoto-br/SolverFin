import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const outputFiles = [
  "apps/web/src/dev-server-account-identifiers.test.ts",
  "apps/web/src/dev-server-accounts-cards-actions.test.ts",
  "apps/web/src/dev-server.test.ts",
  "apps/web/src/dev-server/accounts-cards/components.ts",
  "apps/web/src/dev-server/accounts-cards/page.ts",
  "apps/web/src/dev-server/accounts-cards/styles.ts",
  "apps/web/src/dev-server/accounts-cards/view-model.test.ts",
  "apps/web/src/dev-server/accounts-cards/view-model.ts",
  "apps/web/src/dev-server/legacy-html-post-processors.test.ts",
  "scripts/statement-visual/accounts-cards-interface.mjs",
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "scripts/statement-visual/issue-610-cards-semantic-interactions.mjs",
  "scripts/validate-accounts-cards-ui-boundaries.mjs",
];

function replaceExact(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`Diagnostic replacement not found: ${label} in ${path}`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "scripts/statement-visual/accounts-cards-interface.mjs",
  "      const detailText = detail?.textContent || '';\n",
  "      const currencyFields = Array.from(detail?.querySelectorAll('.resource-detail-field') ?? []);\n      const currencyField = currencyFields.find((field) =>\n        field.querySelector(':scope > span')?.textContent?.trim() === 'Moeda' ||\n        /Moeda (indisponível|não informada)/i.test(field.textContent || '')\n      );\n      const currencyValue = currencyField?.querySelector(':scope > strong')?.textContent?.trim() || '';\n",
  "structural currency field",
);
replaceExact(
  "scripts/statement-visual/accounts-cards-interface.mjs",
  "        currencyContextVisible: /Moeda/i.test(detailText) && (/\\b(BRL|USD|EUR)\\b/.test(detailText) || /Moeda (indisponível|não informada)/i.test(detailText)),\n",
  "        currencyContextVisible: Boolean(currencyField) && (currencyValue.length > 0 || /Moeda (indisponível|não informada)/i.test(currencyField.textContent || '')),\n",
  "currency assertion",
);

replaceExact(
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "const accountsCardsSelectors = {\n  primary: \"[data-context-action]\",\n  neutral: \"#cards-tab\",\n  destructive: \".action-menu-popover:not([hidden]) .action-menu-item.is-danger:not(:disabled)\",\n};\n",
  "const accountsCardsSelectors = {\n  primary: \".resource-detail-actions .resource-primary-action:not(:disabled)\",\n  neutral: \".resource-detail-actions .secondary-button:not(:disabled)\",\n  destructive: \".resource-detail-actions .danger-button:not(:disabled)\",\n};\n",
  "A3 direct-action selectors",
);
replaceExact(
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "  const menuOpened = await evaluate(\n    browser.cdp,\n    `(() => {\n      const triggers = Array.from(document.querySelectorAll('.item-actions .action-menu-trigger'));\n      const trigger = triggers.find((candidate) =>\n        candidate.parentElement?.querySelector('.action-menu-item.is-danger:not(:disabled)')\n      );\n      if (!trigger) return false;\n      trigger.scrollIntoView({ block: \"center\" });\n      trigger.click();\n      return trigger.getAttribute('aria-expanded') === 'true';\n    })()`,\n  );\n  assert.equal(menuOpened, true, \"Unable to open an accounts/cards destructive action menu.\");\n  await sleep(120);\n",
  "  await sleep(120);\n",
  "retired action-menu setup",
);
replaceExact(
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "  checkNeutral(\"cards tab\", hoverStyles.neutral);\n",
  "  checkNeutral(\"secondary resource action\", hoverStyles.neutral);\n",
  "neutral action label",
);
replaceExact(
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "    \"Issue 537 destructive menu action has no visible keyboard focus indicator\",\n",
  "    \"Issue 537 destructive action has no visible keyboard focus indicator\",\n",
  "destructive focus message",
);
replaceExact(
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "    styles.backgroundColor === \"rgb(255, 241, 240)\",\n    `Issue 537 destructive menu action lost its red ${state} surface`,\n",
  "    styles.backgroundColor === \"rgb(254, 226, 226)\",\n    `Issue 537 destructive action lost its semantic ${state} surface`,\n",
  "destructive surface semantics",
);
replaceExact(
  "scripts/statement-visual/issue-537-hover-states.mjs",
  "    styles.color === \"rgb(143, 29, 21)\",\n    `Issue 537 destructive menu action lost its red ${state} text/icon color`,\n",
  "    styles.color === \"rgb(220, 38, 38)\",\n    `Issue 537 destructive action lost its semantic ${state} text/icon color`,\n",
  "destructive color semantics",
);

replaceExact(
  "apps/web/src/dev-server/accounts-cards/styles.ts",
  "    .danger-button { background: var(--surface); border: 1px solid #fecaca; color: var(--danger); }\n",
  "    .danger-button { background: var(--surface); border: 1px solid #fecaca; color: var(--danger); }\n    .danger-button:hover:not(:disabled), .danger-button:focus-visible { background: var(--danger-bg); border-color: var(--sf-color-danger-border); color: var(--danger); }\n",
  "direct destructive hover/focus styling",
);

execFileSync("node_modules/.bin/prettier", [".", "--write"], { stdio: "inherit" });

for (const path of outputFiles) {
  const encoded = readFileSync(path).toString("base64");
  console.log(`FORMATTED_FILE_B64 ${path} ${encoded}`);
}

process.exitCode = 1;
