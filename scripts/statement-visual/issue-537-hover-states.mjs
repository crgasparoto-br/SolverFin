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
const selectors = {
  primary: "[data-context-action]",
  neutral: "#cards-tab",
  destructive: ".danger-icon-button:not(:disabled)",
};

if (!chromePath) throw new Error("CHROME_BIN is required for issue 537 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });

try {
  await setViewport(browser.cdp, 1440, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await navigate(browser.cdp, `${baseUrl}/contas-cartoes`);
  await sleep(500);
  await evaluate(
    browser.cdp,
    `document.querySelector(${JSON.stringify(selectors.destructive)})?.scrollIntoView({ block: "center" })`,
  );
  await sleep(120);
  await browser.cdp.send("DOM.enable");
  await browser.cdp.send("CSS.enable");

  const { root } = await browser.cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const nodes = {
    primary: await findNode(browser.cdp, root.nodeId, selectors.primary),
    neutral: await findNode(browser.cdp, root.nodeId, selectors.neutral),
    destructive: await findNode(browser.cdp, root.nodeId, selectors.destructive),
  };

  await forceState(browser.cdp, nodes.primary, ["hover"]);
  await forceState(browser.cdp, nodes.neutral, ["hover"]);
  await forceState(browser.cdp, nodes.destructive, ["hover"]);
  await sleep(250);

  const hoverStyles = await readStyles(browser.cdp);
  await screenshot(browser.cdp, join(outputDir, "issue-537-hover-states-desktop-1440x900.png"));
  scenarios.push({
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
  check(
    isLightNeutral(hoverStyles.neutral.backgroundColor),
    "Issue 537 neutral control still receives a dark hover surface",
    hoverStyles.neutral,
  );
  check(
    hoverStyles.neutral.color !== "rgb(255, 255, 255)",
    "Issue 537 neutral control inverts its text to white on hover",
    hoverStyles.neutral,
  );
  checkDestructive("hover", hoverStyles.destructive);

  await forceState(browser.cdp, nodes.primary, []);
  await forceState(browser.cdp, nodes.neutral, []);
  await forceState(browser.cdp, nodes.destructive, ["focus", "focus-visible"]);
  await sleep(250);

  const focusStyles = await readStyles(browser.cdp);
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-537-destructive-focus-desktop-1440x900.png"),
  );
  scenarios.push({
    kind: "focus-visible",
    viewport: "1440x900",
    screenshot: "issue-537-destructive-focus-desktop-1440x900.png",
    styles: focusStyles,
  });

  checkDestructive("focus-visible", focusStyles.destructive);
  check(
    focusStyles.destructive.boxShadow !== "none",
    "Issue 537 destructive icon control has no visible keyboard focus ring",
    focusStyles.destructive,
  );
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

async function readStyles(cdp) {
  return evaluate(
    cdp,
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
        };
      };
      return {
        primary: read(${JSON.stringify(selectors.primary)}),
        neutral: read(${JSON.stringify(selectors.neutral)}),
        destructive: read(${JSON.stringify(selectors.destructive)}),
      };
    })()`,
  );
}

function isLightNeutral(value) {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
  if (!match) return false;
  const channels = match.slice(1).map(Number);
  return channels.every((channel) => channel >= 225);
}

function checkDestructive(state, styles) {
  check(
    styles.backgroundColor === "rgb(254, 226, 226)",
    `Issue 537 destructive icon control lost its red ${state} surface`,
    styles,
  );
  check(
    styles.borderColor === "rgb(254, 202, 202)",
    `Issue 537 destructive icon control lost its red ${state} border`,
    styles,
  );
  check(
    styles.color === "rgb(220, 38, 38)",
    `Issue 537 destructive icon control lost its red ${state} text/icon color`,
    styles,
  );
}

function check(condition, message, context) {
  if (condition) return;
  failures.push({ message, context });
}
