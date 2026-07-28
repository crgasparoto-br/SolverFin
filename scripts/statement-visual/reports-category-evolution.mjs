import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const screenshots = [];
let browserVersion = "unknown";

if (!chromePath) throw new Error("CHROME_BIN is required for reports visual validation.");
await mkdir(outputDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  desktop: null,
  mobile: null,
  empty: null,
  filterError: null,
  failures,
  screenshots,
};

let browser;
try {
  browser = await launchChrome({ baseUrl, chromePath });
  browserVersion = browser.version;
  report.browser = browserVersion;
  await login(browser.cdp);
  const seeded = await seedReportData(browser.cdp);
  report.desktop = await validateReadyDesktop(browser.cdp, seeded.month);
  report.mobile = await validateReadyMobile(browser.cdp, seeded.month);
  report.empty = await validateEmptyState(browser.cdp);
  report.filterError = await validateFilterError(browser.cdp);
} catch (error) {
  failures.push({ message: "Reports visual validation crashed", details: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "reports-category-evolution.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  join(outputDir, "REPORTS-CATEGORY-EVOLUTION.md"),
  renderMarkdown(report),
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Reports category evolution desktop, mobile, empty and error validation passed.");
}

async function login(cdp) {
  await setViewport(cdp, 1440, 900);
  await navigateWithRetry(cdp, `${baseUrl}/login`, "login");
  const result = await evaluate(cdp, loginExpression());
  assert.equal(result.ok, true, `Demo login failed: ${result.status} ${result.body}`);
}

async function seedReportData(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const run = async () => {
        const request = async (path, options = {}) => {
          const response = await fetch(path, {
            credentials: 'same-origin',
            ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) },
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(path + ' -> ' + response.status + ' ' + JSON.stringify(body));
          return body;
        };
        const suffix = Date.now().toString(36);
        const accountsBody = await request('/api/accounts');
        let account = accountsBody.accounts?.find((item) => item.status === 'active');
        if (!account) {
          account = (await request('/api/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'Conta relatório visual ' + suffix, kind: 'checking', openingBalanceMinor: 0 }),
          })).account;
        }
        const incomeCategory = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Receita visual ' + suffix, kind: 'income' }),
        })).category;
        const expenseCategory = (await request('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: 'Despesa visual ' + suffix, kind: 'expense' }),
        })).category;
        const occurredOn = new Date().toISOString().slice(0, 10);
        const createTransaction = (payload) => request('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            status: 'posted',
            occurredOn,
            plannedOn: occurredOn,
            accountId: account.id,
            ...payload,
          }),
        });
        await createTransaction({
          kind: 'income',
          categoryId: incomeCategory.id,
          amountMinor: 250000,
          description: 'Receita visual ' + suffix,
        });
        await createTransaction({
          kind: 'expense',
          categoryId: expenseCategory.id,
          amountMinor: 87500,
          description: 'Despesa visual ' + suffix,
        });
        return { month: occurredOn.slice(0, 7), incomeCategory: incomeCategory.name, expenseCategory: expenseCategory.name };
      };
      return run();
    })()`,
  );
}

async function validateReadyDesktop(cdp, month) {
  await setViewport(cdp, 1440, 900);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=1`,
    "reports desktop",
  );
  await waitForState(cdp, "ready");
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "reports-category-evolution-desktop.png"));
  screenshots.push("reports-category-evolution-desktop.png");

  check(measurements.state === "ready", "Reports desktop did not render the ready state", measurements);
  check(measurements.tableCount >= 1, "Reports desktop rendered no semantic table", measurements);
  check(measurements.columnHeaders >= 4, "Reports desktop has incomplete column headers", measurements);
  check(measurements.rowHeaders >= 3, "Reports desktop has incomplete row headers", measurements);
  check(measurements.headerSticky, "Reports desktop header is not sticky", measurements);
  check(measurements.descriptionSticky, "Reports desktop description column is not sticky", measurements);
  check(measurements.scrollerTabIndex === 0, "Reports matrix is not keyboard focusable", measurements);
  check(measurements.pageFitsViewport, "Reports desktop leaks horizontal overflow", measurements);
  return { viewport: "1440x900", measurements, screenshot: screenshots.at(-1) };
}

async function validateReadyMobile(cdp, month) {
  await setViewport(cdp, 390, 844);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=12`,
    "reports mobile",
  );
  await waitForState(cdp, "ready");
  await evaluate(cdp, `document.querySelector('.evolution-table-scroll')?.focus()`);
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "reports-category-evolution-mobile.png"));
  screenshots.push("reports-category-evolution-mobile.png");

  check(measurements.viewportWidth === 390, "Reports mobile viewport is not 390px", measurements);
  check(measurements.pageFitsViewport, "Reports mobile page has horizontal overflow", measurements);
  check(measurements.tableScrollable, "Reports mobile matrix is not horizontally scrollable", measurements);
  check(measurements.scrollerFocused, "Reports mobile matrix did not accept keyboard focus", measurements);
  check(measurements.filterColumns === 1, "Reports mobile filters are not stacked", measurements);
  return { viewport: "390x844", measurements, screenshot: screenshots.at(-1) };
}

async function validateEmptyState(cdp) {
  await setViewport(cdp, 1024, 700);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=2099-01&periods=1`,
    "reports empty",
  );
  await waitForState(cdp, "empty");
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "reports-category-evolution-empty.png"));
  screenshots.push("reports-category-evolution-empty.png");

  check(measurements.state === "empty", "Reports empty state was not rendered", measurements);
  check(measurements.rowHeaders >= 3, "Reports empty state lost its principal rows", measurements);
  check(measurements.hasAccessiblePeriod, "Reports empty state lost accessible period labels", measurements);
  check(!measurements.hasCurrencySymbol, "Reports empty state invented a currency", measurements);
  return { viewport: "1024x700", measurements, screenshot: screenshots.at(-1) };
}

async function validateFilterError(cdp) {
  await setViewport(cdp, 1024, 700);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=quarterly&start=2026-13&periods=abc`,
    "reports filter error",
  );
  await waitForState(cdp, "filter-error");
  const measurements = await evaluate(cdp, measurementExpression());
  await screenshot(cdp, join(outputDir, "reports-category-evolution-filter-error.png"));
  screenshots.push("reports-category-evolution-filter-error.png");

  check(measurements.intervalValue === "quarterly", "Invalid interval was not preserved", measurements);
  check(measurements.startValue === "2026-13", "Invalid start was not preserved", measurements);
  check(measurements.periodsValue === "abc", "Invalid periods were not preserved", measurements);
  check(measurements.invalidControls >= 3, "Invalid controls are not identified accessibly", measurements);
  return { viewport: "1024x700", measurements, screenshot: screenshots.at(-1) };
}

function measurementExpression() {
  return `(() => {
    const scroller = document.querySelector('.evolution-table-scroll');
    const table = document.querySelector('.evolution-table');
    const form = document.querySelector('.evolution-filters');
    const style = form ? getComputedStyle(form) : null;
    const text = document.body.textContent || '';
    return {
      state: document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || '',
      viewportWidth: window.innerWidth,
      pageFitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
      tableCount: document.querySelectorAll('table.evolution-table').length,
      columnHeaders: table?.querySelectorAll('th[scope="col"]').length || 0,
      rowHeaders: table?.querySelectorAll('th[scope="row"]').length || 0,
      headerSticky: getComputedStyle(table?.querySelector('thead th') || document.body).position === 'sticky',
      descriptionSticky: getComputedStyle(table?.querySelector('.sticky-description') || document.body).position === 'sticky',
      scrollerTabIndex: scroller?.tabIndex ?? -1,
      scrollerFocused: document.activeElement === scroller,
      tableScrollable: Boolean(scroller && scroller.scrollWidth > scroller.clientWidth + 1),
      filterColumns: style ? style.gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      hasAccessiblePeriod: Boolean(table?.querySelector('th[scope="col"] .sr-only')),
      hasCurrencySymbol: /R\\$|US\\$|€|£/.test(text),
      intervalValue: document.querySelector('input[name="interval"]')?.value || '',
      startValue: document.querySelector('input[name="start"]')?.value || '',
      periodsValue: document.querySelector('input[name="periods"]')?.value || '',
      invalidControls: document.querySelectorAll('[aria-invalid="true"], [data-invalid-filter]').length,
    };
  })()`;
}

async function waitForState(cdp, expected) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await evaluate(
      cdp,
      `document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || ''`,
    );
    if (state === expected) return;
    await sleep(100);
  }
  throw new Error(`Reports state ${expected} did not render.`);
}

async function navigateWithRetry(cdp, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(400 * attempt);
    }
  }
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}

function renderMarkdown(value) {
  return `# Reports category evolution visual validation\n\n- Commit: \`${value.commit}\`\n- Browser: ${value.browser}\n- Failures: ${value.failures.length}\n- Screenshots: ${value.screenshots.join(", ")}\n`;
}
