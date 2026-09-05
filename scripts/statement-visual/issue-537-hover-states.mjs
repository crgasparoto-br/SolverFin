import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const scenarios = [];
const accountsCardsSelectors = {
  primary: ".resource-detail-actions .resource-primary-action:not(:disabled)",
  neutral: ".resource-detail-actions .secondary-button:not(:disabled)",
  destructive: ".resource-detail-actions .danger-button:not(:disabled)",
};
const statementNeutralSelectors = {
  accountPicker: ".account-select-trigger",
  monthNavigation: '.icon-btn[data-month-step="-1"]',
  currentMonth: ".ghost-btn[data-month-current]",
  status: '.status-icon-btn[data-status-option="posted"]',
  recurrenceClose: "button.close-form[data-recurrence-scope-cancel]",
};
if (!chromePath) throw new Error("CHROME_BIN is required for issue 537 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1440, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await validateAccountsCardsStates();
  await validateStatementNeutralStates(1440, 900, "desktop");
  await validateStatementNeutralStates(390, 844, "mobile");
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-537-hover-states.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 537 hover and focus visual validation passed.");
}

async function validateAccountsCardsStates() {
  await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
  await sleep(500);
  await sleep(120);
  await enablePseudoStateDomains();

  const nodes = await findNodes(accountsCardsSelectors);
  await forceState(browser.cdp, nodes.primary, ["hover"]);
  await forceState(browser.cdp, nodes.neutral, ["hover"]);
  await forceState(browser.cdp, nodes.destructive, ["hover"]);
  await sleep(250);

  const hoverStyles = await readStyles(accountsCardsSelectors);
  await screenshot(browser.cdp, join(outputDir, "issue-537-hover-states-desktop-1440x900.png"));
  scenarios.push({
    route: "/contas-cartoes",
    kind: "hover",
    viewport: "1440x900",
    screenshot: "issue-537-hover-states-desktop-1440x900.png",
    styles: hoverStyles,
  });

  check(
    hoverStyles.primary.backgroundColor === "rgb(10, 46, 58)",
    "Issue 537 primary action lost its dark hover surface",
    hoverStyles.primary,
  );
  checkNeutral("secondary resource action", hoverStyles.neutral);
  checkDestructive("hover", hoverStyles.destructive);

  await forceState(browser.cdp, nodes.primary, []);
  await forceState(browser.cdp, nodes.neutral, []);
  await forceState(browser.cdp, nodes.destructive, ["focus", "focus-visible"]);
  await sleep(250);

  const focusStyles = await readStyles(accountsCardsSelectors);
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-537-destructive-focus-desktop-1440x900.png"),
  );
  scenarios.push({
    route: "/contas-cartoes",
    kind: "focus-visible",
    viewport: "1440x900",
    screenshot: "issue-537-destructive-focus-desktop-1440x900.png",
    styles: focusStyles,
  });

  checkDestructive("focus-visible", focusStyles.destructive);
  check(
    focusStyles.destructive.boxShadow !== "none" ||
      (focusStyles.destructive.outlineStyle !== "none" &&
        focusStyles.destructive.outlineWidth !== "0px"),
    "Issue 537 destructive action has no visible keyboard focus indicator",
    focusStyles.destructive,
  );
}

async function validateStatementNeutralStates(width, height, label) {
  await setViewport(browser.cdp, width, height);
  await navigate(browser.cdp, `${baseUrl}/lancamentos`);
  await sleep(500);
  await evaluate(
    browser.cdp,
    `(() => {
      const dialog = document.querySelector("[data-recurrence-scope-modal]");
      if (dialog && typeof dialog.showModal === "function" && !dialog.open) {
        dialog.showModal();
      }
      document.querySelector(${JSON.stringify(statementNeutralSelectors.recurrenceClose)})?.scrollIntoView({ block: "center" });
    })()`,
  );
  await sleep(120);
  await enablePseudoStateDomains();

  const nodes = await findNodes(statementNeutralSelectors);
  for (const nodeId of Object.values(nodes)) {
    await forceState(browser.cdp, nodeId, ["hover"]);
  }
  await sleep(250);

  const hoverStyles = await readStyles(statementNeutralSelectors);
  const hoverScreenshot = `issue-537-statement-neutral-hover-${label}-${width}x${height}.png`;
  await screenshot(browser.cdp, join(outputDir, hoverScreenshot));
  scenarios.push({
    route: "/lancamentos",
    kind: "neutral-hover",
    viewport: `${width}x${height}`,
    screenshot: hoverScreenshot,
    styles: hoverStyles,
  });

  for (const [name, styles] of Object.entries(hoverStyles)) {
    checkNeutral(name, styles);
  }

  for (const nodeId of Object.values(nodes)) {
    await forceState(browser.cdp, nodeId, []);
  }
  await forceState(browser.cdp, nodes.recurrenceClose, ["focus", "focus-visible"]);
  await sleep(250);

  const focusStyles = await readStyles(statementNeutralSelectors);
  const focusScreenshot = `issue-537-statement-neutral-focus-${label}-${width}x${height}.png`;
  await screenshot(browser.cdp, join(outputDir, focusScreenshot));
  scenarios.push({
    route: "/lancamentos",
    kind: "neutral-focus-visible",
    viewport: `${width}x${height}`,
    screenshot: focusScreenshot,
    styles: focusStyles,
  });

  checkNeutral("recurrence close focus", focusStyles.recurrenceClose);
  check(
    focusStyles.recurrenceClose.boxShadow !== "none",
    `Issue 537 recurrence close control has no visible keyboard focus ring at ${width}x${height}`,
    focusStyles.recurrenceClose,
  );
}

async function enablePseudoStateDomains() {
  await browser.cdp.send("DOM.enable");
  await browser.cdp.send("CSS.enable");
}

async function findNodes(selectors) {
  const { root } = await browser.cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  return Object.fromEntries(
    await Promise.all(
      Object.entries(selectors).map(async ([name, selector]) => [
        name,
        await findNode(browser.cdp, root.nodeId, selector),
      ]),
    ),
  );
}

async function findNode(cdp, rootNodeId, selector) {
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: rootNodeId,
    selector,
  });
  assert.ok(nodeId, `Unable to find visual validation control: ${selector}`);
  return nodeId;
}

async function forceState(cdp, nodeId, forcedPseudoClasses) {
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses });
}

async function readStyles(selectors) {
  return evaluate(
    browser.cdp,
    `(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          color: style.color,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      };
      return Object.fromEntries(
        Object.entries(${JSON.stringify(selectors)}).map(([name, selector]) => [
          name,
          read(selector),
        ]),
      );
    })()`,
  );
}

function checkNeutral(name, styles) {
  check(
    styles && isLightNeutral(styles.backgroundColor),
    `Issue 537 neutral control ${name} still receives a dark hover/focus surface`,
    styles,
  );
  check(
    styles && styles.color !== "rgb(255, 255, 255)",
    `Issue 537 neutral control ${name} inverts its text to white`,
    styles,
  );
}

function isLightNeutral(value) {
  const match = /^rgba?\((\d+), (\d+), (\d+)/.exec(value ?? "");
  if (!match) return false;
  const channels = match.slice(1).map(Number);
  return channels.every((channel) => channel >= 220);
}

function checkDestructive(state, styles) {
  check(
    styles.backgroundColor === "rgb(254, 226, 226)",
    `Issue 537 destructive action lost its semantic ${state} surface`,
    styles,
  );
  check(
    styles.color === "rgb(220, 38, 38)",
    `Issue 537 destructive action lost its semantic ${state} text/icon color`,
    styles,
  );
}

function check(condition, message, context) {
  if (condition) return;
  failures.push({ message, context });
}
