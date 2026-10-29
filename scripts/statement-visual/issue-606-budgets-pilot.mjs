import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
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
    currencies: Array.from(document.querySelectorAll('select[name="currency"] option')).map((option) => option.value),
    focused: Array.from(document.querySelectorAll('.budget-focus-item .budget-currency')).map((node) => node.textContent?.trim()),
  }))()`,
  );
  assert.ok(mixed.rows >= 10, "Budget long-list scenario must include ten or more rows");
  assert.ok(mixed.currencies.includes("BRL") && mixed.currencies.includes("USD"));
  assert.ok(mixed.focused.includes("BRL") && mixed.focused.includes("USD"));
  await screenshot(browser.cdp, join(outputDir, "issue-725-budgets-two-currencies-desktop.png"));

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

function measurementExpression() {
  return `(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const essential = Array.from(document.querySelectorAll('main a, main button, main input, main select')).filter(visible);
    const essentialOutsideViewport = essential
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right < -1 || rect.left > viewportWidth + 1;
      })
      .map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);
    const focus = document.querySelector('.budget-focus');
    const details = document.querySelector('.budget-results');
    const auxiliary = document.querySelector('.budget-inventory');
    const hierarchyValid = Boolean(details && auxiliary && (details.compareDocumentPosition(auxiliary) & Node.DOCUMENT_POSITION_FOLLOWING) && (!focus || (focus.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING)));
    const decisionLabelsVisible = !focus || ['Planejado', 'Realizado', 'Disponível'].every((label) => Array.from(focus.querySelectorAll('dt')).some((term) => term.textContent?.trim() === label));
    const financialNodes = Array.from(document.querySelectorAll('main .sf-money, main .budget-currency'));
    const moneyNodes = Array.from(document.querySelectorAll('.budget-focus .sf-money, .budget-results .sf-money'));
    const trailingCurrencyCodesAbsent = moneyNodes.every(node =>
      !node.querySelector('.sf-money-currency') && !/\s[A-Z]{3}$/.test(node.textContent?.trim() ?? ''));
    const tableMoneyUnbroken = Array.from(
      document.querySelectorAll('.budget-results .sf-table .sf-money-value'),
    ).every((node) => getComputedStyle(node).whiteSpace === 'nowrap');
    const mobileFilterCollapsed = !document.querySelector('[data-budget-mobile-filters]')?.open;
    const financialLabelsLegible = financialNodes.every((node) => {
      const style = getComputedStyle(node);
      return !(['hidden', 'clip'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1);
    });
    return {
      hierarchyValid,
      decisionLabelsVisible,
      financialLabelsLegible,
      tableMoneyUnbroken,
      trailingCurrencyCodesAbsent,
      mobileFilterCollapsed,
      pathname: location.pathname,
      viewportWidth,
      documentFits: document.documentElement.scrollWidth <= viewportWidth + 1,
      hasMain: Boolean(document.querySelector('main')),
      hasHeading: Array.from(document.querySelectorAll('h1, main h2')).some(visible),
      essentialOutsideViewport,
    };
  })()`;
}

function negativeControlExpression() {
  return `(() => {
    const probe = () => ${measurementExpression()};
    const inventory = document.querySelector('.budget-inventory');
    const details = document.querySelector('.budget-results');
    if (!inventory || !details) return { error: 'Missing budget sections' };
    const marker = document.createComment('restore-inventory-position');
    inventory.before(marker);
    details.before(inventory);
    const hierarchyRejected = probe().hierarchyValid === false;
    marker.replaceWith(inventory);
    const hierarchyRestored = probe().hierarchyValid === true;

    const money = document.querySelector('.budget-focus .sf-money') ||
      document.querySelector('.budget-results .sf-money');
    if (!money) return { error: 'No rendered financial value to test' };
    const originalStyle = money.getAttribute('style');
    money.style.setProperty('width', '1px', 'important');
    money.style.setProperty('overflow-x', 'hidden', 'important');
    money.style.setProperty('white-space', 'nowrap', 'important');
    money.style.setProperty('display', 'block', 'important');
    const clippedValueRejected = probe().financialLabelsLegible === false;
    if (originalStyle === null) money.removeAttribute('style');
    else money.setAttribute('style', originalStyle);
    const clippedValueRestored = probe().financialLabelsLegible === true;
    const bogusCode = document.createElement('small');
    bogusCode.className = 'sf-money-currency';
    bogusCode.textContent = money.dataset.currency;
    money.append(bogusCode);
    const tableNumber = document.querySelector('.budget-results .sf-table .sf-money-value');
    if (!tableNumber) return { error: 'No table financial value to test' };
    const originalTableStyle = tableNumber.getAttribute('style');
    tableNumber.style.setProperty('white-space', 'normal', 'important');
    tableNumber.style.setProperty('overflow-wrap', 'anywhere', 'important');
    const brokenNumberRejected = probe().tableMoneyUnbroken === false;
    if (originalTableStyle === null) tableNumber.removeAttribute('style');
    else tableNumber.setAttribute('style', originalTableStyle);
    const brokenNumberRestored = probe().tableMoneyUnbroken === true;
    const trailingCodeRejected = probe().trailingCurrencyCodesAbsent === false;
    bogusCode.remove();
    const trailingCodeRestored = probe().trailingCurrencyCodesAbsent === true;
    return { hierarchyRejected, hierarchyRestored, clippedValueRejected, clippedValueRestored,
      brokenNumberRejected, brokenNumberRestored, trailingCodeRejected, trailingCodeRestored };
  })()`;
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
