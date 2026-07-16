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
let measurements;

try {
  await setViewport(browser.cdp, 1280, 480);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  await navigate(browser.cdp, `${baseUrl}/dashboard`);
  await waitForMasterNavigation(browser.cdp);
  await focusEveryNavigationLink(browser.cdp);
  measurements = await evaluate(browser.cdp, measurementExpression());
  await screenshot(browser.cdp, join(outputDir, "issue-480-sidebar-1280x480.png"));

  validate(measurements);
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  viewport: "1280x480",
  failures,
  measurements,
  screenshot: "issue-480-sidebar-1280x480.png",
};
await writeFile(join(outputDir, "issue-480-sidebar.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "ISSUE-480.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue #480 sidebar validation passed at 1280x480.");
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

async function focusEveryNavigationLink(cdp) {
  await evaluate(
    cdp,
    `(async () => {
      const links = Array.from(document.querySelectorAll('.sidebar > nav a[data-nav-route-id]'));
      if (links.length === 0) throw new Error('No sidebar links found');
      for (const link of links) {
        link.focus();
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    })()`,
  );
  await sleep(120);
}

function measurementExpression() {
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
        focusedLastLink: document.activeElement === lastLink,
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

function validate(value) {
  check(value.viewport.width === 1280, "Viewport width is not 1280px", value);
  check(value.viewport.height === 480, "Viewport height is not 480px", value);
  check(value.sidebar.fillsViewport, "Sidebar does not fill the viewport height", value);
  check(value.brand.visible, "Brand is not visible", value);
  check(value.logout.visible, "Logout is not visible", value);
  check(value.navigation.isScrollable, "Navigation does not have vertical overflow", value);
  check(value.navigation.scrollTop > 0, "Keyboard focus did not scroll navigation", value);
  check(value.navigation.lastLinkInside, "Last authorized link is outside navigation", value);
  check(value.navigation.focusedLastLink, "Focus traversal did not reach the last link", value);
  check(value.pageScrollY === 0, "Main page scrolled instead of the navigation region", value);
  check(value.admin.institutions === 1, "Admin institutions link is missing or duplicated", value);
  check(
    value.admin.financialIndexes === 1,
    "Financial indexes link is missing or duplicated",
    value,
  );
  check(value.admin.groupLabels === 1, "Admin group label is missing or duplicated", value);
  check(value.duplicateRouteIds.length === 0, "Navigation route ids are duplicated", value);
  check(value.ariaControlsComplete, "aria-controls does not cover every secondary route", value);
  check(value.activeRoute === "dashboard", "Dashboard active state was not preserved", value);
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
- Viewport: ${report.viewport}
- Generated at: ${report.generatedAt}
- Screenshot: ${report.screenshot}

## Validated behavior

- master routes rendered after \`/api/me\`;
- navigation is the only vertically scrollable sidebar region;
- brand and logout remain visible;
- sequential focus reaches the last authorized link and scrolls it into view;
- page scroll remains unchanged;
- route ids, Admin label and links are not duplicated;
- \`aria-controls\` covers every secondary link;
- Dashboard keeps \`aria-current="page"\`.

## Result

${result}
`;
}
