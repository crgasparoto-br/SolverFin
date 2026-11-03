import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const route = process.env.STATEMENT_VISUAL_ROUTE ?? "";
const compatPort = Number(process.env.SOLVERFIN_SSR_COMPAT_PORT ?? 5191);
const compatUrl = "http://127.0.0.1:" + compatPort;
const config = {
  "/admin/instituicoes": [
    "admin-instituicoes",
    "adminInstitutions",
    "admin-maintenance",
    "master",
    "operational",
    ".admin-institution-list",
  ],
  "/admin/indices-financeiros": [
    "admin-indices-financeiros",
    "adminFinancialIndexes",
    "admin-operations",
    "master",
    "operational",
    ".operation-grid",
  ],
  "/remuneracao-contas": [
    "remuneracao-contas",
    "accountRemuneration",
    "legacy-compatibility",
    "financial-profile",
    "legacy-renderer",
    ".configuration-list",
    true,
  ],
}[route];

if (!chromePath) {
  throw new Error("CHROME_BIN is required for issue #615 visual validation.");
}
if (!config) throw new Error("Unsupported issue #615 route: " + route);
if (!Number.isInteger(compatPort) || compatPort <= 0) {
  throw new Error("Invalid compatibility port.");
}

const [slug, foundationId, archetype, audience, operationalMode, readySelector, compatibility] =
  config;
const failures = [];
let browser;
let compat;
let desktop;
let mobile;
let compactMobile;
let adminScenarios;
let browserVersion = "unknown";

await mkdir(outputDir, { recursive: true });
try {
  if (compatibility) compat = await startCompat();
  browser = await launchChrome({ baseUrl, chromePath });
  browserVersion = browser.version;
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, baseUrl + "/login");
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, "Demo login failed: " + login.status);
  desktop = await verify(browser.cdp, 1366, 768, "desktop");
  mobile = await verify(browser.cdp, 390, 844, "mobile");
  if (route === "/admin/instituicoes") {
    compactMobile = await verify(browser.cdp, 320, 740, "compact-mobile");
    adminScenarios = await verifyAdminScenarios(browser.cdp);
  }
} catch (error) {
  failures.push({
    message: "Issue #615 route validation crashed",
    error: serialize(error),
  });
} finally {
  if (browser) await browser.close(outputDir);
  if (compat) await stopCompat(compat);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  route,
  expectedFoundation: foundationId,
  expectedArchetype: archetype,
  expectedAudience: audience,
  expectedOperationalMode: operationalMode,
  failures,
  desktop,
  mobile,
  compactMobile,
  adminScenarios,
};
await writeFile(
  join(outputDir, "issue-615-secondary-" + slug + ".json"),
  JSON.stringify(report, null, 2) + "\n",
);

if (failures.length) {
  for (const failure of failures) {
    console.error("- " + failure.message + ": " + (failure.error?.message ?? ""));
  }
  process.exitCode = 1;
} else {
  console.log("Issue #615 secondary-route visual validation passed for " + route + ".");
}

async function verify(cdp, width, height, label) {
  await setViewport(cdp, width, height);
  await navigate(cdp, (compatibility ? compatUrl : baseUrl) + route);
  await waitReady(cdp);
  const measurements = await evaluate(cdp, measurementExpression());
  const keyboard = await tabIntoPage(cdp);
  const image = "issue-615-" + slug + "-" + label + "-" + width + "x" + height + ".png";
  await screenshot(cdp, join(outputDir, image));

  check(measurements.pathname === route, label + ": unexpected redirect", measurements);
  check(measurements.pageContainer, label + ": PageContainer missing", measurements);
  check(measurements.pageHeader, label + ": PageHeader missing", measurements);
  check(measurements.headingVisible, label + ": heading not visible", measurements);
  check(measurements.noHorizontalOverflow, label + ": horizontal overflow", measurements);
  check(measurements.unnamedInteractiveCount === 0, label + ": unnamed controls", measurements);
  check(measurements.foundation.id === foundationId, label + ": foundation mismatch", measurements);
  check(
    measurements.foundation.archetype === archetype,
    label + ": archetype mismatch",
    measurements,
  );
  check(measurements.foundation.audience === audience, label + ": audience mismatch", measurements);
  check(
    measurements.foundation.operationalMode === operationalMode,
    label + ": mode mismatch",
    measurements,
  );
  check(measurements.routeSpecific.ready, label + ": route content missing", measurements);
  check(
    !measurements.routeSpecific.restricted,
    label + ": permission denial rendered",
    measurements,
  );
  check(
    keyboard.focusedInsidePage && keyboard.focusedVisible,
    label + ": keyboard focus proof failed",
    keyboard,
  );

  if (route === "/admin/instituicoes") {
    check(
      measurements.routeSpecific.summaryCards === 0 && measurements.routeSpecific.compactSummary === 4,
      label + ": metrics still compete with catalog",
      measurements,
    );
    check(
      measurements.routeSpecific.filterControls === 8 && measurements.routeSpecific.primaryFilters === 3,
      label + ": progressive filter controls incomplete",
      measurements,
    );
    check(
      measurements.routeSpecific.advancedCollapsed && measurements.routeSpecific.catalogAfterFilters,
      label + ": advanced filters compete with catalog",
      measurements,
    );
  }
  if (route === "/admin/indices-financeiros") {
    check(
      measurements.routeSpecific.summaryCards >= 4,
      label + ": summary incomplete",
      measurements,
    );
    check(
      measurements.routeSpecific.operationCards === 2,
      label + ": operations incomplete",
      measurements,
    );
  }
  if (route === "/remuneracao-contas") {
    check(measurements.routeSpecific.infoAlert, label + ": explanation missing", measurements);
    check(
      measurements.routeSpecific.port === String(compatPort),
      label + ": compatibility server not used",
      measurements,
    );
  }

  return { viewport: { width, height }, measurements, keyboard, screenshot: image };
}

async function verifyAdminScenarios(cdp) {
  const filterRuns = [];
  const modalRuns = [];
  for (const [width, height, label] of [[1366, 768, "desktop"], [390, 844, "mobile"], [320, 740, "compact-mobile"]]) {
    await setViewport(cdp, width, height);
    await navigate(cdp, baseUrl + route + "?q=__issue728_no_match__&logoStatus=fallback&sort=bankCode&order=desc");
    await waitReady(cdp);
    const filtered = await evaluate(cdp, `(() => {
      const details = document.querySelector(".admin-advanced-filters");
      const chips = document.querySelectorAll(".active-filter-chip");
      return {
        noResults: document.querySelector(".empty-state")?.textContent?.includes("Nenhum resultado para os filtros aplicados"),
        chips: chips.length,
        detailsClosed: Boolean(details && !details.open),
        filterCount: document.querySelector(".advanced-count")?.textContent?.trim(),
        sorting: document.querySelector('select[name="sort"]')?.value,
        order: document.querySelector('input[name="order"]')?.value,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    })()`);
    check(filtered.noResults && filtered.chips === 1 && filtered.detailsClosed && filtered.filterCount === "1 ativos", label + ": active filter not visible with empty catalog", filtered);
    check(filtered.sorting === "bankCode" && filtered.order === "desc" && !filtered.horizontalOverflow, label + ": sorting or reflow failed", filtered);
    const filteredImage = "issue-728-admin-filtered-" + label + "-" + width + "x" + height + ".png";
    await screenshot(cdp, join(outputDir, filteredImage));
    filterRuns.push({ viewport: { width, height }, screenshot: filteredImage, assertions: filtered });

    await navigate(cdp, baseUrl + route);
    await waitReady(cdp);
    const dialog = await evaluate(cdp, `(() => {
      const trigger = document.querySelector(".institution-logo-trigger");
      trigger?.click();
      const modal = document.querySelector(".logo-upload-dialog[open]");
      const rect = modal?.getBoundingClientRect();
      return {
        triggerFound: Boolean(trigger),
        open: Boolean(modal),
        labelled: Boolean(modal?.getAttribute("aria-labelledby")),
        acceptsImages: Boolean(modal?.querySelector('input[accept="image/png,image/jpeg,image/webp"]')),
        withinViewport: Boolean(rect && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        fallbackAvailable: Boolean(document.querySelector(".institution-logo-trigger span:not(.logo-upload-hint)")),
      };
    })()`);
    check(dialog.triggerFound && dialog.open && dialog.labelled && dialog.acceptsImages && dialog.withinViewport && !dialog.horizontalOverflow, label + ": logo upload dialog not accessible or clipped", dialog);
    const modalImage = "issue-728-admin-upload-" + label + "-" + width + "x" + height + ".png";
    await screenshot(cdp, join(outputDir, modalImage));
    modalRuns.push({ viewport: { width, height }, screenshot: modalImage, assertions: dialog });
    await evaluate(cdp, `document.querySelector(".logo-upload-dialog[open]")?.close(); true`);
  }
  return { filtered: filterRuns, upload: modalRuns };
}

async function waitReady(cdp) {
  const selector = '[data-secondary-route-foundation="' + foundationId + '"] ' + readySelector;
  for (let i = 0; i < 60; i += 1) {
    const ready = await evaluate(
      cdp,
      "Boolean(document.querySelector(" + JSON.stringify(selector) + "))",
    ).catch(() => false);
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for " + route + " to render " + readySelector);
}

function measurementExpression() {
  const foundationSelector = JSON.stringify(`[data-secondary-route-foundation="${foundationId}"]`);
  const routeSelector = JSON.stringify(readySelector);
  return `(() => {
    const root = document.querySelector(${foundationSelector});
    if (!root) throw new Error("foundation root missing");
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const name = (element) => {
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy
          .split(/\\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || "")
          .filter(Boolean)
          .join(" ");
        if (text) return text;
      }
      const labels = element.labels
        ? Array.from(element.labels)
            .map((label) => label.textContent?.trim() || "")
            .filter(Boolean)
            .join(" ")
        : "";
      if (labels) return labels;
      return (
        element.textContent?.trim() ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        element.getAttribute("name") ||
        ""
      );
    };
    const interactive = Array.from(
      root.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ).filter(visible);
    const unnamed = interactive.filter((element) => !name(element));
    const documentElement = document.documentElement;
    return {
      pathname: location.pathname,
      pageContainer: Boolean(root.closest(".sf-page-container")),
      pageHeader: Boolean(root.querySelector(".sf-page-header")),
      headingVisible: visible(root.querySelector(".sf-page-header-title")),
      noHorizontalOverflow: documentElement.scrollWidth <= documentElement.clientWidth + 1,
      unnamedInteractiveCount: unnamed.length,
      foundation: {
        id: root.getAttribute("data-secondary-route-foundation") || "",
        archetype: root.getAttribute("data-route-archetype") || "",
        audience: root.getAttribute("data-route-audience") || "",
        operationalMode: root.getAttribute("data-operational-mode") || "",
      },
      routeSpecific: {
        ready: Boolean(root.querySelector(${routeSelector})),
        restricted: Boolean(root.querySelector('[data-state="permission"]')),
        summaryCards: root.querySelectorAll(".sf-metric-card").length,
        compactSummary: root.querySelectorAll(".admin-summary-item").length,
        primaryFilters: root.querySelectorAll(".filters-grid input,.filters-grid select").length,
        filterControls: root.querySelectorAll(".filters-grid input,.filters-grid select,.advanced-filters-grid input,.advanced-filters-grid select").length,
        advancedCollapsed: Boolean(root.querySelector(".admin-advanced-filters:not([open]) summary")),
        catalogAfterFilters: Boolean(root.querySelector(".filters-panel")?.compareDocumentPosition(root.querySelector(".list-panel")) & Node.DOCUMENT_POSITION_FOLLOWING),
        operationCards: root.querySelectorAll(".operation-card").length,
        infoAlert: Boolean(root.querySelector(".sf-alert")),
        port: location.port,
      },
    };
  })()`;
}

async function tabIntoPage(cdp) {
  await evaluate(cdp, "document.activeElement?.blur(); true");
  const foundationSelector = JSON.stringify(`[data-secondary-route-foundation="${foundationId}"]`);
  const stateExpression = `(() => {
    const root = document.querySelector(${foundationSelector});
    const active = document.activeElement;
    if (!root || !active) return { inside: false, visible: false };
    const rect = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    return {
      inside: root.contains(active),
      visible:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.top <= innerHeight,
    };
  })()`;

  for (let i = 1; i <= 80; i += 1) {
    await pressTab(cdp);
    const state = await evaluate(cdp, stateExpression);
    if (state.inside) {
      return {
        steps: i,
        focusedInsidePage: true,
        focusedVisible: state.visible,
      };
    }
  }
  return { steps: 80, focusedInsidePage: false, focusedVisible: false };
}

async function pressTab(cdp) {
  const params = {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...params });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  await sleep(40);
}

async function startCompat() {
  const child = spawn(process.execPath, ["apps/web/dist/dev-server.js"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(compatPort),
      SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION: "1",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4000);
  });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) {
      throw new Error("Compatibility server exited: " + stderr.slice(-800));
    }
    try {
      const response = await fetch(compatUrl + "/health");
      if (response.ok) return child;
    } catch {}
    await sleep(100);
  }
  child.kill("SIGTERM");
  throw new Error("Compatibility server did not become healthy.");
}

async function stopCompat(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function serialize(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? "" }
    : { name: "UnknownError", message: String(error), stack: "" };
}
