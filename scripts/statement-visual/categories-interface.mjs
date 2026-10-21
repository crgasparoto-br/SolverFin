import { state as categoryVisualState } from "./categories-visual-state.mjs";
import {
  validateDesktop,
  validateSearch,
  validateDesktopModal,
} from "./categories-visual-desktop.mjs";
import {
  validateCategoryMutationFailures,
  validateCategoryCrud,
  validateSidebarThemeParity,
} from "./categories-visual-operations.mjs";
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
let compactMobile;
let mutationFailures;
let categoryCrud;
let sidebarParity;
let browserVersion = "unknown";
const completedScreenshots = [];

Object.assign(categoryVisualState, {
  check,
  waitForCategories,
  waitForModal,
  closeModal,
  navigateWithRetry,
  loginAndOpenCategories,
  pageMeasurementExpression,
  modalMeasurementExpression,
});
await runViewportSession("desktop", 1440, 1000, async (cdp) => {
  desktop = await validateDesktop(cdp);
  completedScreenshots.push("categories-desktop.png");
  desktopModal = await validateDesktopModal(cdp);
  completedScreenshots.push("categories-modal-desktop.png");
  mutationFailures = await validateCategoryMutationFailures(cdp);
  categoryCrud = await validateCategoryCrud(cdp);
  sidebarParity = await validateSidebarThemeParity(cdp);
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  mobile = await validateMobile(cdp);
  completedScreenshots.push("categories-mobile.png");
  completedScreenshots.push(...mobile.hierarchyScreenshots);
  mobileModal = await validateMobileModal(cdp);
  completedScreenshots.push("categories-modal-mobile.png");
});

await runViewportSession("compact-mobile", 320, 740, async (cdp) => {
  compactMobile = await validateCompactMobile(cdp);
  completedScreenshots.push("categories-compact-mobile.png");
  completedScreenshots.push(...compactMobile.hierarchyScreenshots);
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
  compactMobile,
  mutationFailures,
  categoryCrud,
  sidebarParity,
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
    failures.push({
      message: `Categories ${label} validation crashed`,
      details,
    });
    console.error(`Categories ${label} validation crashed:`, details);
  } finally {
    if (browser) await browser.close(outputDir);
    await sleep(250);
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
    };
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

async function validateMobile(cdp) {
  await setViewport(cdp, 390, 844);
  await waitForCategories(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-mobile.png"));

  check(
    !measurements.columnHeadingsVisible,
    "Mobile column headers should be hidden",
    measurements,
  );
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
    measurements.search.width >= 100,
    "Category search mobile input is squeezed by visible label",
    measurements,
  );
  check(
    measurements.overflowElements.length === 0,
    "Mobile category text extends beyond the viewport",
    measurements,
  );
  check(
    measurements.filterCount === 5,
    "Categories filters are incomplete on mobile",
    measurements,
  );
  check(
    measurements.summaryCount === 4,
    "Categories semantic overview is incomplete on mobile",
    measurements,
  );
  check(
    measurements.minimumMenuTarget >= 44,
    "Category row menu target is too small on mobile",
    measurements,
  );

  check(
    measurements.minimumFilterTarget >= 44,
    "Mobile filter action is less than 44px",
    measurements,
  );
  check(
    measurements.minimumCollapseTarget >= 44,
    "Mobile hierarchy expand action is less than 44px",
    measurements,
  );
  check(
    measurements.minimumCompactTarget >= 44,
    "Mobile expand-all action is less than 44px",
    measurements,
  );
  const hierarchy = await captureMobileHierarchyEvidence(cdp, "mobile");
  return {
    viewport: "390x844",
    measurements,
    screenshot: "categories-mobile.png",
    ...hierarchy,
  };
}

async function validateCompactMobile(cdp) {
  await setViewport(cdp, 320, 740);
  await waitForCategories(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-compact-mobile.png"));
  check(
    measurements.viewport.width === 320,
    "Category narrow mobile viewport is not 320px",
    measurements,
  );
  check(
    measurements.noHorizontalOverflow,
    "Categories exceed narrow mobile viewport",
    measurements,
  );
  check(
    measurements.minimumMenuTarget >= 44,
    "Narrow mobile action is less than 44px",
    measurements,
  );
  check(measurements.minimumRowHeight >= 44, "Narrow mobile row is too small", measurements);
  check(measurements.search.height >= 44, "Narrow mobile search input is too small", measurements);
  check(
    measurements.search.width >= 100,
    "Narrow mobile search input has insufficient usable width",
    measurements,
  );
  check(
    measurements.overflowElements.length === 0,
    "Narrow mobile category text extends beyond the viewport",
    measurements,
  );
  check(
    measurements.minimumFilterTarget >= 44,
    "Narrow mobile filter action is less than 44px",
    measurements,
  );
  check(
    measurements.minimumCollapseTarget >= 44,
    "Narrow mobile hierarchy expand action is less than 44px",
    measurements,
  );
  check(
    measurements.minimumCompactTarget >= 44,
    "Narrow mobile expand-all action is less than 44px",
    measurements,
  );
  const hierarchy = await captureMobileHierarchyEvidence(cdp, "compact-mobile");
  return {
    viewport: "320x740",
    measurements,
    screenshot: "categories-compact-mobile.png",
    ...hierarchy,
  };
}

/** Capture the actual hierarchy below the toolbar, not just the initial mobile fold. */
async function captureMobileHierarchyEvidence(cdp, viewport) {
  const selection = await evaluate(cdp, `(() => {
    const items = [...document.querySelectorAll('[data-category-item]')];
    const chains = items.filter(item => item.dataset.categoryDepth === '2').map(leaf => {
      const child = leaf.parentElement?.closest('[data-category-item]');
      const root = child?.parentElement?.closest('[data-category-item]');
      return root && child ? [root, child, leaf] : null;
    }).filter(Boolean);
    chains.sort((a, b) =>
      (items.indexOf(a[2]) - items.indexOf(a[0])) -
      (items.indexOf(b[2]) - items.indexOf(b[0])));
    const chosen = chains[0];
    if (!chosen) return { indexes: [], names: [] };
    chosen[0].querySelector(':scope > .category-node-row').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -96);
    return {
      indexes: chosen.map(item => items.indexOf(item)),
      names: chosen.map(item => item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName),
    };
  })()`);
  await sleep(160);
  const hierarchyVisible = await evaluate(cdp, `(() => {
    const items = [...document.querySelectorAll('[data-category-item]')];
    return ${JSON.stringify(selection.indexes)}.map((index, depth) => {
      const item = items[index];
      const row = item?.querySelector(':scope > .category-node-row');
      const menu = row?.querySelector('[data-category-menu-button]');
      const status = row?.querySelector('[data-category-status-icon]');
      const bounds = row?.getBoundingClientRect();
      const menuBounds = menu?.getBoundingClientRect();
      return {
        depth, name: row?.querySelector('[data-edit-category]')?.dataset.categoryName,
        inViewport: Boolean(bounds && bounds.top >= 72 && bounds.bottom <= innerHeight - 4),
        menuVisible: Boolean(menuBounds && menuBounds.left >= 0 && menuBounds.right <= innerWidth && menuBounds.width > 0),
        statusVisible: Boolean(status && status.getBoundingClientRect().width > 0),
      };
    });
  })()`);
  const hierarchyScreenshot = `categories-${viewport}-hierarchy.png`;
  await screenshot(cdp, join(outputDir, hierarchyScreenshot));
  check(
    hierarchyVisible.length === 3 &&
      hierarchyVisible.every((row) => row.inViewport && row.menuVisible && row.statusVisible),
    `Mobile ${viewport} evidence does not expose all three hierarchy levels and actions`,
    { selection, hierarchyVisible },
  );

  const longest = await evaluate(cdp, `(() => {
    const items = [...document.querySelectorAll('[data-category-item]')];
    const item = items.sort((a, b) =>
      (b.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName.length || 0) -
      (a.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName.length || 0))[0];
    const row = item?.querySelector(':scope > .category-node-row');
    row?.scrollIntoView({ block: 'center' });
    return { name: row?.querySelector('[data-edit-category]')?.dataset.categoryName || '' };
  })()`);
  await sleep(160);
  const longNameVisible = await evaluate(cdp, `(() => {
    const item = [...document.querySelectorAll('[data-category-item]')].find(item =>
      item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName === ${JSON.stringify(longest.name)});
    const row = item?.querySelector(':scope > .category-node-row');
    const action = row?.querySelector('[data-category-menu-button]');
    const rect = row?.getBoundingClientRect();
    const button = action?.getBoundingClientRect();
    return Boolean(rect && rect.top >= 72 && rect.bottom <= innerHeight - 4 &&
      button && button.left >= 0 && button.right <= innerWidth);
  })()`);
  const longNameScreenshot = `categories-${viewport}-long-name.png`;
  await screenshot(cdp, join(outputDir, longNameScreenshot));
  check(
    longest.name.length >= 25 && longNameVisible,
    `Mobile ${viewport} long-name evidence does not show the row and its action`,
    { longest, longNameVisible },
  );
  return {
    hierarchyScreenshots: [hierarchyScreenshot, longNameScreenshot],
    hierarchyEvidence: { selection, hierarchyVisible, longest, longNameVisible },
  };
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
  return {
    viewport: "390x844",
    measurements,
    screenshot: "categories-modal-mobile.png",
  };
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

      if (pageState.href.startsWith(url)) {
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
      `Boolean(document.querySelector('[data-secondary-route-foundation="categories"] [data-category-list]'))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Categories shared foundation did not render.");
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
    const filters = Array.from(document.querySelectorAll('[data-category-filter]'));
    const collapses = Array.from(document.querySelectorAll('[data-toggle-category-children]'));
    const compactActions = Array.from(document.querySelectorAll('.category-collapse-actions button'));
    const search = document.querySelector('[data-category-search-input]');
    const heroAction = document.querySelector('[data-open-category-modal]');
    const directory = document.querySelector('.category-directory');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      pageScrollWidth: document.querySelector('.categories-page')?.scrollWidth || 0,
      pageClientWidth: document.querySelector('.categories-page')?.clientWidth || 0,
      pageScrollSources: Array.from(document.querySelectorAll('.categories-page *'))
        .filter((element) => element.scrollWidth > element.clientWidth + 2 && element.clientWidth > 0)
        .slice(0, 24)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className?.baseVal || element.className || '').slice(0, 90),
          client: element.clientWidth,
          scroll: element.scrollWidth,
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          overflowX: getComputedStyle(element).overflowX,
        })),
      structuralWidths: ['.app-shell', '.sidebar', '.sidebar nav', '.main-area', '.main-area main', '.categories-page', '.category-directory', '.category-toolbar', '.category-kind-group']
        .map((selector) => {
          const element = document.querySelector(selector);
          return element ? { selector, client: element.clientWidth, scroll: element.scrollWidth, right: Math.round(element.getBoundingClientRect().right) } : null;
        }).filter(Boolean),
      globalOverflowElements: Array.from(document.querySelectorAll('body *'))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== 'none' && bounds.width > 0 &&
            (bounds.right > window.innerWidth + 1 || bounds.left < -1);
        })
        .slice(0, 25)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className?.baseVal || element.className || '').slice(0, 100),
          right: Math.round(element.getBoundingClientRect().right),
          left: Math.round(element.getBoundingClientRect().left),
        })),
      summaryCount: document.querySelectorAll('.category-overview > div').length,
      semanticLists: document.querySelectorAll('ul.category-tree-nodes').length,
      nestedLists: document.querySelectorAll('ul.category-tree-children').length,
      deepestRenderedLevel: Math.max(0, ...Array.from(document.querySelectorAll('[data-category-depth]'))
        .map((item) => Number(item.dataset.categoryDepth) + 1)),
      filterCount: document.querySelectorAll('[data-category-filter]').length,
      allFilterPressed: document.querySelector('[data-category-filter="all"]')?.getAttribute('aria-pressed') === 'true',
      rowCount: rows.length,
      headerCount: document.querySelectorAll('.category-column-headings').length,
      columnHeadingsVisible: visible(document.querySelector('.category-column-headings')),
      parentCellCount: document.querySelectorAll('.category-parent-cell').length,
      levelCellCount: document.querySelectorAll('.category-level-cell').length,
      statusCellCount: document.querySelectorAll('.category-status-cell').length,
      compactRowHeight: Math.max(0, ...rows
        .filter((row) => (row.querySelector('[data-edit-category]')?.dataset.categoryName || '').length < 25)
        .map((row) => rect(row).height)),
      minimumRowHeight: rows.length ? Math.min(...rows.map((row) => rect(row).height)) : 0,
      minimumMenuTarget: menus.length ? Math.min(...menus.map((menu) => rect(menu).height)) : 0,
      minimumFilterTarget: filters.length ? Math.min(...filters.map((filter) => rect(filter).height)) : 0,
      minimumCollapseTarget: collapses.length ? Math.min(...collapses.map((button) => rect(button).height)) : 44,
      minimumCompactTarget: compactActions.length ? Math.min(...compactActions.map((button) => rect(button).height)) : 0,
      overflowElements: Array.from(document.querySelectorAll('.categories-page *'))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== 'none' && bounds.width > 0 &&
            (bounds.right > window.innerWidth + 1 || bounds.left < -1);
        })
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className?.baseVal || element.className || '').slice(0, 120),
          right: Math.round(element.getBoundingClientRect().right),
          left: Math.round(element.getBoundingClientRect().left),
        })),
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
  const hierarchyScreenshots = (result) => result?.hierarchyScreenshots?.join(", ") ?? "não geradas";
  return `# Evidência visual — Categorias\n\n- Status: **${status}**\n- Commit: \`${report.commit}\`\n- Navegador: ${report.browser}\n- Desktop: \`${screenshot(report.desktop)}\`\n- Modal desktop: \`${screenshot(report.desktopModal)}\`\n- Mobile: \`${screenshot(report.mobile)}\`\n- Modal mobile: \`${screenshot(report.mobileModal)}\`\n- Mobile estreito: \`${screenshot(report.compactMobile)}\`\n- Árvore e nomes longos 390px: \`${hierarchyScreenshots(report.mobile)}\`\n- Árvore e nomes longos 320px: \`${hierarchyScreenshots(report.compactMobile)}\`\n\n## Falhas\n\n${report.failures.length === 0 ? "Nenhuma falha encontrada.\n" : report.failures.map((failure) => `- ${failure.message}`).join("\n") + "\n"}`;
}
