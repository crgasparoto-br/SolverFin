import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const requestedState = process.env.STATEMENT_VISUAL_STATE;
const allowedStates = new Set(["normal", "empty"]);

if (!chromePath) {
  throw new Error("CHROME_BIN is required for cards visual validation.");
}
if (!requestedState || !allowedStates.has(requestedState)) {
  throw new Error(`Unsupported cards coverage state: ${requestedState ?? "<missing>"}.`);
}
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  route: "/cartoes",
  state: requestedState,
  browser: "unknown",
  evidence: [],
  failures: [],
};

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  report.browser = browser.version;
  await loginAndOpenCards(browser.cdp, 1440, 900);
  if (requestedState === "normal") {
    await validateNormal(browser.cdp, 1440, 900, "desktop");
    await validateNormal(browser.cdp, 390, 844, "mobile");
  } else {
    await validateFilteredEmpty(browser.cdp);
  }
} catch (error) {
  report.failures.push({ message: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

const artifactStem = `issue-606-cards-${requestedState}`;
await writeFile(join(outputDir, `${artifactStem}.json`), `${JSON.stringify(report, null, 2)}\n`);
if (report.failures.length > 0) {
  for (const failure of report.failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`/cartoes ${requestedState} focused validation passed.`);
}

async function loginAndOpenCards(cdp, width, height) {
  await setViewport(cdp, width, height);
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitForCards(cdp);
}

async function validateNormal(cdp, width, height, label) {
  await setViewport(cdp, width, height);
  await navigate(cdp, `${baseUrl}/cartoes?month=2026-06`);
  await waitForCards(cdp);
  const measurements = await evaluate(cdp, cardsMeasurementExpression());
  const screenshotName = `issue-606-cards-normal-${label}.png`;
  await screenshot(cdp, join(outputDir, screenshotName));

  assert.equal(measurements.viewportWidth, width, `Cards ${label} viewport identity changed.`);
  assert.equal(measurements.noHorizontalOverflow, true, `Cards ${label} has horizontal overflow.`);
  assert.equal(measurements.overviewVisible, true, `Cards ${label} invoice overview is missing.`);
  assert.ok(measurements.rowCount > 0, `Cards ${label} rendered no purchase rows.`);
  assert.equal(measurements.searchVisible, true, `Cards ${label} purchase search is missing.`);
  if (label === "desktop") {
    assert.equal(measurements.tableHeaderVisible, true, "Cards desktop table header is missing.");
  } else {
    assert.equal(
      measurements.tableHeaderVisible,
      false,
      "Cards desktop header leaked into mobile layout.",
    );
  }
  report.evidence.push({
    label,
    width,
    height,
    screenshot: screenshotName,
    measurements,
  });
}

async function validateFilteredEmpty(cdp) {
  await setViewport(cdp, 1440, 900);
  await navigate(
    cdp,
    `${baseUrl}/cartoes?month=2026-06&q=${encodeURIComponent("consulta-sem-resultado-visual")}`,
  );
  await waitForFilteredEmptyState(cdp);
  const measurements = await evaluate(
    cdp,
    `(() => {
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]'));
      const empty = document.querySelector('[data-purchase-filter-empty]');
      const root = document.documentElement;
      return {
        rowCount: rows.length,
        emptyVisible: Boolean(empty && !empty.hidden),
        status: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
        query: document.querySelector('[data-purchase-search]')?.value || '',
        noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
      };
    })()`,
  );
  const screenshotName = "issue-606-cards-empty.png";
  await screenshot(cdp, join(outputDir, screenshotName));
  assert.equal(measurements.rowCount, 0, "Cards empty search still shows purchase rows.");
  assert.equal(measurements.emptyVisible, true, "Cards filtered empty state is not visible.");
  assert.match(measurements.status, /^0\s/, "Cards filtered result count is not zero.");
  assert.equal(
    measurements.query,
    "consulta-sem-resultado-visual",
    "Cards filtered query was not preserved by the SSR filter.",
  );
  assert.equal(
    measurements.noHorizontalOverflow,
    true,
    "Cards empty state has horizontal overflow.",
  );
  report.evidence.push({
    width: 1440,
    height: 900,
    screenshot: screenshotName,
    measurements,
  });
}

async function waitForFilteredEmptyState(cdp) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const synchronized = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-cards-archetype="A3"]');
        const rows = document.querySelectorAll('[data-purchase-item]');
        const empty = document.querySelector('[data-purchase-filter-empty]');
        const status = document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '';
        const query = document.querySelector('[data-purchase-search]')?.value || '';
        return Boolean(root) &&
          rows.length === 0 &&
          Boolean(empty && !empty.hidden) &&
          /^0\\s/.test(status) &&
          query === 'consulta-sem-resultado-visual';
      })()`,
    );
    if (synchronized) return;
    await sleep(50);
  }
  throw new Error("Cards filtered empty state did not synchronize.");
}

async function waitForCards(cdp) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('[data-cards-archetype="A3"] .cards-invoice-summary') && document.querySelector('[data-purchase-item]'))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Cards interface did not render with demo purchases.");
}

function cardsMeasurementExpression() {
  return `(() => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    return {
      viewportWidth: window.innerWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      overviewVisible: visible(document.querySelector('.cards-invoice-summary')),
      rowCount: document.querySelectorAll('[data-purchase-item]').length,
      searchVisible: visible(document.querySelector('[data-purchase-search]')),
      tableHeaderVisible: visible(document.querySelector('.cards-purchase-table-head')),
    };
  })()`;
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
