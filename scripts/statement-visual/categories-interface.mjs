import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for categories visual validation.");
await mkdir(outputDir, { recursive: true });
let desktop;
let desktopModal;
let mobile;
let mobileModal;
let browserVersion = "unknown";
const completedScreenshots = [];

await runViewportSession("desktop", 1440, 1000, async (cdp) => {
  desktop = await validateDesktop(cdp);
  completedScreenshots.push("categories-desktop.png");
  desktopModal = await validateDesktopModal(cdp);
  completedScreenshots.push("categories-modal-desktop.png");
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  mobile = await validateMobile(cdp);
  completedScreenshots.push("categories-mobile.png");
  mobileModal = await validateMobileModal(cdp);
  completedScreenshots.push("categories-modal-mobile.png");
});

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  failures,
  desktop,
  desktopModal,
  mobile,
  mobileModal,
  screenshots: completedScreenshots,
};

await writeFile(
  join(outputDir, "categories-interface.json"),
  `${JSON.stringify(report, null, 2)}
`,
);
await writeFile(join(outputDir, "CATEGORIES-INTERFACE.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Categories desktop, modal and mobile visual validation passed.");
}

async function runViewportSession(label, width, height, validate) {
  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    browserVersion = browser.version;
    console.log(`Starting categories ${label} validation.`);
    await loginAndOpenCategories(browser.cdp, width, height);
    await validate(browser.cdp);
  } catch (error) {
    const details = serializeError(error);
    failures.push({ message: `Categories ${label} validation crashed`, details });
    console.error(`Categories ${label} validation crashed:`, details);
  } finally {
    if (browser) await browser.close(outputDir);
    await sleep(250);
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}

async function loginAndOpenCategories(cdp, width, height) {
  await setViewport(cdp, width, height);
  await navigateWithRetry(cdp, `${baseUrl}/login`, "login");
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  await navigateWithRetry(cdp, `${baseUrl}/categorias`, "categories");
  await waitForCategories(cdp);
}

async function validateDesktop(cdp) {
  await setViewport(cdp, 1440, 1000);
  await waitForCategories(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-desktop.png"));

  check(
    measurements.viewport.width === 1440,
    "Categories desktop viewport is not 1440px",
    measurements,
  );
  check(
    measurements.noHorizontalOverflow,
    "Categories desktop page has horizontal overflow",
    measurements,
  );
  check(
    measurements.summaryCount === 4,
    "Categories summary does not have four indicators",
    measurements,
  );
  check(
    measurements.filterCount === 5,
    "Categories toolbar does not have five filters",
    measurements,
  );
  check(measurements.search.visible, "Categories search is not visible on desktop", measurements);
  check(
    measurements.directory.visible,
    "Categories directory is not visible on desktop",
    measurements,
  );
  check(
    measurements.allFilterPressed,
    "All categories filter is not selected initially",
    measurements,
  );
  check(measurements.rowCount > 0, "Categories hierarchy rendered no rows", measurements);
  check(
    measurements.minimumRowHeight >= 44,
    "Category rows are smaller than the interaction target",
    measurements,
  );

  const search = await validateSearch(cdp);
  return { viewport: "1440x1000", measurements, search, screenshot: "categories-desktop.png" };
}

async function validateSearch(cdp) {
  const firstName = await evaluate(
    cdp,
    `document.querySelector('[data-category-item] [data-edit-category]')?.dataset.categoryName || ''`,
  );
  assert.ok(firstName, "Expected at least one category name for search validation");
  const query = firstName.slice(0, Math.min(4, firstName.length));

  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-category-search-input]');
      input.value = ${JSON.stringify(query)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await sleep(100);

  const result = await evaluate(
    cdp,
    `(() => {
      const visibleItems = Array.from(document.querySelectorAll('[data-category-item]')).filter((item) => !item.hidden);
      const status = document.querySelector('[data-category-results-status]')?.textContent?.trim() || '';
      const clearVisible = !document.querySelector('[data-clear-category-search]')?.hidden;
      return { visibleCount: visibleItems.length, status, clearVisible };
    })()`,
  );

  check(result.visibleCount > 0, "Category search hid every category", { query, result });
  check(result.status.includes("exibida"), "Category search did not announce its result count", {
    query,
    result,
  });
  check(result.clearVisible, "Category search clear action did not become visible", {
    query,
    result,
  });

  await evaluate(cdp, `document.querySelector('[data-clear-category-search]')?.click()`);
  await sleep(80);
  return { query, ...result };
}

async function validateDesktopModal(cdp) {
  await evaluate(cdp, `document.querySelector('[data-open-category-modal]')?.click()`);
  await waitForModal(cdp);
  const measurements = await evaluate(cdp, modalMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-modal-desktop.png"));

  check(measurements.visible, "Category modal did not open on desktop", measurements);
  check(measurements.insideViewport, "Category modal exceeds the desktop viewport", measurements);
  check(measurements.hasDescription, "Category modal has no accessible description", measurements);
  check(
    measurements.labelledControls === 3,
    "Category modal controls are not fully labelled",
    measurements,
  );
  check(measurements.nameFocused, "Category name did not receive initial focus", measurements);
  check(measurements.closeTarget >= 34, "Category modal close action is too small", measurements);

  await closeModal(cdp);
  return { viewport: "1440x1000", measurements, screenshot: "categories-modal-desktop.png" };
}

async function validateMobile(cdp) {
  await setViewport(cdp, 390, 844);
  await waitForCategories(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-mobile.png"));

  check(
    measurements.viewport.width === 390,
    "Categories mobile viewport is not 390px",
    measurements,
  );
  check(
    measurements.noHorizontalOverflow,
    "Categories mobile page has horizontal overflow",
    measurements,
  );
  check(
    measurements.heroAction.height >= 44,
    "New category mobile action is smaller than 44px",
    measurements,
  );
  check(
    measurements.search.height >= 44,
    "Category search mobile target is smaller than 44px",
    measurements,
  );
  check(
    measurements.filterCount === 5,
    "Categories filters are incomplete on mobile",
    measurements,
  );
  check(
    measurements.summaryCount === 4,
    "Categories summary is incomplete on mobile",
    measurements,
  );
  check(
    measurements.minimumMenuTarget >= 40,
    "Category row menu target is too small on mobile",
    measurements,
  );

  return { viewport: "390x844", measurements, screenshot: "categories-mobile.png" };
}

async function validateMobileModal(cdp) {
  await evaluate(cdp, `document.querySelector('[data-open-category-modal]')?.click()`);
  await waitForModal(cdp);
  const measurements = await evaluate(cdp, modalMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-modal-mobile.png"));

  check(measurements.visible, "Category modal did not open on mobile", measurements);
  check(measurements.insideViewport, "Category modal exceeds the mobile viewport", measurements);
  check(measurements.singleColumn, "Category modal is not single-column on mobile", measurements);
  check(
    measurements.minimumActionHeight >= 44,
    "Category modal mobile actions are smaller than 44px",
    measurements,
  );

  await closeModal(cdp);
  return { viewport: "390x844", measurements, screenshot: "categories-modal-mobile.png" };
}

async function navigateWithRetry(cdp, url, label) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      let pageState = { href: "", readyState: "" };
      try {
        pageState = await evaluate(
          cdp,
          `({ href: window.location.href, readyState: document.readyState })`,
        );
      } catch {
        // The renderer may still be restarting; retry below.
      }

      if (pageState.href.startsWith(url) && pageState.readyState !== "loading") {
        console.warn(`Navigation to ${label} reached the page despite a missing load event.`);
        return;
      }

      if (attempt === attempts) throw error;
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(400 * attempt);
    }
  }
}

async function waitForCategories(cdp) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('main[data-categories-design-enhanced] [data-category-list]'))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Categories design enhancement did not render.");
}

async function waitForModal(cdp) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const visible = await evaluate(
      cdp,
      `Boolean(document.querySelector('[data-category-modal]:not([hidden])'))`,
    );
    if (visible) return;
    await sleep(50);
  }
  throw new Error("Category modal did not become visible.");
}

async function closeModal(cdp) {
  await evaluate(
    cdp,
    `document.querySelector('[data-category-modal] [data-close-category-modal]')?.click()`,
  );
  await sleep(80);
}

function pageMeasurementExpression() {
  return `(() => {
    const rect = (element) => {
      if (!element) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
      const value = element.getBoundingClientRect();
      return { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height };
    };
    const visible = (element) => {
      if (!element) return false;
      const value = rect(element);
      const style = getComputedStyle(element);
      return value.width > 0 && value.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const rows = Array.from(document.querySelectorAll('[data-category-item] > .category-node-row'));
    const menus = Array.from(document.querySelectorAll('[data-category-menu-button]'));
    const search = document.querySelector('[data-category-search-input]');
    const heroAction = document.querySelector('[data-open-category-modal]');
    const directory = document.querySelector('.category-directory');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      summaryCount: document.querySelectorAll('.category-summary-item').length,
      filterCount: document.querySelectorAll('[data-category-filter]').length,
      allFilterPressed: document.querySelector('[data-category-filter="all"]')?.getAttribute('aria-pressed') === 'true',
      rowCount: rows.length,
      minimumRowHeight: rows.length ? Math.min(...rows.map((row) => rect(row).height)) : 0,
      minimumMenuTarget: menus.length ? Math.min(...menus.map((menu) => rect(menu).height)) : 0,
      search: { ...rect(search), visible: visible(search) },
      heroAction: rect(heroAction),
      directory: { ...rect(directory), visible: visible(directory) },
    };
  })()`;
}

function modalMeasurementExpression() {
  return `(() => {
    const dialog = document.querySelector('[data-category-modal] [role="dialog"]');
    const close = dialog?.querySelector('[data-close-category-modal]');
    const actions = Array.from(dialog?.querySelectorAll('.dialog-actions button:not([hidden])') || []);
    const value = dialog?.getBoundingClientRect();
    const style = dialog ? getComputedStyle(dialog) : null;
    const formStyle = dialog ? getComputedStyle(dialog.querySelector('.category-form')) : null;
    const height = (element) => element?.getBoundingClientRect().height || 0;
    return {
      visible: Boolean(dialog && value && value.width > 0 && value.height > 0),
      insideViewport: Boolean(value && value.left >= 0 && value.right <= window.innerWidth && value.top >= 0 && value.bottom <= window.innerHeight),
      width: value?.width || 0,
      height: value?.height || 0,
      overflowY: style?.overflowY || '',
      hasDescription: dialog?.getAttribute('aria-describedby') === 'category-modal-description',
      labelledControls: dialog?.querySelectorAll('label[for]').length || 0,
      nameFocused: document.activeElement?.id === 'category-name',
      closeTarget: height(close),
      minimumActionHeight: actions.length ? Math.min(...actions.map(height)) : 0,
      singleColumn: Boolean(formStyle && formStyle.gridTemplateColumns.split(' ').length === 1),
    };
  })()`;
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function renderReport(report) {
  const status = report.failures.length === 0 ? "APROVADO" : "REPROVADO";
  const screenshot = (result) => result?.screenshot ?? "não gerada";
  return `# Evidência visual — Categorias\n\n- Status: **${status}**\n- Commit: \`${report.commit}\`\n- Navegador: ${report.browser}\n- Desktop: \`${screenshot(report.desktop)}\`\n- Modal desktop: \`${screenshot(report.desktopModal)}\`\n- Mobile: \`${screenshot(report.mobile)}\`\n- Modal mobile: \`${screenshot(report.mobileModal)}\`\n\n## Falhas\n\n${report.failures.length === 0 ? "Nenhuma falha encontrada.\n" : report.failures.map((failure) => `- ${failure.message}`).join("\n") + "\n"}`;
}
