import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import {
  measurementExpression,
  negativeControlExpression,
} from "./issue-725-budget-measurements.mjs";
import { checkBudgetMenuPrefillPeriod } from "./issue-725-budget-menu-checks.mjs";
import {
  checkBudgetDialogCancellation,
  checkBudgetGoldenDialogs,
} from "./issue-725-budget-golden-dialogs.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
if (!chromePath) throw new Error("CHROME_BIN is required for issue 606 budgets pilot validation.");

await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  scenarios: [],
};

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);

  for (const viewport of [
    { width: 1440, height: 900, name: "wide-desktop" },
    { width: 1366, height: 768, name: "desktop" },
    { width: 390, height: 844, name: "mobile" },
    { width: 320, height: 740, name: "compact-mobile" },
  ]) {
    await setViewport(browser.cdp, viewport.width, viewport.height);
    await navigate(browser.cdp, `${baseUrl}/orcamentos`);
    await sleep(350);
    const measurements = await evaluate(browser.cdp, measurementExpression());
    assert.equal(measurements.pathname, "/orcamentos");
    assert.equal(measurements.hasMain, true, `Budgets has no main landmark at ${viewport.name}`);
    assert.equal(
      measurements.hasHeading,
      true,
      `Budgets has no visible heading at ${viewport.name}`,
    );
    assert.equal(
      measurements.documentFits,
      true,
      `Budgets overflows horizontally at ${viewport.name}`,
    );
    assert.equal(
      measurements.essentialOutsideViewport.length,
      0,
      `Budgets has essential controls outside viewport at ${viewport.name}`,
    );
    assert.equal(
      measurements.hierarchyValid,
      true,
      `Budget financial hierarchy differs at ${viewport.name}`,
    );
    assert.equal(
      measurements.decisionLabelsVisible,
      true,
      `Budget decision labels missing at ${viewport.name}`,
    );
    assert.equal(
      measurements.financialLabelsLegible,
      true,
      `Budget financial text is clipped at ${viewport.name}`,
    );
    assert.equal(
      measurements.tableMoneyUnbroken,
      true,
      `Budget table splits a monetary number at ${viewport.name}`,
    );
    assert.equal(
      measurements.trailingCurrencyCodesAbsent,
      true,
      `Budget repeats the explicit currency code after an amount at ${viewport.name}`,
    );
    if (viewport.width <= 560) {
      assert.equal(
        measurements.mobileFilterCollapsed,
        true,
        "Unused mobile filters must be progressive",
      );
    }
    const buttonGeometry = await evaluate(
      browser.cdp,
      `(() => {
        const panel = document.querySelector('[data-budget-mobile-filters]');
        const wasOpen = panel?.open;
        if (panel) panel.open = true;
        const apply = document.querySelector('.budget-filter-actions button[type="submit"]')?.getBoundingClientRect();
        const clear = document.querySelector('.budget-filter-actions a')?.getBoundingClientRect();
        const aligned = Boolean(apply && clear && apply.height > 0 && clear.height > 0 &&
          Math.abs(apply.height - clear.height) <= 1 &&
          Math.abs(apply.width - clear.width) <= 1);
        if (panel) panel.open = wasOpen;
        return aligned;
      })()`,
    );
    assert.equal(
      buttonGeometry,
      true,
      `Budget filter Apply/Clear dimensions mismatch at ${viewport.name}`,
    );
    const screenshotName = `issue-606-budgets-${viewport.name}.png`;
    await screenshot(browser.cdp, join(outputDir, screenshotName));
    if (viewport.name === "desktop") {
      const controls = await evaluate(browser.cdp, negativeControlExpression());
      assert.deepEqual(controls, {
        hierarchyRejected: true,
        hierarchyRestored: true,
        clippedValueRejected: true,
        clippedValueRestored: true,
        brokenNumberRejected: true,
        brokenNumberRestored: true,
        trailingCodeRejected: true,
        trailingCodeRestored: true,
      });
      report.negativeControls = controls;
    }
    report.scenarios.push({
      route: "/orcamentos",
      state: "normal",
      viewport: `${viewport.width}x${viewport.height}`,
      screenshot: screenshotName,
      measurements: {
        ...measurements,
        contentViewportWidth: measurements.viewportWidth,
        viewportWidth: viewport.width,
      },
    });
  }

  // This fixture modifies only the disposable Chrome CI database, never production data.
  const fixture = await evaluate(browser.cdp, budgetAcceptanceFixtureExpression());
  assert.equal(fixture.ok, true, `Budget fixture failed: ${JSON.stringify(fixture)}`);

  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/orcamentos`);
  await sleep(350);
  const mixed = await evaluate(
    browser.cdp,
    `(() => ({
    rows: document.querySelectorAll('.budget-results tbody tr').length,
    historyCount: document.querySelectorAll('.budget-results .budget-history-entry').length,
    uniqueCategories: (() => {
      const keys = Array.from(document.querySelectorAll('.budget-results tbody tr')).map((row) =>
        [row.querySelector('[data-column="category"]')?.textContent?.trim(), row.querySelector('[data-column="currency"]')?.textContent?.trim()].join('|'));
      return new Set(keys).size === keys.length;
    })(),
    currencies: Array.from(document.querySelectorAll('select[name="currency"] option')).map((option) => option.value),
    focused: Array.from(document.querySelectorAll('.budget-focus-item .budget-currency')).map((node) => node.textContent?.trim()),
  }))()`,
  );
  assert.ok(
    mixed.rows + mixed.historyCount >= 10,
    "Budget long-list scenario must preserve ten or more period records",
  );
  assert.equal(
    mixed.uniqueCategories,
    true,
    "Budget detail must have only one main row per category and currency",
  );
  assert.ok(mixed.currencies.includes("BRL") && mixed.currencies.includes("USD"));
  assert.ok(mixed.focused.includes("BRL") && mixed.focused.includes("USD"));
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-two-currencies-desktop.png"));

  const iconFirstTable = await evaluate(
    browser.cdp,
    `(() => Array.from(document.querySelectorAll('.budget-results td[data-column="category"] .budget-category'))
      .every((category) => category.firstElementChild?.classList.contains('budget-state') &&
        category.children[1]?.classList.contains('budget-category-tree') &&
        Boolean(category.children[1]?.querySelector('strong'))))()`,
  );
  assert.equal(iconFirstTable, true, "Budget category must begin with the situation icon");

  const menuResults = await checkBudgetMenuPrefillPeriod(browser.cdp, baseUrl, outputDir);
  report.menuLayering = menuResults.menuLayering;
  report.categoryPrefill = menuResults.categoryPrefill;
  report.selectedPeriod = menuResults.selectedPeriod;

  await navigate(browser.cdp, `${baseUrl}/orcamentos`);
  await sleep(200);

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
  await sleep(350);
  const filtered = await evaluate(
    browser.cdp,
    `(() => ({
    currency: document.querySelector('select[name="currency"]')?.value,
    status: document.querySelector('select[name="status"]')?.value,
    focused: Array.from(document.querySelectorAll('.budget-focus-item .budget-currency')).map((node) => node.textContent?.trim()),
    documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    activeFiltersExpanded: document.querySelector('[data-budget-mobile-filters]')?.open,
  }))()`,
  );
  assert.equal(filtered.currency, "USD");
  assert.equal(filtered.status, "active");
  assert.ok(filtered.focused.includes("USD") && !filtered.focused.includes("BRL"));
  assert.equal(filtered.documentFits, true);
  assert.equal(filtered.activeFiltersExpanded, true);
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-filter-usd-mobile.png"));

  await setViewport(browser.cdp, 320, 740);
  await navigate(browser.cdp, `${baseUrl}/orcamentos?currency=EUR&status=active`);
  await sleep(350);
  const empty = await evaluate(
    browser.cdp,
    `(() => ({
    currency: document.querySelector('select[name="currency"]')?.value,
    message: (document.querySelector('main')?.textContent ?? '').includes('Nenhum resultado com estes filtros'),
    focusCount: document.querySelectorAll('.budget-focus-item').length,
    documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    activeFiltersExpanded: document.querySelector('[data-budget-mobile-filters]')?.open,
  }))()`,
  );
  assert.deepEqual(empty, {
    currency: "EUR",
    message: true,
    focusCount: 0,
    documentFits: true,
    activeFiltersExpanded: true,
  });
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-filter-empty-compact.png"));

  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
  await sleep(350);
  const dialogs = await checkBudgetDialogCancellation(browser.cdp);
  report.goldenDialogs = await checkBudgetGoldenDialogs(browser.cdp, baseUrl, outputDir);
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
  // Exercise the actual form submit handlers and persisted data, not just dialog presence.
  const creation = await evaluate(
    browser.cdp,
    `(() => {
    const trigger = document.querySelector('[data-sf-dialog-open="new-budget-dialog"]');
    trigger?.click();
    const dialog = document.getElementById('new-budget-dialog');
    const form = dialog?.querySelector('form[data-api-path="/api/budgets"]');
    if (!dialog?.open || !form) return { submitted: false, reason: 'create-dialog-missing' };
    const field = (name) => form.elements.namedItem(name);
    const categorySelect = field('categoryId');
    if (categorySelect && !categorySelect.value) {
      const firstExpense = Array.from(categorySelect.options).find((option) => option.value && !option.disabled);
      if (firstExpense) categorySelect.value = firstExpense.value;
    }
    const categoryId = categorySelect?.value;
    if (!categoryId) return { submitted: false, reason: 'expense-category-missing' };
    field('periodStartOn').value = '2032-05-01';
    field('periodEndOn').value = '2032-05-31';
    field('currency').value = 'USD';
    field('currency').dispatchEvent(new Event('change', { bubbles: true }));
    field('plannedAmountMinor').value = '1234,56';
    const valid = form.checkValidity();
    if (valid) form.requestSubmit();
    return { submitted: valid, categoryId, dialogOpened: true };
  })()`,
  );
  assert.equal(
    creation.submitted,
    true,
    `Create budget form was invalid: ${JSON.stringify(creation)}`,
  );
  const created = await waitForBudget(browser.cdp, {
    categoryId: creation.categoryId,
    periodStartOn: "2032-05-01",
    plannedAmountMinor: 123456,
  });
  assert.equal(created.currency, "USD");
  await sleep(350);
  await navigate(browser.cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
  const createdRow = await evaluate(
    browser.cdp,
    `(() => {
    const row = Array.from(document.querySelectorAll('.budget-results tr[data-row-key]'))
      .find((item) => item.getAttribute('data-row-key') === '${created.id}');
    return { present: Boolean(row), currency: row?.querySelector('[data-column="currency"]')?.textContent?.trim(),
      planned: row?.querySelector('[data-column="planned"]')?.textContent?.trim() };
  })()`,
  );
  assert.equal(createdRow.present, true, "New budget is absent after a fresh SSR reload");
  assert.equal(createdRow.currency, "USD");
  assert.match(createdRow.planned, /1\.234,56/);
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-created-desktop.png"));

  const edit = await evaluate(
    browser.cdp,
    `(() => {
    const row = document.querySelector('.budget-results tr[data-row-key="${created.id}"]');
    const menuButton = row?.querySelector('[data-budget-menu-trigger]');
    menuButton?.click();
    const trigger = row?.querySelector('[data-budget-menu-popover]:not([hidden]) [data-sf-dialog-open="edit-budget-dialog-${created.id}"]');
    trigger?.click();
    const dialog = document.getElementById('edit-budget-dialog-${created.id}');
    const form = dialog?.querySelector('form[data-api-method="PATCH"]');
    if (!dialog?.open || !form) return { submitted: false, reason: 'edit-dialog-missing' };
    form.elements.namedItem('plannedAmountMinor').value = '2345,67';
    const valid = form.checkValidity();
    if (valid) form.requestSubmit();
    return { submitted: valid, dialogOpened: true };
  })()`,
  );
  assert.equal(edit.submitted, true, `Edit budget form was invalid: ${JSON.stringify(edit)}`);
  const edited = await waitForBudget(browser.cdp, {
    id: created.id,
    plannedAmountMinor: 234567,
  });
  assert.equal(edited.id, created.id, "Editing must update the existing budget, not duplicate it");
  await sleep(350);
  await navigate(browser.cdp, `${baseUrl}/orcamentos?currency=USD&status=active`);
  const editedRow = await evaluate(
    browser.cdp,
    `(() => {
    const row = Array.from(document.querySelectorAll('.budget-results tr[data-row-key]'))
      .find((item) => item.getAttribute('data-row-key') === '${created.id}');
    return { present: Boolean(row), planned: row?.querySelector('[data-column="planned"]')?.textContent?.trim(),
      currency: row?.querySelector('[data-column="currency"]')?.textContent?.trim() };
  })()`,
  );
  assert.equal(editedRow.present, true, "Edited budget disappeared on reload");
  assert.equal(editedRow.currency, "USD");
  assert.match(editedRow.planned, /2\.345,67/);
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-edited-desktop.png"));

  // A rejected update must remain in the edit dialog with a retry opportunity and no mutation.
  const invalid = await evaluate(
    browser.cdp,
    `(() => {
    const row = document.querySelector('.budget-results tr[data-row-key="${created.id}"]');
    const menuButton = row?.querySelector('[data-budget-menu-trigger]');
    menuButton?.click();
    const trigger = row?.querySelector('[data-budget-menu-popover]:not([hidden]) [data-sf-dialog-open="edit-budget-dialog-${created.id}"]');
    trigger?.click();
    const dialog = document.getElementById('edit-budget-dialog-${created.id}');
    const form = dialog?.querySelector('form[data-api-method="PATCH"]');
    if (!dialog?.open || !form) return { submitted: false };
    form.elements.namedItem('periodEndOn').value = '2032-04-30';
    const valid = form.checkValidity();
    if (valid) form.requestSubmit();
    return { submitted: valid };
  })()`,
  );
  assert.equal(invalid.submitted, true, "Invalid period did not reach the API");
  const rejection = await waitForBrowserState(
    browser.cdp,
    `(() => {
    const dialog = document.getElementById('edit-budget-dialog-${created.id}');
    const status = dialog?.querySelector('.form-status.error');
    const button = dialog?.querySelector('button[type="submit"]');
    if (!status?.textContent?.trim() || button?.disabled || !dialog?.open) return null;
    return { errorVisible: true, buttonEnabled: true, dialogOpen: true,
      retainedValue: dialog.querySelector('[name="plannedAmountMinor"]')?.value,
      url: location.search };
  })()`,
  );
  assert.equal(rejection.retainedValue, "2.345,67");
  assert.equal(rejection.url, "?currency=USD&status=active");
  const unchanged = await readBudget(browser.cdp, created.id);
  assert.equal(unchanged.plannedAmountMinor, 234567, "Rejected update changed persisted amount");
  assert.equal(unchanged.periodEndOn, "2032-05-31", "Rejected update changed persisted period");
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-error-retry-desktop.png"));
  report.issue725Acceptance = {
    fixtureCurrency: fixture.currency,
    mixed,
    filtered,
    empty,
    dialogs,
    creation: { categoryId: creation.categoryId, id: created.id, persisted: createdRow },
    editing: { id: edited.id, persisted: editedRow },
    rejection,
  };

  await writeFile(
    join(outputDir, "issue-606-budgets-pilot.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log("Issue 606 budgets desktop and mobile baseline validation passed.");
} finally {
  await browser.close(outputDir);
}

function budgetAcceptanceFixtureExpression() {
  return `(async () => {
    const categoriesResponse = await fetch('/api/categories?status=all', { credentials: 'same-origin' });
    if (!categoriesResponse.ok) {
      return { ok: false, stage: 'categories', status: categoriesResponse.status };
    }
    const categories = (await categoriesResponse.json()).categories ?? [];
    const category = categories.find((item) => item.kind === 'expense' && item.status === 'active');
    if (!category?.id) return { ok: false, stage: 'expense-category' };
    const response = await fetch('/api/budgets', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: category.id,
        periodStartOn: '2028-04-01',
        periodEndOn: '2028-04-30',
        currency: 'USD',
        plannedAmountMinor: 500000,
      }),
    });
    return { ok: response.ok, status: response.status, currency: 'USD' };
  })()`;
}

async function readBudget(cdp, id) {
  return evaluate(
    cdp,
    `(async () => {
    const response = await fetch('/api/budgets?status=all', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Budget readback failed: ' + response.status);
    const body = await response.json();
    return (body.budgets ?? []).find((budget) => budget.id === ${JSON.stringify(id)}) ?? null;
  })()`,
  );
}

async function waitForBudget(cdp, expected) {
  return waitForBrowserState(
    cdp,
    `(async () => {
    const response = await fetch('/api/budgets?status=all', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Budget readback failed: ' + response.status);
    const body = await response.json();
    return (body.budgets ?? []).find((budget) => {
      return ${JSON.stringify(expected.id ?? null)} !== null
        ? budget.id === ${JSON.stringify(expected.id ?? null)} && budget.plannedAmountMinor === ${expected.plannedAmountMinor}
        : budget.categoryId === ${JSON.stringify(expected.categoryId ?? null)} && budget.periodStartOn === ${JSON.stringify(expected.periodStartOn ?? null)} && budget.plannedAmountMinor === ${expected.plannedAmountMinor};
    }) ?? null;
  })()`,
  );
}

async function waitForBrowserState(cdp, expression) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await evaluate(cdp, expression);
    if (state) return state;
    await sleep(250);
  }
  throw new Error("Budget browser operation did not reach the expected observable state");
}
