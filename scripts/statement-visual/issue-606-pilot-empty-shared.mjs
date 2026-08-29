import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;

export async function runPilotEmptyState({ route, expectedTexts, artifactStem }) {
  if (!chromePath) {
    throw new Error("CHROME_BIN is required for pilot empty-state validation.");
  }
  await mkdir(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? "local",
    route,
    state: "empty",
    browser: "unknown",
    viewports: [],
    failures: [],
  };

  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    report.browser = browser.version;
    await setViewport(browser.cdp, 1366, 900);
    await navigate(browser.cdp, `${baseUrl}/login`);
    const registration = await registerFreshUser(browser.cdp);
    assert.equal(
      registration.ok,
      true,
      `Fresh profile registration failed with ${registration.status}.`,
    );

    for (const [width, height] of [
      [1366, 900],
      [390, 844],
    ]) {
      await setViewport(browser.cdp, width, height);
      await navigate(browser.cdp, `${baseUrl}${route}`);
      await sleep(350);
      const measurements = await evaluate(
        browser.cdp,
        `(() => {
          const expected = ${JSON.stringify(expectedTexts)};
          const text = document.body.textContent || '';
          const root = document.documentElement;
          const main = document.querySelector('main');
          return {
            missingTexts: expected.filter((value) => !text.includes(value)),
            emptyStateCount: document.querySelectorAll('.empty-state').length,
            mainPresent: Boolean(main),
            noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
            viewportWidth: window.innerWidth,
          };
        })()`,
      );
      const screenshotName = `${artifactStem}-${width}.png`;
      await screenshot(browser.cdp, join(outputDir, screenshotName));
      assert.deepEqual(
        measurements.missingTexts,
        [],
        `${route} did not render its route-specific empty state.`,
      );
      assert.equal(measurements.mainPresent, true, `${route} did not render a main region.`);
      assert.equal(
        measurements.noHorizontalOverflow,
        true,
        `${route} empty state overflowed horizontally.`,
      );
      assert.equal(
        measurements.viewportWidth,
        width,
        `${route} viewport identity changed unexpectedly.`,
      );
      report.viewports.push({
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

  await writeFile(join(outputDir, `${artifactStem}.json`), `${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length > 0) {
    for (const failure of report.failures) console.error(`- ${failure.message}`);
    process.exitCode = 1;
  } else {
    console.log(`${route} route-specific empty-state validation passed.`);
  }
}

async function registerFreshUser(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const run = async () => {
        const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const response = await fetch('/api/users', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName: 'QA Visual Fresh Profile ' + suffix,
            email: 'qa.visual.' + suffix + '@solverfin.example.invalid',
            password: 'SolverFinVisual!2026',
          }),
        });
        await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status };
      };
      return run();
    })()`,
  );
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
