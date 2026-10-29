import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
if (!chromePath) throw new Error("CHROME_BIN is required for issue 606 budgets pilot validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  scenarios: [],
};

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  for (const viewport of [
    { width: 1366, height: 768, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
    { width: 320, height: 740, name: "compact-mobile" },
  ]) {
    await setViewport(browser.cdp, viewport.width, viewport.height);
    await navigate(browser.cdp, `${baseUrl}/orcamentos`);
    await sleep(350);
    const measurements = await evaluate(browser.cdp, measurementExpression());
    assert.equal(measurements.pathname, "/orcamentos");
    assert.equal(measurements.hasMain, true, `Budgets has no main landmark at ${viewport.name}`);
    assert.equal(
      measurements.hasHeading,
      true,
      `Budgets has no visible heading at ${viewport.name}`,
    );
    assert.equal(
      measurements.documentFits,
      true,
      `Budgets overflows horizontally at ${viewport.name}`,
    );
    assert.equal(
      measurements.essentialOutsideViewport.length,
      0,
      `Budgets has essential controls outside viewport at ${viewport.name}`,
    );
    assert.equal(
      measurements.hierarchyValid,
      true,
      `Budget financial hierarchy differs at ${viewport.name}`,
    );
    assert.equal(
      measurements.decisionLabelsVisible,
      true,
      `Budget decision labels missing at ${viewport.name}`,
    );
    assert.equal(
      measurements.financialLabelsLegible,
      true,
      `Budget financial text is clipped at ${viewport.name}`,
    );
    const screenshotName = `issue-606-budgets-${viewport.name}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));
    if (viewport.name === "desktop") {
      const controls = await evaluate(browser.cdp, negativeControlExpression());
      assert.deepEqual(controls, {
        hierarchyRejected: true,
        hierarchyRestored: true,
        clippedValueRejected: true,
        clippedValueRestored: true,
      });
      report.negativeControls = controls;
    }
    report.scenarios.push({
      route: "/orcamentos",
      state: "normal",
      viewport: `${viewport.width}x${viewport.height}`,
      screenshot: screenshotName,
      measurements: {
        ...measurements,
        contentViewportWidth: measurements.viewportWidth,
        viewportWidth: viewport.width,
      },
    });
  }

  await writeFile(
    join(outputDir, "issue-606-budgets-pilot.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log("Issue 606 budgets desktop and mobile baseline validation passed.");
} finally {
  await browser.close(outputDir);
}

function measurementExpression() {
  return `(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const essential = Array.from(document.querySelectorAll('main a, main button, main input, main select')).filter(visible);
    const essentialOutsideViewport = essential
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right < -1 || rect.left > viewportWidth + 1;
      })
      .map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);
    const focus = document.querySelector('.budget-focus');
    const details = document.querySelector('.budget-results');
    const auxiliary = document.querySelector('.budget-inventory');
    const hierarchyValid = Boolean(details && auxiliary && (details.compareDocumentPosition(auxiliary) & Node.DOCUMENT_POSITION_FOLLOWING) && (!focus || (focus.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING)));
    const decisionLabelsVisible = !focus || ['Planejado', 'Realizado', 'Disponível'].every((label) => Array.from(focus.querySelectorAll('dt')).some((term) => term.textContent?.trim() === label));
    const financialNodes = Array.from(document.querySelectorAll('main .sf-money, main .budget-currency'));
    const financialLabelsLegible = financialNodes.every((node) => {
      const style = getComputedStyle(node);
      return !(['hidden', 'clip'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1);
    });
    return {
      hierarchyValid,
      decisionLabelsVisible,
      financialLabelsLegible,
      pathname: location.pathname,
      viewportWidth,
      documentFits: document.documentElement.scrollWidth <= viewportWidth + 1,
      hasMain: Boolean(document.querySelector('main')),
      hasHeading: Array.from(document.querySelectorAll('h1, main h2')).some(visible),
      essentialOutsideViewport,
    };
  })()`;
}

function negativeControlExpression() {
  return `(() => {
    const probe = () => ${measurementExpression()};
    const inventory = document.querySelector('.budget-inventory');
    const details = document.querySelector('.budget-results');
    if (!inventory || !details) return { error: 'Missing budget sections' };
    const marker = document.createComment('restore-inventory-position');
    inventory.before(marker);
    details.before(inventory);
    const hierarchyRejected = probe().hierarchyValid === false;
    marker.replaceWith(inventory);
    const hierarchyRestored = probe().hierarchyValid === true;

    const money = document.querySelector('.budget-focus .sf-money') ||
      document.querySelector('.budget-results .sf-money');
    if (!money) return { error: 'No rendered financial value to test' };
    const originalStyle = money.getAttribute('style');
    money.style.setProperty('width', '1px', 'important');
    money.style.setProperty('overflow-x', 'hidden', 'important');
    money.style.setProperty('white-space', 'nowrap', 'important');
    money.style.setProperty('display', 'block', 'important');
    const clippedValueRejected = probe().financialLabelsLegible === false;
    if (originalStyle === null) money.removeAttribute('style');
    else money.setAttribute('style', originalStyle);
    const clippedValueRestored = probe().financialLabelsLegible === true;
    return { hierarchyRejected, hierarchyRestored, clippedValueRejected, clippedValueRestored };
  })()`;
}
