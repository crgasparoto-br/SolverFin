import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for cards visual validation.");
await mkdir(outputDir, { recursive: true });
let desktop;
let desktopModal;
let mobile;
let mobileModal;
let browserVersion = "unknown";
const completedScreenshots = [];

await runViewportSession("desktop", 1440, 900, async (cdp) => {
  desktop = await validateDesktop(cdp);
  completedScreenshots.push("cards-desktop.png");
  desktopModal = await validateDesktopModal(cdp);
  completedScreenshots.push("cards-modal-desktop.png");
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  mobile = await validateMobile(cdp);
  completedScreenshots.push("cards-mobile.png");
  mobileModal = await validateMobileModal(cdp);
  completedScreenshots.push("cards-modal-mobile.png");
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

await writeFile(join(outputDir, "cards-interface.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "CARDS-INTERFACE.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Cards desktop, modal and mobile visual validation passed.");
}

async function runViewportSession(label, width, height, validate) {
  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    browserVersion = browser.version;
    console.log(`Starting cards ${label} validation.`);
    await loginAndOpenCards(browser.cdp, width, height);
    await validate(browser.cdp);
  } catch (error) {
    const details = serializeError(error);
    failures.push({ message: `Cards ${label} validation crashed`, details });
    console.error(`Cards ${label} validation crashed:`, details);
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

async function loginAndOpenCards(cdp, width, height) {
  await setViewport(cdp, width, height);
  await navigateWithRetry(cdp, `${baseUrl}/login`, "login");
  const login = await evaluate(cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  await navigateWithRetry(cdp, `${baseUrl}/cartoes?month=2026-06`, "cards");
  await waitForCards(cdp);
}

async function validateDesktop(cdp) {
  await setViewport(cdp, 1440, 900);
  await waitForCards(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "cards-desktop.png"));

  check(measurements.viewport.width === 1440, "Cards desktop viewport is not 1440px", measurements);
  check(
    measurements.noHorizontalOverflow,
    "Cards desktop page has horizontal overflow",
    measurements,
  );
  check(measurements.overview.visible, "Invoice overview is not visible on desktop", measurements);
  check(measurements.amountDue.visible, "Amount due is not visible on desktop", measurements);
  check(measurements.status.visible, "Invoice status is not visible on desktop", measurements);
  check(
    measurements.keyDateCount === 2,
    "Invoice overview does not show both key dates",
    measurements,
  );
  check(measurements.search.visible, "Purchase search is not visible on desktop", measurements);
  check(measurements.filterCount === 2, "Reconciliation filters are incomplete", measurements);
  check(measurements.rowCount > 0, "Cards page rendered no purchase rows", measurements);
  check(
    measurements.tableHeaderVisible,
    "Purchase table header is not visible on desktop",
    measurements,
  );
  check(measurements.minimumRowHeight >= 44, "Purchase rows are smaller than 44px", measurements);
  check(
    measurements.statusCount === measurements.rowCount,
    "Purchase statuses are incomplete",
    measurements,
  );
  check(
    measurements.resultAnnouncement.includes("compras exibidas"),
    "Purchase count is not announced",
    measurements,
  );

  const filters = await validateSearchAndFilters(cdp);
  return { viewport: "1440x900", measurements, filters, screenshot: "cards-desktop.png" };
}

async function validateSearchAndFilters(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('[data-purchase-search]');
      input.value = 'consulta-sem-resultado-visual';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
  );
  await sleep(120);

  const emptyState = await evaluate(
    cdp,
    `(() => {
      const visibleRows = Array.from(document.querySelectorAll('[data-purchase-item]')).filter((row) => !row.hidden);
      const empty = document.querySelector('[data-purchase-filter-empty]');
      const status = document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '';
      const clear = document.querySelector('[data-clear-purchase-search]');
      return {
        visibleRows: visibleRows.length,
        emptyVisible: Boolean(empty && !empty.hidden),
        status,
        clearVisible: Boolean(clear && !clear.hidden),
      };
    })()`,
  );

  check(emptyState.visibleRows === 0, "Purchase search did not hide every row", emptyState);
  check(emptyState.emptyVisible, "Filtered purchase empty state is not visible", emptyState);
  check(emptyState.status.startsWith("0 "), "Filtered purchase count was not updated", emptyState);
  check(emptyState.clearVisible, "Purchase search clear action is not visible", emptyState);

  await evaluate(cdp, `document.querySelector('[data-clear-purchase-search]')?.click()`);
  await sleep(100);

  const unreconciled = await evaluate(
    cdp,
    `(() => {
      const toggle = document.querySelector('[data-reconciliation-toggle="reconciled"]');
      if (toggle?.getAttribute('aria-pressed') === 'true') toggle.click();
      return true;
    })()`,
  );
  assert.equal(unreconciled, true);
  await sleep(100);

  const filtered = await evaluate(
    cdp,
    `(() => {
      const visibleRows = Array.from(document.querySelectorAll('[data-purchase-item]')).filter((row) => !row.hidden);
      return {
        visibleRows: visibleRows.length,
        onlyUnreconciled: visibleRows.every((row) => row.dataset.reconciliation === 'unreconciled'),
        status: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      };
    })()`,
  );

  check(filtered.visibleRows > 0, "Unreconciled filter hid every purchase", filtered);
  check(
    filtered.onlyUnreconciled,
    "Reconciliation filter left reconciled purchases visible",
    filtered,
  );

  await evaluate(cdp, `document.querySelector('[data-reset-purchase-filters]')?.click()`);
  await sleep(80);
  return { emptyState, filtered };
}

async function validateDesktopModal(cdp) {
  await evaluate(cdp, `document.querySelector('[data-open-modal="purchase"]')?.click()`);
  await waitForModal(cdp, "purchase");
  const measurements = await evaluate(cdp, modalMeasurementExpression("purchase"));
  await screenshot(cdp, join(outputDir, "cards-modal-desktop.png"));

  check(measurements.visible, "Purchase modal did not open on desktop", measurements);
  check(measurements.insideViewport, "Purchase modal exceeds the desktop viewport", measurements);
  check(measurements.labelled, "Purchase modal is not labelled", measurements);
  check(measurements.described, "Purchase modal has no accessible description", measurements);
  check(measurements.closeTarget >= 34, "Purchase modal close action is too small", measurements);
  check(
    measurements.firstFieldFocused,
    "Purchase modal did not focus its first field",
    measurements,
  );

  await closeModal(cdp, "purchase");
  return { viewport: "1440x900", measurements, screenshot: "cards-modal-desktop.png" };
}

async function validateMobile(cdp) {
  await setViewport(cdp, 390, 844);
  await waitForCards(cdp);
  const measurements = await evaluate(cdp, pageMeasurementExpression());
  await screenshot(cdp, join(outputDir, "cards-mobile.png"));

  check(measurements.viewport.width === 390, "Cards mobile viewport is not 390px", measurements);
  check(
    measurements.noHorizontalOverflow,
    "Cards mobile page has horizontal overflow",
    measurements,
  );
  check(measurements.overview.visible, "Invoice overview is not visible on mobile", measurements);
  check(
    measurements.heroAction.height >= 44,
    "New purchase action is smaller than 44px",
    measurements,
  );
  check(measurements.search.height >= 44, "Purchase search is smaller than 44px", measurements);
  check(
    !measurements.tableHeaderVisible,
    "Desktop purchase header remains visible on mobile",
    measurements,
  );
  check(
    measurements.mobileDateLabel.includes("Data"),
    "Mobile date field lost its contextual label",
    measurements,
  );
  check(
    measurements.mobileStatusLabel.includes("Situação"),
    "Mobile status field lost its contextual label",
    measurements,
  );
  check(
    measurements.minimumActionTarget >= 40,
    "Purchase action target is smaller than 40px",
    measurements,
  );

  return { viewport: "390x844", measurements, screenshot: "cards-mobile.png" };
}

async function validateMobileModal(cdp) {
  await evaluate(cdp, `document.querySelector('[data-open-modal="purchase"]')?.click()`);
  await waitForModal(cdp, "purchase");
  const measurements = await evaluate(cdp, modalMeasurementExpression("purchase"));
  await screenshot(cdp, join(outputDir, "cards-modal-mobile.png"));

  check(measurements.visible, "Purchase modal did not open on mobile", measurements);
  check(measurements.insideViewport, "Purchase modal exceeds the mobile viewport", measurements);
  check(measurements.singleColumn, "Purchase modal is not single-column on mobile", measurements);
  check(
    measurements.minimumActionHeight >= 44,
    "Purchase modal actions are smaller than 44px",
    measurements,
  );

  await closeModal(cdp, "purchase");
  return { viewport: "390x844", measurements, screenshot: "cards-modal-mobile.png" };
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
      if (pageState.href.startsWith(url) && pageState.readyState !== "loading") return;
      if (attempt === attempts) throw error;
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(400 * attempt);
    }
  }
}

async function waitForCards(cdp) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector('main[data-cards-interface-enhanced] .invoice-overview') && document.querySelector('[data-purchase-item]'))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Cards design enhancement did not render with demo purchases.");
}

async function waitForModal(cdp, name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const visible = await evaluate(
      cdp,
      `Boolean(document.querySelector('dialog[data-modal="${name}"][open]'))`,
    );
    if (visible) return;
    await sleep(50);
  }
  throw new Error(`Cards ${name} modal did not become visible.`);
}

async function closeModal(cdp, name) {
  await evaluate(
    cdp,
    `document.querySelector('dialog[data-modal="${name}"] .modal-close')?.click()`,
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
    const rows = Array.from(document.querySelectorAll('[data-purchase-item]'));
    const actions = Array.from(document.querySelectorAll('.purchase-actions > summary'));
    const overview = document.querySelector('.invoice-overview');
    const amountDue = document.querySelector('.invoice-amount-due strong');
    const invoiceStatus = document.querySelector('.invoice-status');
    const search = document.querySelector('[data-purchase-search]');
    const tableHeader = document.querySelector('.purchase-table-head');
    const firstDate = document.querySelector('.purchase-date');
    const firstStatus = document.querySelector('.purchase-status');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      overview: { ...rect(overview), visible: visible(overview) },
      amountDue: { ...rect(amountDue), visible: visible(amountDue), text: amountDue?.textContent?.trim() || '' },
      status: { ...rect(invoiceStatus), visible: visible(invoiceStatus), text: invoiceStatus?.textContent?.trim() || '' },
      keyDateCount: document.querySelectorAll('.invoice-key-dates > div').length,
      heroAction: rect(document.querySelector('[data-open-modal="purchase"]')),
      search: { ...rect(search), visible: visible(search) },
      filterCount: document.querySelectorAll('[data-reconciliation-toggle]').length,
      rowCount: rows.length,
      statusCount: document.querySelectorAll('.purchase-status').length,
      minimumRowHeight: rows.length ? Math.min(...rows.map((row) => rect(row).height)) : 0,
      minimumActionTarget: actions.length ? Math.min(...actions.map((action) => rect(action).height)) : 0,
      tableHeaderVisible: visible(tableHeader),
      resultAnnouncement: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      mobileDateLabel: firstDate ? getComputedStyle(firstDate, '::before').content.replaceAll('"', '') : '',
      mobileStatusLabel: firstStatus ? getComputedStyle(firstStatus, '::before').content.replaceAll('"', '') : '',
    };
  })()`;
}

function modalMeasurementExpression(name) {
  return `(() => {
    const dialog = document.querySelector('dialog[data-modal="${name}"]');
    const panel = dialog?.querySelector('.modal-panel');
    const form = dialog?.querySelector('form:not(.close-form)');
    const close = dialog?.querySelector('.modal-close');
    const actions = Array.from(form?.querySelectorAll('button') || []);
    const rect = dialog?.getBoundingClientRect();
    const formStyle = form ? getComputedStyle(form) : undefined;
    return {
      visible: Boolean(dialog?.open),
      insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
      labelled: Boolean(dialog?.getAttribute('aria-labelledby')),
      described: Boolean(dialog?.getAttribute('aria-describedby')),
      closeTarget: close?.getBoundingClientRect().height || 0,
      firstFieldFocused: Boolean(panel?.contains(document.activeElement) && document.activeElement?.matches('input, select, textarea')),
      singleColumn: formStyle?.gridTemplateColumns ? formStyle.gridTemplateColumns.split(' ').length === 1 : false,
      minimumActionHeight: actions.length ? Math.min(...actions.map((action) => action.getBoundingClientRect().height)) : 0,
    };
  })()`;
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}

function renderReport(value) {
  const status = value.failures.length === 0 ? "APPROVED" : "FAILED";
  return `# Cards interface validation\n\n- Status: **${status}**\n- Browser: ${value.browser}\n- Commit: ${value.commit}\n- Screenshots: ${value.screenshots.join(", ")}\n- Failures: ${value.failures.length}\n`;
}
