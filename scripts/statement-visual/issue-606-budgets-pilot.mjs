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
    const screenshotName = `issue-606-budgets-${viewport.name}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));
    report.scenarios.push({
      route: "/orcamentos",
      state: "normal",
      viewport: `${viewport.width}x${viewport.height}`,
      screenshot: screenshotName,
      measurements,
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
    return {
      pathname: location.pathname,
      viewportWidth,
      documentFits: document.documentElement.scrollWidth <= viewportWidth + 1,
      hasMain: Boolean(document.querySelector('main')),
      hasHeading: Array.from(document.querySelectorAll('h1, main h2')).some(visible),
      essentialOutsideViewport,
    };
  })()`;
}
