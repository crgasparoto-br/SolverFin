import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { fixtureExpression, loginExpression } from "./fixtures.mjs";
import { pageMeasurementExpression } from "./measurements.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const requestedRoute = process.env.STATEMENT_VISUAL_ROUTE;
const allowedRoutes = new Set([
  "/lancamentos",
  "/dashboard",
  "/cartoes",
  "/contas",
]);

if (!chromePath) {
  throw new Error("CHROME_BIN is required for core-page visual validation.");
}
if (!requestedRoute || !allowedRoutes.has(requestedRoute)) {
  throw new Error(
    `Unsupported core-page coverage route: ${requestedRoute ?? "<missing>"}.`,
  );
}
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  route: requestedRoute,
  state: process.env.STATEMENT_VISUAL_STATE ?? "normal",
  browser: "unknown",
  pages: [],
  failures: [],
};

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  report.browser = browser.version;
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  let route = requestedRoute;
  let widths = [390, 1366];
  if (requestedRoute === "/lancamentos") {
    const fixtureIds = await evaluate(browser.cdp, fixtureExpression());
    route = `/lancamentos?accountId=${encodeURIComponent(fixtureIds.longAccountId)}&month=2026-07`;
    widths = [390, 768, 1366, 1920];
  }

  for (const width of widths) {
    const height = width <= 768 ? 1100 : 1000;
    await setViewport(browser.cdp, width, height);
    await navigate(browser.cdp, `${baseUrl}${route}`);
    await sleep(300);
    const measurements = await evaluate(
      browser.cdp,
      pageMeasurementExpression(),
    );
    const stem = slug(requestedRoute);
    const screenshotName = `issue-606-core-${stem}-${width}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));

    assert.equal(
      measurements.globalOverflow,
      false,
      `${requestedRoute} has global overflow at ${width}px.`,
    );
    assert.ok(
      measurements.mainWidth > 0,
      `${requestedRoute} has no measurable main region.`,
    );
    assert.deepEqual(
      measurements.outsideEssential,
      [],
      `${requestedRoute} has essential content outside the viewport at ${width}px.`,
    );

    if (requestedRoute === "/lancamentos") {
      assert.deepEqual(
        measurements.moneyProblems,
        [],
        `Statement money layout failed at ${width}px.`,
      );
      assert.equal(
        measurements.balanceHierarchy,
        true,
        `Statement balance hierarchy failed at ${width}px.`,
      );
      if (width === 768 || width === 1366) {
        assert.equal(
          measurements.table.hasLocalHorizontalScroll,
          true,
          `Statement table lacks local horizontal scroll at ${width}px.`,
        );
      }
    }

    report.pages.push({
      width,
      height,
      screenshot: screenshotName,
      measurements,
    });
  }
} catch (error) {
  report.failures.push({ message: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

const artifactStem = `issue-606-core-${slug(requestedRoute)}`;
await writeFile(
  join(outputDir, `${artifactStem}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
if (report.failures.length > 0) {
  for (const failure of report.failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`${requestedRoute} focused core-page validation passed.`);
}

function slug(value) {
  return value.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-") || "root";
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
