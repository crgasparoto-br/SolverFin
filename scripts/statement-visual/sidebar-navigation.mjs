import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for sidebar visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
let desktop;
let mobile;

try {
  desktop = await validateDesktopSidebar(browser.cdp);
  mobile = await validateMobileNavigation(browser.cdp);
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  desktop,
  mobile,
  screenshots: ["issue-480-sidebar-1280x480.png", "issue-480-sidebar-mobile-open.png"],
};
await writeFile(join(outputDir, "issue-480-sidebar.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "ISSUE-480.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue #480 sidebar keyboard and responsive validation passed.");
}

async function validateDesktopSidebar(cdp) {
  await setViewport(cdp, 1280, 480);
  await loginAndOpenDashboard(cdp);

  const lastRouteId = await evaluate(
    cdp,
    `document.querySelector('.sidebar > nav a[data-nav-route-id]:last-of-type')?.dataset.navRouteId || ''`,
  );
  assert.ok(lastRouteId, "Expected a last authorized navigation route");

  const traversal = await tabUntil(cdp, (state) => state.routeId === lastRouteId, 40);
  const measurements = await evaluate(cdp, desktopMeasurementExpression(lastRouteId));
  await screenshot(cdp, join(outputDir, "issue-480-sidebar-1280x480.png"));

  const afterNavigation = await pressTabAndDescribe(cdp);

  check(measurements.viewport.width === 1280, "Viewport width is not 1280px", measurements);
  check(measurements.viewport.height === 480, "Viewport height is not 480px", measurements);
  check(
    measurements.sidebar.fillsViewport,
    "Sidebar does not fill the viewport height",
    measurements,
  );
  check(measurements.brand.visible, "Brand is not visible", measurements);
  check(measurements.logout.visible, "Logout is not visible", measurements);
  check(
    measurements.navigation.isScrollable,
    "Navigation does not have vertical overflow",
    measurements,
  );
  check(
    measurements.navigation.scrollTop > 0,
    "Tab traversal did not scroll navigation",
    measurements,
  );
  check(
    measurements.navigation.lastLinkInside,
    "Last authorized link is outside navigation",
    measurements,
  );
  check(
    measurements.navigation.focusedTarget,
    "Tab traversal did not reach the last link",
    measurements,
  );
  check(
    measurements.pageScrollY === 0,
    "Main page scrolled instead of the navigation region",
    measurements,
  );
  check(
    measurements.admin.institutions === 1,
    "Admin institutions link is missing or duplicated",
    measurements,
  );
  check(
    measurements.admin.financialIndexes === 1,
    "Financial indexes link is missing or duplicated",
    measurements,
  );
  check(
    measurements.admin.groupLabels === 1,
    "Admin group label is missing or duplicated",
    measurements,
  );
  check(
    measurements.duplicateRouteIds.length === 0,
    "Navigation route ids are duplicated",
    measurements,
  );
  check(
    measurements.ariaControlsComplete,
    "aria-controls does not cover every secondary route",
    measurements,
  );
  check(
    measurements.activeRoute === "dashboard",
    "Dashboard active state was not preserved",
    measurements,
  );
  check(
    afterNavigation.matchesLogout,
    "Keyboard focus did not leave navigation normally for the logout action",
    { afterNavigation, traversal },
  );

  return {
    viewport: "1280x480",
    targetRouteId: lastRouteId,
    traversal,
    afterNavigation,
    measurements,
    screenshot: "issue-480-sidebar-1280x480.png",
  };
}

async function validateMobileNavigation(cdp) {
  await setViewport(cdp, 390, 844);
  await navigate(cdp, `${baseUrl}/dashboard`);
  await waitForMasterNavigation(cdp);
  await resetPageFocus(cdp);

  const traversal = await tabUntil(cdp, (state) => state.isMoreToggle, 20);
  const before = await readMobileState(cdp);
  check(before.toggleFocused, "Tab traversal did not reach the More/Less button", {
    before,
    traversal,
  });
  check(before.ariaExpanded === "false", "More/Less did not start collapsed", before);
  check(before.toggleText === "Mais", "Collapsed toggle label is not Mais", before);

  await pressKey(cdp, "Enter", "Enter", 13);
  const opened = await readMobileState(cdp);
  await screenshot(cdp, join(outputDir, "issue-480-sidebar-mobile-open.png"));

  check(opened.ariaExpanded === "true", "Enter did not expand secondary routes", opened);
  check(opened.toggleText === "Menos", "Expanded toggle label is not Menos", opened);
  check(
    opened.adminInstitutionsVisible,
    "Admin institutions is not visible after expansion",
    opened,
  );
  check(
    opened.adminFinancialIndexesVisible,
    "Financial indexes is not visible after expansion",
    opened,
  );
  check(
    opened.duplicateRouteIds.length === 0,
    "Opening More/Less duplicated navigation routes",
    opened,
  );
  check(opened.ariaControlsComplete, "Mobile aria-controls is incomplete after expansion", opened);
  check(
    opened.internalVerticalScroll === false,
    "Mobile navigation gained internal vertical scroll",
    opened,
  );

  await pressKey(cdp, "Enter", "Enter", 13);
  const closed = await readMobileState(cdp);

  check(closed.ariaExpanded === "false", "Second Enter did not collapse secondary routes", closed);
  check(closed.toggleText === "Mais", "Collapsed toggle label was not restored", closed);
  check(
    closed.adminInstitutionsVisible === false,
    "Admin institutions remained visible after collapse",
    closed,
  );
  check(
    closed.adminFinancialIndexesVisible === false,
    "Financial indexes remained visible after collapse",
    closed,
  );
  check(
    closed.duplicateRouteIds.length === 0,
    "Closing More/Less duplicated navigation routes",
    closed,
  );

  return {
    viewport: "390x844",
    traversal,
    before,
    opened,
    closed,
    screenshot: "issue-480-sidebar-mobile-open.png",
  };
}

async function loginAndOpenDashboard(cdp) {
  await navigate(cdp, `${baseUrl}/login`);
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  await navigate(cdp, `${baseUrl}/dashboard`);
  await waitForMasterNavigation(cdp);
  await resetPageFocus(cdp);
}

async function waitForMasterNavigation(cdp) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(
        document.querySelector('[data-nav-route-id="adminInstitutions"]') &&
        document.querySelector('[data-nav-route-id="adminFinancialIndexes"]')
      )`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Master navigation was not rendered after /api/me.");
}

async function resetPageFocus(cdp) {
  await evaluate(
    cdp,
    `(() => { document.activeElement?.blur(); return document.activeElement?.tagName; })()`,
  );
  await sleep(50);
}

async function tabUntil(cdp, predicate, maxSteps) {
  const visited = [];
  for (let step = 1; step <= maxSteps; step += 1) {
    const state = await pressTabAndDescribe(cdp);
    visited.push(state);
    if (predicate(state)) return { steps: step, visited };
  }
  throw new Error(`Keyboard traversal did not reach the target after ${maxSteps} Tab presses.`);
}

async function pressTabAndDescribe(cdp) {
  await pressKey(cdp, "Tab", "Tab", 9);
  return evaluate(cdp, activeElementExpression());
}

async function pressKey(cdp, key, code, keyCode) {
  const params = {
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  };
  const keyDown =
    key === "Enter"
      ? { type: "keyDown", text: "\r", unmodifiedText: "\r", ...params }
      : { type: "rawKeyDown", ...params };
  await cdp.send("Input.dispatchKeyEvent", keyDown);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  await sleep(80);
}

function activeElementExpression() {
  return `(() => {
    const active = document.activeElement;
    return {
      tagName: active?.tagName || '',
      routeId: active?.dataset?.navRouteId || '',
      isMoreToggle: Boolean(active?.matches?.('[data-nav-more]')),
      matchesLogout: Boolean(active?.matches?.('[data-logout], .logout')),
      text: active?.textContent?.trim() || ''
    };
  })()`;
}

function desktopMeasurementExpression(targetRouteId) {
  return `(() => {
    const sidebar = document.querySelector('.sidebar');
    const brand = sidebar?.querySelector('.brand');
    const nav = sidebar?.querySelector('nav[aria-label="Menu principal"]');
    const logout = sidebar?.querySelector('.logout');
    if (!sidebar || !brand || !nav || !logout) throw new Error('Sidebar structure is incomplete');

    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height };
    };
    const visible = (value) => value.top >= -1 && value.bottom <= window.innerHeight + 1;
    const links = Array.from(nav.querySelectorAll('a[data-nav-route-id]'));
    const routeIds = links.map((link) => link.dataset.navRouteId);
    const duplicateRouteIds = routeIds.filter((routeId, index) => routeIds.indexOf(routeId) !== index);
    const secondaryIds = links.filter((link) => link.dataset.navPriority === 'secondary' && link.id).map((link) => link.id);
    const controlledIds = (nav.querySelector('[data-nav-more]')?.getAttribute('aria-controls') || '').split(/\\s+/).filter(Boolean);
    const lastLink = links.at(-1);
    const navRect = rect(nav);
    const lastRect = rect(lastLink);
    const sidebarRect = rect(sidebar);
    const brandRect = rect(brand);
    const logoutRect = rect(logout);
    const navStyle = getComputedStyle(nav);

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pageScrollY: window.scrollY,
      sidebar: { rect: sidebarRect, fillsViewport: Math.abs(sidebarRect.top) <= 1 && Math.abs(sidebarRect.bottom - window.innerHeight) <= 1 },
      brand: { rect: brandRect, visible: visible(brandRect) },
      logout: { rect: logoutRect, visible: visible(logoutRect) },
      navigation: {
        rect: navRect,
        overflowY: navStyle.overflowY,
        clientHeight: nav.clientHeight,
        scrollHeight: nav.scrollHeight,
        scrollTop: nav.scrollTop,
        isScrollable: ['auto', 'scroll'].includes(navStyle.overflowY) && nav.scrollHeight > nav.clientHeight + 1,
        focusedRouteId: document.activeElement?.dataset?.navRouteId || '',
        focusedTarget: document.activeElement?.dataset?.navRouteId === ${JSON.stringify(targetRouteId)},
        lastLinkInside: lastRect.top >= navRect.top - 1 && lastRect.bottom <= navRect.bottom + 1
      },
      admin: {
        institutions: routeIds.filter((routeId) => routeId === 'adminInstitutions').length,
        financialIndexes: routeIds.filter((routeId) => routeId === 'adminFinancialIndexes').length,
        groupLabels: nav.querySelectorAll('[data-nav-group-label="admin"]').length
      },
      duplicateRouteIds,
      secondaryIds,
      controlledIds,
      ariaControlsComplete: secondaryIds.length === controlledIds.length && secondaryIds.every((id) => controlledIds.includes(id)),
      activeRoute: nav.querySelector('a[aria-current="page"]')?.dataset?.navRouteId || ''
    };
  })()`;
}

async function readMobileState(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const nav = document.querySelector('.sidebar > nav');
      const toggle = nav?.querySelector('[data-nav-more]');
      const links = Array.from(nav?.querySelectorAll('a[data-nav-route-id]') || []);
      const routeIds = links.map((link) => link.dataset.navRouteId);
      const secondaryIds = links.filter((link) => link.dataset.navPriority === 'secondary' && link.id).map((link) => link.id);
      const controlledIds = (toggle?.getAttribute('aria-controls') || '').split(/\\s+/).filter(Boolean);
      const institutions = nav?.querySelector('[data-nav-route-id="adminInstitutions"]');
      const indexes = nav?.querySelector('[data-nav-route-id="adminFinancialIndexes"]');
      const isVisible = (element) => Boolean(element && getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0);
      const navStyle = nav ? getComputedStyle(nav) : null;

      return {
        toggleFocused: document.activeElement === toggle,
        ariaExpanded: toggle?.getAttribute('aria-expanded') || '',
        toggleText: toggle?.textContent?.trim() || '',
        adminInstitutionsVisible: isVisible(institutions),
        adminFinancialIndexesVisible: isVisible(indexes),
        duplicateRouteIds: routeIds.filter((routeId, index) => routeIds.indexOf(routeId) !== index),
        ariaControlsComplete: secondaryIds.length === controlledIds.length && secondaryIds.every((id) => controlledIds.includes(id)),
        overflowY: navStyle?.overflowY || '',
        internalVerticalScroll: Boolean(nav && ['auto', 'scroll'].includes(navStyle?.overflowY || '') && nav.scrollHeight > nav.clientHeight + 1)
      };
    })()`,
  );
}

function check(condition, message, context) {
  if (!condition) failures.push({ message, context });
}

function renderReport(report) {
  const result =
    report.failures.length === 0
      ? "No failures detected."
      : report.failures.map((failure) => `- ${failure.message}`).join("\n");
  return `# Issue #480 sidebar visual evidence

- Commit: \`${report.commit}\`
- Browser: ${report.browser}
- Desktop viewport: ${report.desktop?.viewport}
- Mobile viewport: ${report.mobile?.viewport}
- Generated at: ${report.generatedAt}
- Screenshots: ${report.screenshots.join(", ")}

## Validated behavior

- master routes rendered after \`/api/me\`;
- real Tab key events reach the last authorized desktop link and scroll it into view;
- focus leaves the navigation normally for the logout action, without a focus trap;
- navigation is the only vertically scrollable desktop sidebar region;
- brand and logout remain visible while the page itself does not scroll;
- route ids, Admin label and links are not duplicated;
- \`aria-controls\` covers every secondary link;
- Dashboard keeps \`aria-current="page"\`;
- real Tab and Enter key events reach and operate Mais/Menos on mobile;
- \`aria-expanded\`, labels and secondary-route visibility remain coherent when opening and closing;
- mobile navigation does not gain internal vertical scrolling.

## Result

${result}
`;
}
