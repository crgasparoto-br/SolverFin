import process from "node:process";
import { evaluate, sleep } from "./cdp.mjs";
import { state } from "./categories-visual-state.mjs";
const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const check = (...args) => state.check(...args);
const waitForCategories = (...args) => state.waitForCategories(...args);
const navigateWithRetry = (...args) => state.navigateWithRetry(...args);

export async function validateCategoryMutationFailures(cdp) {
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
  check(!result.missingFixture, "Category interaction fixture is missing", result);
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
      "Category " + action + " must show a recoverable network error and enable retry",
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
    methods.includes("POST") && methods.includes("PATCH") && methods.includes("DELETE"),
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

export async function validateCategoryCrud(cdp) {
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
    await navigateWithRetry(cdp, baseUrl + "/categorias", "category CRUD reread");
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
    check((await find(renamedChild))?.status === "archived", "UI archive did not persist", child);
    observed.push("archive");
    await mutateStatus("restore");
    check((await find(renamedChild))?.status === "active", "UI restore did not persist", child);
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
    check(!(await find(renamedChild)), "UI delete child did not remove the category", child);
    observed.push("delete-child");
    await removeById(parent.id);
    check(!(await find(name)), "UI delete parent did not remove the category", parent);
    observed.push("delete-parent");
    return { skipped: false, observed, parentId: parent.id, childId: child.id };
  } finally {
    await evaluate(cdp, "window.confirm = () => true");
    // CI uses a disposable profile. Any failed case is isolated to that profile.
  }
}

export async function validateSidebarThemeParity(cdp) {
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
  check(categories && statement && dashboard, "Missing shared sidebar on authenticated route", {
    categories,
    statement,
    dashboard,
  });
  check(
    categories &&
      JSON.stringify(categories) === JSON.stringify(statement) &&
      JSON.stringify(categories) === JSON.stringify(dashboard),
    "Sidebar theme differs between Categories, Golden Screen and Dashboard",
    { categories, statement, dashboard },
  );
  await navigateWithRetry(cdp, baseUrl + "/categorias", "categories after sidebar check");
  await waitForCategories(cdp);
  return { categories, statement, dashboard };
}
