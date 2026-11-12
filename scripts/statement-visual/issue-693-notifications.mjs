import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const eventType = "financial.insight.available.v1";
const report = {
  commit: process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local",
  route: "/notificacoes",
  viewports: [],
  preference: null,
  result: "started",
};

assert.ok(chromePath, "CHROME_BIN is required for notifications visual verification");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let originalPreference;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  for (const [width, height] of [
    [1366, 900],
    [390, 844],
  ]) {
    await setViewport(browser.cdp, width, height);
    await navigate(browser.cdp, `${baseUrl}/notificacoes`);
    const observed = await evaluate(
      browser.cdp,
      `(() => {
        const root = document.querySelector('[data-financial-notifications]');
        return {
          route: location.pathname,
          rootVisible: Boolean(root),
          emptyState: Boolean(root?.querySelector('.notifications-empty')),
          preferenceCount: root?.querySelectorAll('[data-preference-event]').length ?? 0,
          unreadCount: root?.querySelector('.notifications-feed header p')?.textContent?.trim(),
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
          viewportWidth: window.innerWidth,
        };
      })()`,
    );
    assert.equal(observed.route, "/notificacoes");
    assert.equal(observed.rootVisible, true);
    assert.equal(observed.emptyState, true, "A new profile must render an honest empty state");
    assert.equal(observed.preferenceCount, 12, "All event/channel preferences must be visible");
    assert.equal(observed.unreadCount, "0 não lidas");
    assert.equal(observed.noHorizontalOverflow, true, `${width}px horizontal overflow`);
    assert.equal(observed.viewportWidth, width);
    report.viewports.push({ width, height, ...observed });
    await screenshot(browser.cdp, join(outputDir, `issue-693-notifications-${width}.png`));
  }

  const preference = await evaluate(
    browser.cdp,
    `(() => document.querySelector('[data-preference-event="${eventType}"][data-preference-channel="in_app"]')?.checked)()`,
  );
  assert.equal(typeof preference, "boolean");
  originalPreference = preference;
  await togglePreference(!preference);
  await navigate(browser.cdp, `${baseUrl}/notificacoes`);
  assert.equal(await readPreference(), !preference, "Preference did not persist after reload");
  await togglePreference(preference);
  await navigate(browser.cdp, `${baseUrl}/notificacoes`);
  assert.equal(await readPreference(), preference, "Preference was not restored");
  report.preference = { changedAndRestored: true, persistsAcrossReload: true };
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (typeof originalPreference === "boolean") {
    // Keep visual test state independent of subsequent scenarios, even if an assertion fails.
    await evaluate(
      browser.cdp,
      `(async () => {
        const response = await fetch('/api/notifications/preferences', {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({type: '${eventType}', channel: 'in_app', enabled: ${originalPreference}}),
        });
        return response.ok;
      })()`,
    ).catch(() => false);
  }
  await writeFile(join(outputDir, "issue-693-notifications.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close(outputDir);
}

async function readPreference() {
  return evaluate(
    browser.cdp,
    `(() => document.querySelector('[data-preference-event="${eventType}"][data-preference-channel="in_app"]')?.checked)()`,
  );
}

async function togglePreference(expected) {
  const result = await evaluate(
    browser.cdp,
    `(async () => {
      const checkbox = document.querySelector('[data-preference-event="${eventType}"][data-preference-channel="in_app"]');
      checkbox.click();
      for (let i = 0; i < 90; i += 1) {
        const status = document.querySelector('[data-notifications-status]')?.textContent?.trim();
        if (!checkbox.disabled && status === 'Preferência atualizada.') {
          return { checked: checkbox.checked, status };
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { checked: checkbox.checked, status: 'timeout' };
    })()`,
  );
  assert.equal(result.checked, expected);
  assert.equal(result.status, "Preferência atualizada.");
}
