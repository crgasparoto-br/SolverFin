import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath)
  throw new Error("CHROME_BIN is required for categories visual validation.");
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
  mobileModal = await validateMobileModal(cdp);
  completedScreenshots.push("categories-modal-mobile.png");
});

await runViewportSession("compact-mobile", 320, 740, async (cdp) => {
  compactMobile = await validateCompactMobile(cdp);
  completedScreenshots.push("categories-compact-mobile.png");
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
await writeFile(
  join(outputDir, "CATEGORIES-INTERFACE.md"),
  renderReport(report),
);

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
  assert.equal(
    login.ok,
    true,
    `Demo login failed: ${login.status} ${login.body}`,
  );
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
    "Categories semantic overview does not have four indicators",
    measurements,
  );
  check(
    measurements.filterCount === 5,
    "Categories toolbar does not have five filters",
    measurements,
  );
  check(
    measurements.search.visible,
    "Categories search is not visible on desktop",
    measurements,
  );
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
  check(
    measurements.rowCount > 0,
    "Categories hierarchy rendered no rows",
    measurements,
  );
  check(
    measurements.semanticLists > 0,
    "Category hierarchy lost native list semantics",
    measurements,
  );
  check(
    measurements.nestedLists > 0,
    "Category hierarchy lost nested parent-child lists",
    measurements,
  );
  check(
    measurements.minimumRowHeight >= 44,
    "Category rows are smaller than the interaction target",
    measurements,
  );

  check(
    measurements.headerCount === 3,
    "Desktop lost compact column headers",
    measurements,
  );
  check(
    measurements.parentCellCount === measurements.rowCount &&
      measurements.levelCellCount === measurements.rowCount &&
      measurements.statusCellCount === measurements.rowCount,
    "Categories lost parent, level or situation columns",
    measurements,
  );
  check(
    measurements.compactRowHeight <= 56,
    "Short category names exceed compact row height",
    measurements,
  );
  const search = await validateSearch(cdp);
  return {
    viewport: "1440x1000",
    measurements,
    search,
    screenshot: "categories-desktop.png",
  };
}

async function validateSearch(cdp) {
  const firstName = await evaluate(
    cdp,
    `document.querySelector('[data-category-item] [data-edit-category]')?.dataset.categoryName || ''`,
  );
  assert.ok(
    firstName,
    "Expected at least one category name for search validation",
  );
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

  check(result.visibleCount > 0, "Category search hid every category", {
    query,
    result,
  });
  check(
    result.status.includes("exibida"),
    "Category search did not announce its result count",
    {
      query,
      result,
    },
  );
  check(
    result.clearVisible,
    "Category search clear action did not become visible",
    {
      query,
      result,
    },
  );

  await evaluate(
    cdp,
    `document.querySelector('[data-clear-category-search]')?.click()`,
  );
  await sleep(80);

  const pathResult = await evaluate(
    cdp,
    `(() => {
      const normalize = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
      const items = Array.from(document.querySelectorAll('[data-category-item]'));
      let candidate = null;

      for (const item of items) {
        const name = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName?.trim() || '';
        const path = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryPath?.trim() || '';
        if (!name || !path || normalize(name) === normalize(path)) continue;
        const ancestor = path
          .split('>')
          .map((part) => part.trim())
          .find((part) => part && !normalize(name).includes(normalize(part)));
        if (ancestor) {
          candidate = { item, name, path, ancestor };
          break;
        }
      }

      if (!candidate) return { candidateFound: false };
      const query = candidate.ancestor.slice(0, Math.min(4, candidate.ancestor.length));
      const input = document.querySelector('[data-category-search-input]');
      input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const expectedMatchCount = items.filter((item) => {
        const name = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryName || '';
        const path = item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryPath || '';
        return normalize(name + ' ' + path).includes(normalize(query));
      }).length;
      const status = document.querySelector('[data-category-results-status]')?.textContent?.trim() || '';
      const statusCount = Number(status.match(/\\d+/)?.[0] ?? -1);

      return {
        candidateFound: true,
        name: candidate.name,
        path: candidate.path,
        query,
        targetVisible: !candidate.item.hidden,
        expectedMatchCount,
        statusCount,
        status,
      };
    })()`,
  );

  check(
    pathResult.candidateFound,
    "Expected nested category for path search",
    pathResult,
  );
  check(
    pathResult.targetVisible,
    "Category path search lost ancestor matching",
    pathResult,
  );
  check(
    pathResult.statusCount === pathResult.expectedMatchCount,
    "Category search count is not direct-match only",
    pathResult,
  );

  await evaluate(
    cdp,
    `document.querySelector('[data-clear-category-search]')?.click()`,
  );
  await sleep(80);

  const emptyResult = await evaluate(
    cdp,
    `(() => {
    const input = document.querySelector('[data-category-search-input]');
    input.value = 'no-results-717-unmatched-abcdef';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      emptyVisible: !document.querySelector('[data-category-filter-empty]')?.hidden,
      allRowsHidden: Array.from(document.querySelectorAll('[data-category-item]'))
        .every((item) => item.hidden),
      status: document.querySelector('[data-category-results-status]')?.textContent || ''
    };
  })()`,
  );
  check(
    emptyResult.emptyVisible && emptyResult.allRowsHidden,
    "Category empty filter fails to hide every row",
    emptyResult,
  );
  await evaluate(
    cdp,
    `document.querySelector('[data-reset-category-view]')?.click()`,
  );
  await sleep(80);

  return { query, ...result, pathResult, emptyResult };
}

async function validateDesktopModal(cdp) {
  await evaluate(
    cdp,
    `document.querySelector('[data-open-category-modal]')?.click()`,
  );
  await waitForModal(cdp);
  const measurements = await evaluate(cdp, modalMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-modal-desktop.png"));

  check(
    measurements.visible,
    "Category modal did not open on desktop",
    measurements,
  );
  check(
    measurements.insideViewport,
    "Category modal exceeds the desktop viewport",
    measurements,
  );
  check(
    measurements.hasDescription,
    "Category modal has no accessible description",
    measurements,
  );
  check(
    measurements.labelledControls === 3,
    "Category modal controls are not fully labelled",
    measurements,
  );
  check(
    measurements.nameFocused,
    "Category name did not receive initial focus",
    measurements,
  );
  check(
    measurements.closeTarget >= 34,
    "Category modal close action is too small",
    measurements,
  );

  await closeModal(cdp);
  return {
    viewport: "1440x1000",
    measurements,
    screenshot: "categories-modal-desktop.png",
  };
}

async function validateCategoryMutationFailures(cdp) {
  // No persistent data is changed: intercept exactly at the browser's request boundary.
  const result = await evaluate(
    cdp,
    `(async () => {
    const originalFetch = window.fetch;
    const originalConfirm = window.confirm;
    const requests = [];
    const delay = () => new Promise((resolve) => setTimeout(resolve, 50));
    const form = document.querySelector('[data-category-form]');
    const close = () => document.querySelector('.category-dialog [data-close-category-modal]')?.click();
    const record = (button, status) => ({
      retryEnabled: Boolean(button && !button.disabled),
      errorVisible: status?.classList.contains('error') && status.textContent.includes('Falha de conexão'),
    });
    window.fetch = async (url, options = {}) => {
      if (String(url).startsWith('/api/categories')) {
        requests.push({ path: String(url), method: options.method || 'GET', body: options.body || '' });
      }
      throw new TypeError('simulated browser connection interruption');
    };
    window.confirm = () => true;
    try {
      const createChildButton = document.querySelector('[data-category-menu-action="create-child"]');
      if (!createChildButton || !form) return { missingFixture: true };
      const parentId = createChildButton.dataset.categoryId;
      createChildButton.closest('.category-action-menu').querySelector('[data-category-menu-button]').click();
      createChildButton.click();
      const createContext = {
        parentId,
        selectedParent: form.elements.parentCategoryId.value,
        kind: form.elements.kind.value,
        expectedKind: createChildButton.dataset.categoryKindValue,
      };
      form.elements.name.value = 'Teste de interrupção de criação';
      form.requestSubmit();
      await delay();
      const create = record(form.querySelector('[type="submit"]'), form.querySelector('[data-form-status]'));
      close();

      const row = createChildButton.closest('[data-category-item]');
      row.querySelector('[data-edit-category]').click();
      form.elements.name.value = 'Teste de interrupção de edição';
      form.requestSubmit();
      await delay();
      const edit = record(form.querySelector('[type="submit"]'), form.querySelector('[data-form-status]'));
      const modalStatusButton = document.querySelector('[data-category-status-action]');
      modalStatusButton.click();
      await delay();
      const modalStatus = record(modalStatusButton, form.querySelector('[data-form-status]'));
      close();

      const menuButton = row.querySelector('[data-category-menu-button]');
      document.body.click();
      menuButton.click();
      const menu = row.querySelector('[data-category-menu]');
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      const keyboardEnd = document.activeElement === menu.querySelector('[role="menuitem"]:last-child');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const keyboardEscape = menu.hidden && document.activeElement === menuButton;
      menuButton.click();

      const archiveButton = row.querySelector('[data-category-menu-action="request"][data-api-method="POST"]');
      archiveButton.click();
      await delay();
      const archive = record(archiveButton, row.querySelector('[data-form-status]'));
      const deleteButton = row.querySelector('[data-category-menu-action="request"][data-api-method="DELETE"]');
      deleteButton.click();
      await delay();
      const remove = record(deleteButton, row.querySelector('[data-form-status]'));

      return { missingFixture: false, createContext, create, edit, modalStatus, archive, remove, keyboardEnd, keyboardEscape, requests };
    } finally {
      window.fetch = originalFetch;
      window.confirm = originalConfirm;
      close();
    }
  })()`,
  );
  check(
    !result.missingFixture,
    "Category interaction fixture is missing",
    result,
  );
  if (result.missingFixture) return result;
  check(
    result.createContext.selectedParent === result.createContext.parentId &&
      result.createContext.kind === result.createContext.expectedKind,
    "Creating a child category loses its parent or kind context",
    result,
  );
  for (const action of ["create", "edit", "modalStatus", "archive", "remove"]) {
    check(
      result[action].retryEnabled && result[action].errorVisible,
      "Category " +
        action +
        " must show a recoverable network error and enable retry",
      result,
    );
  }
  check(
    result.keyboardEnd && result.keyboardEscape,
    "Category item menu keyboard focus regression",
    result,
  );
  const categoryRequests = result.requests.filter((entry) =>
    entry.path.startsWith("/api/categories"),
  );
  const methods = categoryRequests.map((entry) => entry.method);
  check(
    methods.includes("POST") &&
      methods.includes("PATCH") &&
      methods.includes("DELETE"),
    "Category create/edit/maintenance/delete requests did not reach browser fetch",
    result,
  );
  check(
    categoryRequests.some(
      (entry) =>
        entry.method === "POST" &&
        entry.path === "/api/categories" &&
        entry.body.includes(result.createContext.parentId),
    ),
    "Create-child request did not preserve parentCategoryId",
    result,
  );
  return result;
}

async function validateCategoryCrud(cdp) {
  // Real API persistence checks are limited to the disposable CI test environment.
  if (process.env.GITHUB_ACTIONS !== "true") {
    return {
      skipped: true,
      reason: "requires disposable GitHub Actions test database",
    };
  }
  const name = "Auditoria 717 " + Date.now();
  const childName = name + " filha";
  const renamedChild = name + " editada";
  const observed = [];
  const refresh = async () => {
    await sleep(750);
    await navigateWithRetry(
      cdp,
      baseUrl + "/categorias",
      "category CRUD reread",
    );
    await waitForCategories(cdp);
  };
  const find = async (label) =>
    evaluate(
      cdp,
      `(() => {
    const label = ${JSON.stringify(label)};
    const button = Array.from(document.querySelectorAll('[data-edit-category]'))
      .find((item) => item.dataset.categoryName === label);
    return button ? { id: button.dataset.categoryId, status: button.dataset.categoryStatusValue,
      parent: button.dataset.categoryParentId } : null;
  })()`,
    );
  const submit = async (expression) => {
    const action = await evaluate(cdp, expression);
    check(action, "Category CRUD UI action was unavailable", { expression });
    if (!action) return false;
    await refresh();
    return true;
  };
  let parent;
  let child;
  try {
    await submit(`(() => {
      document.querySelector('[data-open-category-modal]').click();
      const form = document.querySelector('[data-category-form]');
      form.elements.name.value = ${JSON.stringify(name)};
      form.elements.kind.value = 'expense';
      form.requestSubmit();
      return true;
    })()`);
    parent = await find(name);
    check(
      Boolean(parent && parent.status === "active"),
      "UI create did not persist a parent category",
      parent,
    );
    if (!parent) return { observed, failedAt: "create-parent" };
    observed.push("create-parent");

    await submit(`(() => {
      const id = ${JSON.stringify(parent.id)};
      const row = Array.from(document.querySelectorAll('[data-category-item]'))
        .find((item) => item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryId === id);
      const action = row?.querySelector('[data-category-menu-action="create-child"]');
      if (!action) return false;
      row.querySelector('[data-category-menu-button]').click();
      action.click();
      const form = document.querySelector('[data-category-form]');
      if (form.elements.parentCategoryId.value !== id) return false;
      form.elements.name.value = ${JSON.stringify(childName)};
      form.requestSubmit();
      return true;
    })()`);
    child = await find(childName);
    check(
      Boolean(child && child.parent === parent.id),
      "UI create-child lost the persisted parent relationship",
      child,
    );
    if (!child) return { observed, failedAt: "create-child" };
    observed.push("create-child");

    const cycle = await evaluate(
      cdp,
      `(() => {
      const id = ${JSON.stringify(parent.id)};
      const row = Array.from(document.querySelectorAll('[data-edit-category]'))
        .find((element) => element.dataset.categoryId === id);
      row?.click();
      const option = Array.from(document.querySelector('[data-category-form]').elements.parentCategoryId.options)
        .find((candidate) => candidate.value === ${JSON.stringify(child.id)});
      const protectedAgainstCycle = Boolean(option?.disabled);
      document.querySelector('.category-dialog [data-close-category-modal]')?.click();
      return protectedAgainstCycle;
    })()`,
    );
    check(cycle, "Parent edit must prohibit choosing its descendant", {
      parent,
      child,
    });
    observed.push("cycle-guard");

    await submit(`(() => {
      const id = ${JSON.stringify(child.id)};
      const row = Array.from(document.querySelectorAll('[data-edit-category]'))
        .find((element) => element.dataset.categoryId === id);
      if (!row) return false;
      row.click();
      const form = document.querySelector('[data-category-form]');
      form.elements.name.value = ${JSON.stringify(renamedChild)};
      form.requestSubmit();
      return true;
    })()`);
    child = await find(renamedChild);
    check(
      Boolean(child && child.parent === parent.id),
      "UI edit did not persist the child category",
      child,
    );
    if (!child) return { observed, failedAt: "edit-child" };
    observed.push("edit-child");

    const mutateStatus = async (suffix) =>
      submit(`(() => {
      const id = ${JSON.stringify(child.id)};
      const suffix = ${JSON.stringify(suffix)};
      const row = Array.from(document.querySelectorAll('[data-category-item]'))
        .find((item) => item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryId === id);
      const button = Array.from(row?.querySelectorAll('[data-category-menu-action="request"]') || [])
        .find((item) => item.dataset.apiPath.endsWith('/' + suffix));
      if (!button) return false;
      window.confirm = () => true;
      row.querySelector('[data-category-menu-button]').click();
      button.click();
      return true;
    })()`);
    await mutateStatus("archive");
    check(
      (await find(renamedChild))?.status === "archived",
      "UI archive did not persist",
      child,
    );
    observed.push("archive");
    await mutateStatus("restore");
    check(
      (await find(renamedChild))?.status === "active",
      "UI restore did not persist",
      child,
    );
    observed.push("restore");

    const removeById = async (id) =>
      submit(`(() => {
      const id = ${JSON.stringify(id)};
      const row = Array.from(document.querySelectorAll('[data-category-item]'))
        .find((item) => item.querySelector(':scope > .category-node-row [data-edit-category]')?.dataset.categoryId === id);
      const button = row?.querySelector('[data-category-menu-action="request"][data-api-method="DELETE"]');
      if (!button) return false;
      window.confirm = () => true;
      row.querySelector('[data-category-menu-button]').click();
      button.click();
      return true;
    })()`);
    await removeById(child.id);
    check(
      !(await find(renamedChild)),
      "UI delete child did not remove the category",
      child,
    );
    observed.push("delete-child");
    await removeById(parent.id);
    check(
      !(await find(name)),
      "UI delete parent did not remove the category",
      parent,
    );
    observed.push("delete-parent");
    return { skipped: false, observed, parentId: parent.id, childId: child.id };
  } finally {
    await evaluate(cdp, "window.confirm = () => true");
    // CI uses a disposable profile. Any failed case is isolated to that profile.
  }
}

async function validateSidebarThemeParity(cdp) {
  const readTheme = async (route) => {
    await navigateWithRetry(cdp, baseUrl + route, "sidebar " + route);
    return evaluate(
      cdp,
      `(() => {
      const sidebar = document.querySelector('.sidebar');
      const link = sidebar?.querySelector('nav a:not([aria-current="page"])');
      if (!sidebar || !link) return null;
      const style = getComputedStyle(sidebar);
      return {
        background: style.backgroundColor,
        foreground: style.color,
        border: style.borderRightColor,
        link: getComputedStyle(link).color,
      };
    })()`,
    );
  };
  const categories = await readTheme("/categorias");
  const statement = await readTheme("/lancamentos");
  const dashboard = await readTheme("/dashboard");
  check(
    categories && statement && dashboard,
    "Missing shared sidebar on authenticated route",
    {
      categories,
      statement,
      dashboard,
    },
  );
  check(
    categories &&
      JSON.stringify(categories) === JSON.stringify(statement) &&
      JSON.stringify(categories) === JSON.stringify(dashboard),
    "Sidebar theme differs between Categories, Golden Screen and Dashboard",
    { categories, statement, dashboard },
  );
  await navigateWithRetry(
    cdp,
    baseUrl + "/categorias",
    "categories after sidebar check",
  );
  await waitForCategories(cdp);
  return { categories, statement, dashboard };
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
  return {
    viewport: "390x844",
    measurements,
    screenshot: "categories-mobile.png",
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
  check(
    measurements.minimumRowHeight >= 44,
    "Narrow mobile row is too small",
    measurements,
  );
  check(
    measurements.search.height >= 44,
    "Narrow mobile search input is too small",
    measurements,
  );
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
  return {
    viewport: "320x740",
    measurements,
    screenshot: "categories-compact-mobile.png",
  };
}

async function validateMobileModal(cdp) {
  await evaluate(
    cdp,
    `document.querySelector('[data-open-category-modal]')?.click()`,
  );
  await waitForModal(cdp);
  const measurements = await evaluate(cdp, modalMeasurementExpression());
  await screenshot(cdp, join(outputDir, "categories-modal-mobile.png"));

  check(
    measurements.visible,
    "Category modal did not open on mobile",
    measurements,
  );
  check(
    measurements.insideViewport,
    "Category modal exceeds the mobile viewport",
    measurements,
  );
  check(
    measurements.singleColumn,
    "Category modal is not single-column on mobile",
    measurements,
  );
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
        console.warn(
          `Navigation to ${label} reached the page despite a missing load event.`,
        );
        return;
      }

      if (attempt === attempts) throw error;
      console.warn(
        `Navigation to ${label} failed on attempt ${attempt}; retrying.`,
      );
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
  return `# Evidência visual — Categorias\n\n- Status: **${status}**\n- Commit: \`${report.commit}\`\n- Navegador: ${report.browser}\n- Desktop: \`${screenshot(report.desktop)}\`\n- Modal desktop: \`${screenshot(report.desktopModal)}\`\n- Mobile: \`${screenshot(report.mobile)}\`\n- Modal mobile: \`${screenshot(report.mobileModal)}\`\n- Mobile estreito: \`${screenshot(report.compactMobile)}\`\n\n## Falhas\n\n${report.failures.length === 0 ? "Nenhuma falha encontrada.\n" : report.failures.map((failure) => `- ${failure.message}`).join("\n") + "\n"}`;
}
