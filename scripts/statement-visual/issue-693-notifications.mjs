import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import {
  runPopulatedNotificationLayouts,
  verifyPopulatedNotificationActions,
} from "./notification-populated-chrome.mjs";
import { createPopulatedNotificationFixtures } from "./notification-populated-fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const eventType = "financial.insight.available.v1";
const report = {
  commit: process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local",
  route: "/notificacoes",
  viewports: [],
  populatedViewports: [],
  populatedZoom: null,
  populatedActions: null,
  preference: null,
  preferenceRollback: null,
  unsafeNavigation: null,
  failedReadMutation: null,
  result: "started",
};

assert.ok(chromePath, "CHROME_BIN is required for notifications visual verification");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let originalPreference;
let visualFixtures;

try {
  await setViewport(browser.cdp, 1366, 900);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status}`);

  for (const [width, height] of [
    [1366, 900],
    [390, 844],
    [320, 740],
  ]) {
    await setViewport(browser.cdp, width, height);
    await navigate(browser.cdp, `${baseUrl}/notificacoes`);
    const received = await evaluate(
      browser.cdp,
      `(() => {
        const root = document.querySelector('[data-financial-notifications]');
        return {
          route: location.pathname,
          rootVisible: Boolean(root),
          receivedTabActive: root?.querySelector('.sf-tabs a[aria-current="page"]')?.textContent?.trim() === 'Recebidas',
          emptyState: Boolean(root?.querySelector('.notifications-empty')),
          preferencesNotMounted: !root?.querySelector('.notifications-preferences'),
          unreadCount: root?.querySelector('.notifications-feed header p')?.textContent?.trim(),
          receivedHasNoHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
          viewportWidth: window.innerWidth,
        };
      })()`,
    );
    assert.equal(received.route, "/notificacoes");
    assert.equal(received.rootVisible, true);
    assert.equal(
      received.receivedTabActive,
      true,
      "Received notifications should be the active SSR tab",
    );
    assert.equal(received.emptyState, true, "A new profile must render an honest empty state");
    assert.equal(
      received.preferencesNotMounted,
      true,
      "Inactive preferences must not compete with the inbox",
    );
    assert.equal(received.unreadCount, "0 não lidas");
    assert.equal(received.receivedHasNoHorizontalOverflow, true, `${width}px inbox overflow`);
    await screenshot(browser.cdp, join(outputDir, `issue-693-notifications-${width}.png`));

    await navigate(browser.cdp, `${baseUrl}/notificacoes?tab=preferencias`);
    const configured = await evaluate(
      browser.cdp,
      `(() => {
        const root = document.querySelector('[data-financial-notifications]');
        const groups = [...(root?.querySelectorAll('.notifications-preference-group') ?? [])];
        const channels = [...(root?.querySelectorAll('.notifications-preference-channel') ?? [])];
        return {
          preferencesTabActive: root?.querySelector('.sf-tabs a[aria-current="page"]')?.textContent?.trim() === 'Preferências',
          receivedNotMounted: !root?.querySelector('.notifications-feed'),
          preferenceGroupCount: groups.length,
          groupsHaveThreeChannels: groups.every((group) => group.querySelectorAll('[data-preference-event]').length === 3),
          readableChannelWidths: channels.length === 12 && channels.every((channel) => channel.getBoundingClientRect().width >= 120),
          labelsUseGridLayout: channels.length === 12 && channels.every((channel) => getComputedStyle(channel.closest('label')).display === 'grid'),
          preferenceCount: root?.querySelectorAll('[data-preference-event]').length ?? 0,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      })()`,
    );
    assert.equal(configured.preferencesTabActive, true, "Preferences should be the active SSR tab");
    assert.equal(
      configured.receivedNotMounted,
      true,
      "Inactive inbox must not compete with preferences",
    );
    assert.equal(configured.preferenceCount, 12, "All event/channel preferences must be visible");
    assert.equal(configured.preferenceGroupCount, 4, "Event preferences must be grouped");
    assert.equal(configured.groupsHaveThreeChannels, true, "Each event needs its three channels");
    assert.equal(configured.readableChannelWidths, true, "Preference labels are too narrow");
    assert.equal(configured.labelsUseGridLayout, true, "Preference controls are not aligned");
    assert.equal(configured.noHorizontalOverflow, true, `${width}px preferences overflow`);
    assert.equal(received.viewportWidth, width);
    report.viewports.push({ width, height, ...received, ...configured });
    await screenshot(
      browser.cdp,
      join(outputDir, `issue-693-notifications-preferences-${width}.png`),
    );
  }

  visualFixtures = await createPopulatedNotificationFixtures();
  const populated = await runPopulatedNotificationLayouts({
    cdp: browser.cdp,
    baseUrl,
    outputDir,
    fixtures: visualFixtures,
  });
  report.populatedViewports = populated.viewports;
  report.populatedZoom = populated.zoom;

  // Populated list leaves the browser on Recebidas; restore Preferências before reading its controls.
  await navigate(browser.cdp, `${baseUrl}/notificacoes?tab=preferencias`);
  const preference = await evaluate(
    browser.cdp,
    `(() => document.querySelector('[data-preference-event="${eventType}"][data-preference-channel="in_app"]')?.checked)()`,
  );
  assert.equal(typeof preference, "boolean");
  originalPreference = preference;
  await togglePreference(!preference);
  await navigate(browser.cdp, `${baseUrl}/notificacoes?tab=preferencias`);
  assert.equal(await readPreference(), !preference, "Preference did not persist after reload");
  await togglePreference(preference);
  await navigate(browser.cdp, `${baseUrl}/notificacoes?tab=preferencias`);
  assert.equal(await readPreference(), preference, "Preference was not restored");
  report.preference = { changedAndRestored: true, persistsAcrossReload: true };

  report.preferenceRollback = await verifyPreferenceRollback();
  assert.equal(
    report.preferenceRollback.passed,
    true,
    "Preference failure must rollback without persisting",
  );
  assert.equal(await readPreference(), originalPreference);

  report.unsafeNavigation = await verifyBlockedNotificationMutation("navigation");
  assert.equal(
    report.unsafeNavigation.passed,
    true,
    "Untrusted notification destination must be rejected",
  );
  report.failedReadMutation = await verifyBlockedNotificationMutation("read");
  assert.equal(
    report.failedReadMutation.passed,
    true,
    "Failed read mutation must recover without reload",
  );

  report.populatedActions = await verifyPopulatedNotificationActions({
    cdp: browser.cdp,
    baseUrl,
    fixtures: visualFixtures,
  });
  assert.equal(report.populatedActions.passed, true);

  // Exercise the real click handler with a safe mocked navigation response.
  // The origin is revalidated by the API in production; this isolates the
  // browser's profileId propagation without publishing fabricated events.
  const profileId = "33333333-3333-4333-8333-333333333331";
  await navigate(browser.cdp, `${baseUrl}/notificacoes?profileId=${profileId}`);
  const triggered = await evaluate(
    browser.cdp,
    `(() => {
      const root = document.querySelector('[data-financial-notifications]');
      if (!root) return false;
      const originalFetch = window.fetch.bind(window);
      window.fetch = (path, init) => {
        if (String(path).includes('/api/notifications/00000000-0000-4000-8000-000000000693/navigation')) {
          return Promise.resolve(new Response(JSON.stringify({
            available: true, href: '/inbox#financial-insights'
          }), { status: 200, headers: { 'content-type': 'application/json' } }));
        }
        return originalFetch(path, init);
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-notification-target', '00000000-0000-4000-8000-000000000693');
      root.append(button);
      button.click();
      return true;
    })()`,
  );
  assert.equal(triggered, true);
  let navigation;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(150);
    navigation = await evaluate(
      browser.cdp,
      `(() => ({
        pathname: location.pathname,
        profileId: new URLSearchParams(location.search).get('profileId'),
        hash: location.hash
      }))()`,
    );
    if (navigation.pathname === "/inbox") break;
  }
  assert.equal(navigation?.pathname, "/inbox");
  assert.equal(navigation.profileId, profileId, "Navigation changed the selected profile");
  assert.equal(navigation.hash, "#financial-insights");
  report.navigation = { preservesProfileId: true, preservesAnchor: true };
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
  let cleanupError;
  if (visualFixtures) {
    try {
      await visualFixtures.cleanup();
      report.fixtureCleanup = { passed: true };
    } catch (error) {
      cleanupError = error;
      report.fixtureCleanup = { passed: false, reason: String(error) };
      report.result = "failed";
    }
  }
  await writeFile(
    join(outputDir, "issue-693-notifications.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close(outputDir);
  if (cleanupError) throw cleanupError;
}

async function verifyPreferenceRollback() {
  await navigate(browser.cdp, `${baseUrl}/notificacoes?tab=preferencias`);
  const result = await evaluate(
    browser.cdp,
    `(async () => {
      const checkbox = document.querySelector('[data-preference-event="${eventType}"][data-preference-channel="in_app"]');
      if (!checkbox) return { passed: false, reason: 'missing preference' };
      const before = checkbox.checked;
      const originalFetch = window.fetch;
      let intercepted = 0;
      window.fetch = (path, init = {}) => {
        if (String(path).startsWith('/api/notifications/preferences') && init.method === 'PUT') {
          intercepted += 1;
          return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Simulated failure' } }), {
            status: 503, headers: { 'content-type': 'application/json' }
          }));
        }
        return originalFetch(path, init);
      };
      try {
        checkbox.click();
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const status = document.querySelector('[data-notifications-status]')?.textContent?.trim();
          if (!checkbox.disabled && status === 'Não foi possível salvar a alteração.') {
            return { passed: checkbox.checked === before && intercepted === 1,
              restored: checkbox.checked === before, intercepted, status };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return { passed: false, reason: 'mutation did not settle', intercepted };
      } finally {
        window.fetch = originalFetch;
      }
    })()`,
  );
  await navigate(browser.cdp, `${baseUrl}/notificacoes?tab=preferencias`);
  return {
    ...result,
    persistedUnchanged: (await readPreference()) === originalPreference,
    passed: result.passed && (await readPreference()) === originalPreference,
  };
}

async function verifyBlockedNotificationMutation(kind) {
  const profileId = "33333333-3333-4333-8333-333333333331";
  await navigate(browser.cdp, `${baseUrl}/notificacoes?profileId=${profileId}`);
  const result = await evaluate(
    browser.cdp,
    `(async () => {
      const kind = ${JSON.stringify(kind)};
      const id = '00000000-0000-4000-8000-000000000693';
      const root = document.querySelector('[data-financial-notifications]');
      if (!root) return { passed: false, reason: 'missing inbox' };
      const originalFetch = window.fetch;
      let intercepted = 0;
      const button = document.createElement('button');
      button.type = 'button';
      if (kind === 'read') {
        button.setAttribute('data-notification-read', 'true');
        button.setAttribute('data-id', id);
      } else {
        button.setAttribute('data-notification-target', id);
      }
      root.append(button);
      window.fetch = (path, init = {}) => {
        const requestPath = String(path);
        if (requestPath.startsWith('/api/notifications/' + id + (kind === 'read' ? '/read' : '/navigation'))) {
          intercepted += 1;
          return Promise.resolve(kind === 'read'
            ? new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })
            : new Response(JSON.stringify({ available: true, href: 'https://untrusted.example/redirect' }),
                { status: 200, headers: { 'content-type': 'application/json' } }));
        }
        return originalFetch(path, init);
      };
      try {
        button.click();
        const expected = kind === 'read' ? 'Não foi possível salvar a alteração.' : 'Origem indisponível.';
        for (let attempt = 0; attempt < 90; attempt += 1) {
          const status = document.querySelector('[data-notifications-status]')?.textContent?.trim();
          if (status === expected && !button.disabled) {
            return { passed: intercepted === 1 && location.pathname === '/notificacoes' &&
                location.search.includes('profileId=') && !button.disabled,
              kind, intercepted, status, route: location.pathname };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return { passed: false, kind, intercepted, reason: 'mutation did not settle' };
      } finally {
        window.fetch = originalFetch;
        button.remove();
      }
    })()`,
  );
  return result;
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
