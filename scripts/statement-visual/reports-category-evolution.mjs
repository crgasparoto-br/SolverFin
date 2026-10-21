import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";
import { reportPageViewportExpression } from "./report-page-viewport.mjs";

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
  multiCurrency: [],
  negativeControl: null,
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
  report.multiCurrency = await validateMultiCurrency(browser.cdp, seeded.month);
  report.negativeControl = await validateClippedCategoryNegativeControl(browser.cdp);
  report.viewportNegativeControl = await validateReportViewportNegativeControl(browser.cdp);
} catch (error) {
  failures.push({ message: "Reports visual validation crashed", details: serializeError(error) });
} finally {
  if (browser) await browser.close(outputDir);
}

await writeFile(
  join(outputDir, "reports-category-evolution.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(join(outputDir, "REPORTS-CATEGORY-EVOLUTION.md"), renderMarkdown(report));

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
        const usdAccount = (await request('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Conta USD relatorio visual ' + suffix,
            kind: 'checking',
            openingBalanceMinor: 0,
            currency: 'USD',
          }),
        })).account;
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
          description: 'Despesa visual de categoria com texto extenso ' + suffix,
        });
        await createTransaction({
          kind: 'income',
          categoryId: incomeCategory.id,
          accountId: usdAccount.id,
          amountMinor: 12345,
          currency: 'USD',
          description: 'Receita em USD para confirmar separacao monetaria ' + suffix,
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

  check(
    measurements.state === "ready",
    "Reports desktop did not render the ready state",
    measurements,
  );
  check(measurements.tableCount >= 1, "Reports desktop rendered no semantic table", measurements);
  check(
    measurements.columnHeaders >= 4,
    "Reports desktop has incomplete column headers",
    measurements,
  );
  check(measurements.rowHeaders >= 3, "Reports desktop has incomplete row headers", measurements);
  check(measurements.headerSticky, "Reports desktop header is not sticky", measurements);
  check(
    measurements.descriptionSticky,
    "Reports desktop description column is not sticky",
    measurements,
  );
  check(
    measurements.scrollerTabIndex === 0,
    "Reports matrix is not keyboard focusable",
    measurements,
  );
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
  check(
    measurements.tableScrollable,
    "Reports mobile matrix is not horizontally scrollable",
    measurements,
  );
  check(
    measurements.scrollerFocused,
    "Reports mobile matrix did not accept keyboard focus",
    measurements,
  );
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
  check(
    measurements.hasAccessiblePeriod,
    "Reports empty state lost accessible period labels",
    measurements,
  );
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

  check(
    measurements.intervalValue === "quarterly",
    "Invalid interval was not preserved",
    measurements,
  );
  check(measurements.startValue === "2026-13", "Invalid start was not preserved", measurements);
  check(measurements.periodsValue === "abc", "Invalid periods were not preserved", measurements);
  check(
    measurements.invalidControls >= 3,
    "Invalid controls are not identified accessibly",
    measurements,
  );
  return { viewport: "1024x700", measurements, screenshot: screenshots.at(-1) };
}

async function validateMultiCurrency(cdp, month) {
  const snapshots = [];
  for (const [width, height, label] of [
    [1366, 768, "desktop"],
    [390, 844, "mobile"],
    [320, 740, "mobile-small"],
  ]) {
    await setViewport(cdp, width, height);
    await navigateWithRetry(
      cdp,
      `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=12`,
      `reports multi-currency ${label}`,
    );
    await waitForState(cdp, "ready");
    const measurements = await evaluate(
      cdp,
      `(() => {
      const pageViewport = ${reportPageViewportExpression()};
      const blocks = Array.from(document.querySelectorAll('[data-report-analysis="a5"][data-currency]'));
      return {
        currencies: blocks.map((block) => block.getAttribute('data-currency')),
        currenciesComplete: ['BRL', 'USD'].every((currency) => {
          const block = blocks.find((item) => item.getAttribute('data-currency') === currency);
          if (!block) return false;
          const layers = Array.from(block.querySelectorAll('[data-analysis-layer]'))
            .map((layer) => layer.getAttribute('data-analysis-layer'));
          const money = Array.from(block.querySelectorAll('.sf-money[data-currency]'));
          return layers.join('|') === 'summary|visualization|highlights|detail'
            && money.length > 0
            && money.every((node) => node.getAttribute('data-currency') === currency)
            && Boolean(block.querySelector('[data-emphasis="true"]'));
        }),
        globalOverflow: !pageViewport.fits,
        pageViewport,
        tableScrollLocal: Array.from(document.querySelectorAll('.evolution-table-scroll'))
          .every((node) => node.scrollWidth > node.clientWidth && node.tabIndex === 0),
        trendScrollLocal: Array.from(document.querySelectorAll('.report-trend'))
          .every((node) => node.scrollWidth > node.clientWidth
            && ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)
            && node.tabIndex === 0),
        longLabelsReadable: Array.from(document.querySelectorAll('.report-category-label > span:last-child'))
          .every((node) => getComputedStyle(node).textOverflow !== 'ellipsis'),
      };
    })()`,
    );
    // Preserve the opening viewport and independently capture every currency below
    // the fold. A screenshot of filters alone cannot attest monetary readability.
    const capturedSections = [];
    for (const currency of ["BRL", "USD"]) {
      for (const layer of ["summary", "visualization", "detail"]) {
        const section = await evaluate(
          cdp,
          `(() => {
            const block = Array.from(document.querySelectorAll('[data-report-analysis="a5"][data-currency]'))
              .find((candidate) => candidate.getAttribute('data-currency') === ${JSON.stringify(currency)});
            const target = block?.querySelector('[data-analysis-layer="${layer}"]');
            if (!block || !target) return { visible: false, correctCurrency: false, hasContent: false };
            target.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' });
            const bounds = target.getBoundingClientRect();
            const viewportHeight = document.documentElement.clientHeight;
            const visibleHeight = Math.max(0, Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0));
            const heading = block.querySelector('.report-analysis-heading');
            const money = target.querySelectorAll('.sf-money[data-currency]');
            const hasContent = '${layer}' === 'summary'
              ? money.length > 0 && Array.from(money).every((item) => item.getAttribute('data-currency') === '${currency}')
              : '${layer}' === 'visualization'
                ? Boolean(target.querySelector('.report-trend'))
                : Boolean(target.querySelector('table, .sf-table-wrap'));
            return {
              visible: bounds.top >= -2 && bounds.top <= viewportHeight - 100 && visibleHeight >= 100,
              correctCurrency: heading?.textContent?.includes('${currency}') === true,
              hasContent,
              viewportTop: Math.round(bounds.top),
              visibleHeight: Math.round(visibleHeight),
            };
          })()`,
        );
        const sectionScreenshot = `reports-${label}-${width}x${height}-${currency.toLowerCase()}-${layer}.png`;
        await screenshot(cdp, join(outputDir, sectionScreenshot));
        screenshots.push(sectionScreenshot);
        check(section.visible, `${currency} ${layer} is not visible in ${label} evidence`, section);
        check(section.correctCurrency, `${currency} ${layer} lost the currency heading`, section);
        check(section.hasContent, `${currency} ${layer} has no inspectable content`, section);
        capturedSections.push({
          currency,
          layer,
          screenshot: sectionScreenshot,
          measurements: section,
        });
      }
    }
    // Return to the top so the original reference capture remains comparable.
    await evaluate(cdp, `window.scrollTo({ top: 0, behavior: 'instant' })`);
    const filename = `reports-multicurrency-${label}-${width}x${height}.png`;
    await screenshot(cdp, join(outputDir, filename));
    screenshots.push(filename);
    check(measurements.currencies.includes("BRL"), "Missing BRL block", measurements);
    check(measurements.currencies.includes("USD"), "Missing USD block", measurements);
    check(
      measurements.currenciesComplete,
      "Per-currency layers or Money values became mixed",
      measurements,
    );
    check(
      !measurements.globalOverflow,
      "Reports multi-currency page leaks horizontal overflow",
      measurements,
    );
    check(measurements.longLabelsReadable, "Reports category labels are truncated", measurements);
    if (width <= 390) {
      check(
        measurements.trendScrollLocal,
        "Multi-currency mobile trend lost local scroll",
        measurements,
      );
      check(
        measurements.tableScrollLocal,
        "Multi-currency mobile table lost local scroll",
        measurements,
      );
    }
    snapshots.push({
      viewport: `${width}x${height}`,
      screenshot: filename,
      measurements,
      capturedSections,
    });
  }
  return snapshots;
}

async function validateReportViewportNegativeControl(cdp) {
  const result = await evaluate(
    cdp,
    `(() => {
      const main = document.querySelector('main');
      if (!main) return { observed: false, restored: false };
      const before = ${reportPageViewportExpression()};
      const previous = main.getAttribute('style');
      main.style.maxWidth = 'none';
      main.style.width = 'calc(100vw + 64px)';
      const observed = !${reportPageViewportExpression()}.fits;
      if (previous === null) main.removeAttribute('style');
      else main.setAttribute('style', previous);
      const restored = ${reportPageViewportExpression()}.fits;
      return { before: before.fits, observed, restored };
    })()`,
  );
  check(result.before, "Report viewport negative control has an invalid baseline", result);
  check(result.observed, "Report viewport negative control missed a real width expansion", result);
  check(result.restored, "Report viewport negative control did not restore layout", result);
  return result;
}

async function validateClippedCategoryNegativeControl(cdp) {
  const checkClip = await evaluate(
    cdp,
    `(() => {
    const label = document.querySelector('.report-category-label > span:last-child');
    if (!label) return { observed: false, restored: false };
    const previous = label.getAttribute('style');
    label.style.maxWidth = '2px';
    label.style.overflow = 'hidden';
    label.style.whiteSpace = 'nowrap';
    label.style.textOverflow = 'ellipsis';
    const observed = getComputedStyle(label).textOverflow === 'ellipsis'
      && label.scrollWidth > label.clientWidth;
    if (previous === null) label.removeAttribute('style');
    else label.setAttribute('style', previous);
    const restored = getComputedStyle(label).textOverflow !== 'ellipsis';
    return { observed, restored };
  })()`,
  );
  check(checkClip.observed, "Negative control did not detect a clipped category", checkClip);
  check(checkClip.restored, "Negative control did not restore readable category styles", checkClip);
  return checkClip;
}

function measurementExpression() {
  return `(() => {
    const scroller = document.querySelector('.evolution-table-scroll');
    const table = document.querySelector('.evolution-table');
    const form = document.querySelector('.evolution-filters');
    const style = form ? getComputedStyle(form) : null;
    const text = document.body.textContent || '';
    const pageViewport = ${reportPageViewportExpression()};
    return {
      state: document.querySelector('[data-report-state]')?.getAttribute('data-report-state') || '',
      viewportWidth: window.innerWidth,
      pageFitsViewport: pageViewport.fits,
      pageViewport,
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
