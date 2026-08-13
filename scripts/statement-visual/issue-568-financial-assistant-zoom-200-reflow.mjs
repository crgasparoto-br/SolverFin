import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const referenceWidth = 1366;
const zoomLayoutWidth = Math.round(referenceWidth / 2);

if (!chromePath) throw new Error("CHROME_BIN is required for issue 568 zoom validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let fatalError;
let observation;

try {
  await setViewport(browser.cdp, referenceWidth, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  // Browser zoom reduces the CSS layout viewport. Validate the 200% reflow pressure by
  // halving the 1366px reference viewport without applying PageScaleFactor/pinch zoom.
  await setViewport(browser.cdp, zoomLayoutWidth, 900);
  await navigate(browser.cdp, `${baseUrl}/assistente`);
  await waitForAssistant(browser.cdp);
  await sleep(180);

  observation = await inspectZoomReflow(browser.cdp, referenceWidth);
  const screenshotName = "issue-568-financial-assistant-zoom-200-reflow.png";
  await screenshot(browser.cdp, join(outputDir, screenshotName));
  observation.screenshot = screenshotName;

  check(
    Math.abs(observation.viewport.innerWidth - zoomLayoutWidth) <= 1,
    "Chrome did not apply the requested 200% zoom-equivalent layout viewport.",
    observation,
  );
  check(
    observation.effectiveZoomPercent >= 199 && observation.effectiveZoomPercent <= 201,
    "The layout viewport does not represent approximately 200% browser zoom pressure.",
    observation,
  );
  check(
    observation.visualScale >= 0.99 && observation.visualScale <= 1.01,
    "The 200% reflow gate must not use pinch/page scale as a substitute for browser zoom.",
    observation,
  );
  check(
    observation.documentFitsViewport,
    "The assistant introduces horizontal document overflow at the 200% reflow equivalent.",
    observation,
  );
  check(
    observation.keyContentFitsViewport,
    "Essential assistant content is clipped horizontally at the 200% reflow equivalent.",
    observation,
  );
  check(
    observation.singleColumn,
    "The assistant does not reflow to a single column at the 200% zoom-equivalent width.",
    observation,
  );
  check(
    observation.composerVisible && observation.statusVisible && observation.actionsVisible,
    "Essential assistant controls are not visible at the 200% reflow equivalent.",
    observation,
  );
} catch (error) {
  fatalError = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  failures.push({ message: fatalError.message, details: fatalError });
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  referenceViewportWidth: referenceWidth,
  zoomEquivalentLayoutWidth: zoomLayoutWidth,
  observation,
  fatalError,
  failures,
};
await writeFile(
  join(outputDir, "issue-568-financial-assistant-zoom-200-reflow.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  if (fatalError?.stack) console.error(fatalError.stack);
  process.exitCode = 1;
} else {
  console.log("Issue 568 financial assistant 200% zoom reflow validation passed.");
}

async function waitForAssistant(cdp, timeout = 10_000) {
  await waitFor(
    async () =>
      evaluate(
        cdp,
        `(() => Boolean(
          document.querySelector('[data-financial-assistant]') &&
          document.querySelector('[data-assistant-input]')
        ))()`,
      ),
    timeout,
    "financial assistant layout",
  );
}

async function inspectZoomReflow(cdp, desktopReferenceWidth) {
  return evaluate(
    cdp,
    `(() => {
      const layoutViewportWidth = window.innerWidth;
      // clientWidth is narrower when Chrome reserves space for a vertical scrollbar. Keep
      // that narrower width for clipping checks, but do not mistake it for browser zoom.
      const contentViewportWidth = document.documentElement.clientWidth;
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const fitsHorizontally = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= contentViewportWidth + 1;
      };
      const root = document.querySelector('[data-financial-assistant]');
      const layout = document.querySelector('.assistant-layout');
      const heading = document.querySelector('.assistant-heading');
      const title = document.querySelector('.assistant-heading h1');
      const readonly = document.querySelector('.assistant-readonly');
      const composer = document.querySelector('[data-assistant-form]');
      const status = document.querySelector('[data-assistant-status]');
      const actions = document.querySelector('.assistant-context-actions');
      const keyElements = [root, layout, heading, title, readonly, composer, status, actions];
      return {
        viewport: {
          innerWidth: layoutViewportWidth,
          clientWidth: contentViewportWidth,
          documentWidth: document.documentElement.scrollWidth,
          visualViewportWidth: window.visualViewport?.width ?? layoutViewportWidth,
        },
        effectiveZoomPercent: (${desktopReferenceWidth} / layoutViewportWidth) * 100,
        visualScale: window.visualViewport?.scale ?? 1,
        documentFitsViewport: document.documentElement.scrollWidth <= contentViewportWidth + 1,
        keyContentFitsViewport: keyElements.every(fitsHorizontally),
        singleColumn: layout
          ? getComputedStyle(layout).gridTemplateColumns.trim().split(/\s+/).length === 1
          : false,
        composerVisible: visible(composer),
        statusVisible: visible(status),
        actionsVisible: visible(actions),
      };
    })()`,
  );
}

async function waitFor(condition, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await condition()) return;
    } catch {
      // Navigation and async rendering can replace the execution context briefly.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
