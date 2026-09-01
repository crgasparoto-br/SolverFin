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

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: "unknown",
  failures,
  desktop: undefined,
  filteredEmpty: undefined,
  desktopModal: undefined,
  mobile: undefined,
  mobileModal: undefined,
  screenshots: [],
};

await runViewportSession("desktop", 1440, 900, async (cdp) => {
  report.desktop = await validatePage(cdp, "desktop");
  report.screenshots.push("cards-desktop.png");
  report.filteredEmpty = await validateFilteredEmpty(cdp);
  report.desktopModal = await validateModal(cdp, "desktop");
  report.screenshots.push("cards-modal-desktop.png");
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  report.mobile = await validatePage(cdp, "mobile");
  report.screenshots.push("cards-mobile.png");
  report.mobileModal = await validateModal(cdp, "mobile");
  report.screenshots.push("cards-modal-mobile.png");
});

await writeFile(join(outputDir, "cards-interface.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outputDir, "CARDS-INTERFACE.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Cards A3 desktop, filtered-empty, modal and mobile validation passed.");
}

async function runViewportSession(label, width, height, validate) {
  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    report.browser = browser.version;
    await setViewport(browser.cdp, width, height);
    await navigateWithRetry(browser.cdp, `${baseUrl}/login`, "login");
    const login = await evaluate(browser.cdp, loginExpression());
    assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
    await openCards(browser.cdp);
    await validate(browser.cdp);
  } catch (error) {
    const details = serializeError(error);
    failures.push({ message: `Cards ${label} validation crashed`, details });
    console.error(`Cards ${label} validation crashed:`, details);
  } finally {
    if (browser) await browser.close(outputDir);
    await sleep(200);
  }
}

async function openCards(cdp) {
  await navigateWithRetry(cdp, `${baseUrl}/cartoes?month=2026-06`, "cards A3");
  await waitFor(cdp, '[data-cards-archetype="A3"]');
  await waitFor(cdp, "[data-purchase-item]");
}

async function validatePage(cdp, viewportKind) {
  const measurements = await evaluate(
    cdp,
    `(() => {
      const rect = (element) => {
        if (!element) return { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
        const value = element.getBoundingClientRect();
        return { width: value.width, height: value.height, left: value.left, right: value.right, top: value.top, bottom: value.bottom };
      };
      const visible = (element) => {
        if (!element) return false;
        const value = rect(element);
        const style = getComputedStyle(element);
        return value.width > 0 && value.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const rows = Array.from(document.querySelectorAll('[data-purchase-item]'));
      const actions = Array.from(document.querySelectorAll('.cards-purchase-actions > summary'));
      const header = document.querySelector('.cards-invoice-header');
      const master = document.querySelector('.cards-master-panel');
      const detail = document.querySelector('.cards-detail-panel');
      const primaryAmount = document.querySelector('.cards-invoice-primary > strong');
      const status = document.querySelector('.cards-invoice-title-row .sf-badge');
      const search = document.querySelector('[data-purchase-search]');
      const tableHead = document.querySelector('.cards-purchase-table-head');
      const firstDate = document.querySelector('[data-purchase-item] [data-label="Data"]');
      const firstStatus = document.querySelector('[data-purchase-item] [data-label="Situação"]');
      const invoiceCopy = document.querySelector('.cards-invoice-title-block p')?.textContent || '';
      const settlementCopy = document.querySelector('.cards-settlement-note')?.textContent || '';
      const currencies = Array.from(document.querySelectorAll('.sf-money[data-currency]')).map((node) => node.getAttribute('data-currency'));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        archetype: document.querySelector('[data-cards-archetype]')?.getAttribute('data-cards-archetype') || '',
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        masterVisible: visible(master),
        detailVisible: visible(detail),
        invoiceHeaderVisible: visible(header),
        primaryAmountVisible: visible(primaryAmount),
        statusVisible: visible(status),
        searchVisible: visible(search),
        searchHeight: rect(search).height,
        heroAction: rect(document.querySelector('[data-open-modal="purchase"]')),
        tableHeaderVisible: visible(tableHead),
        rowCount: rows.length,
        minimumRowHeight: rows.length ? Math.min(...rows.map((row) => rect(row).height)) : 0,
        minimumActionTarget: actions.length ? Math.min(...actions.map((action) => rect(action).height)) : 0,
        filterCount: document.querySelectorAll('[data-reconciliation-toggle]').length,
        resultAnnouncement: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
        invoiceCopy,
        settlementCopy,
        currencies,
        cardSelect: Boolean(document.querySelector('[data-card-select]')),
        invoiceTabs: document.querySelectorAll('.cards-invoice-navigation .sf-tab').length,
        monthInput: Boolean(document.querySelector('[data-invoice-month-input]')),
        mobileDateLabel: firstDate ? getComputedStyle(firstDate, '::before').content.replaceAll('"', '') : '',
        mobileStatusLabel: firstStatus ? getComputedStyle(firstStatus, '::before').content.replaceAll('"', '') : '',
      };
    })()`,
  );

  check(measurements.archetype === "A3", "Cards route is not rendered as A3", measurements);
  check(measurements.noHorizontalOverflow, "Cards page has horizontal overflow", measurements);
  check(
    measurements.masterVisible && measurements.detailVisible,
    "Master-detail hierarchy is incomplete",
    measurements,
  );
  check(measurements.invoiceHeaderVisible, "Selected invoice context is not visible", measurements);
  check(measurements.primaryAmountVisible, "Invoice amount due is not visible", measurements);
  check(measurements.statusVisible, "Invoice status is not visible", measurements);
  check(
    measurements.invoiceCopy.includes("Fechamento") &&
      measurements.invoiceCopy.includes("Vencimento"),
    "Invoice closing and due dates are not explicit",
    measurements,
  );
  check(
    measurements.settlementCopy.includes("não é uma nova compra"),
    "Settlement semantics are not explicit",
    measurements,
  );
  check(
    measurements.currencies.length > 0 && measurements.currencies.every(Boolean),
    "Money is rendered without explicit currency",
    measurements,
  );
  check(measurements.cardSelect, "Card master selector is unavailable", measurements);
  check(
    measurements.invoiceTabs > 0 && measurements.monthInput,
    "Invoice navigation is incomplete",
    measurements,
  );
  check(measurements.searchVisible, "Purchase search is unavailable", measurements);
  check(measurements.filterCount >= 3, "Reconciliation filters are incomplete", measurements);
  check(measurements.rowCount > 0, "Cards page rendered no purchase rows", measurements);
  check(
    measurements.resultAnnouncement.includes("compra"),
    "Purchase result count is not announced",
    measurements,
  );

  if (viewportKind === "desktop") {
    check(
      measurements.tableHeaderVisible,
      "Purchase table header is not visible on desktop",
      measurements,
    );
    check(
      measurements.minimumRowHeight >= 40,
      "Purchase rows are too small on desktop",
      measurements,
    );
  } else {
    check(
      measurements.heroAction.height >= 44,
      "Primary purchase action is smaller than 44px",
      measurements,
    );
    check(measurements.searchHeight >= 40, "Purchase search is too small on mobile", measurements);
    check(
      !measurements.tableHeaderVisible,
      "Desktop purchase header remains visible on mobile",
      measurements,
    );
    check(
      measurements.mobileDateLabel.includes("Data"),
      "Mobile purchase date lost its contextual label",
      measurements,
    );
    check(
      measurements.mobileStatusLabel.includes("Situação"),
      "Mobile purchase status lost its contextual label",
      measurements,
    );
    check(
      measurements.minimumActionTarget >= 30,
      "Purchase action target is too small on mobile",
      measurements,
    );
  }

  await screenshot(cdp, join(outputDir, `cards-${viewportKind}.png`));
  return measurements;
}

async function validateFilteredEmpty(cdp) {
  const current = await evaluate(cdp, "window.location.href");
  const filteredUrl = new URL(current);
  filteredUrl.searchParams.set("q", "__solverfin_no_purchase_matches__");
  await navigateWithRetry(cdp, filteredUrl.toString(), "cards filtered empty");
  await waitFor(cdp, "[data-purchase-filter-empty]");

  const result = await evaluate(
    cdp,
    `(() => ({
      rowCount: document.querySelectorAll('[data-purchase-item]').length,
      emptyVisible: Boolean(document.querySelector('[data-purchase-filter-empty] .sf-state-panel[data-state="empty"]')),
      status: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
      query: document.querySelector('[data-purchase-search]')?.value || '',
    }))()`,
  );
  check(result.rowCount === 0, "Filtered empty state still renders purchase rows", result);
  check(result.emptyVisible, "Filtered purchase empty state is not visible", result);
  check(result.status.startsWith("0 "), "Filtered result count is not zero", result);
  check(
    result.query === "__solverfin_no_purchase_matches__",
    "Filtered query is not preserved",
    result,
  );

  await openCards(cdp);
  return result;
}

async function validateModal(cdp, viewportKind) {
  await evaluate(cdp, `document.querySelector('[data-open-modal="purchase"]')?.click()`);
  await waitFor(cdp, 'dialog[data-modal="purchase"][open]');
  const measurements = await evaluate(
    cdp,
    `(() => {
      const dialog = document.querySelector('dialog[data-modal="purchase"]');
      const close = dialog?.querySelector('[data-close-modal]');
      const form = dialog?.querySelector('form[data-purchase-form]');
      const rect = dialog?.getBoundingClientRect();
      const style = form ? getComputedStyle(form) : undefined;
      const buttons = Array.from(form?.querySelectorAll('button') || []);
      return {
        visible: Boolean(dialog?.open),
        labelled: Boolean(dialog?.getAttribute('aria-labelledby')),
        insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1),
        closeTarget: close?.getBoundingClientRect().height || 0,
        singleColumn: style?.gridTemplateColumns ? style.gridTemplateColumns.split(' ').length === 1 : false,
        minimumActionHeight: buttons.length ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height)) : 0,
      };
    })()`,
  );
  check(measurements.visible, "Purchase modal did not open", measurements);
  check(measurements.labelled, "Purchase modal is not labelled", measurements);
  check(measurements.insideViewport, "Purchase modal exceeds the viewport", measurements);
  check(measurements.closeTarget >= 40, "Purchase modal close action is too small", measurements);
  if (viewportKind === "mobile") {
    check(measurements.singleColumn, "Purchase modal is not single-column on mobile", measurements);
    check(
      measurements.minimumActionHeight >= 40,
      "Purchase modal action is too small on mobile",
      measurements,
    );
  }
  await screenshot(cdp, join(outputDir, `cards-modal-${viewportKind}.png`));
  await evaluate(
    cdp,
    `document.querySelector('dialog[data-modal="purchase"] [data-close-modal]')?.click()`,
  );
  await sleep(80);
  return measurements;
}

async function waitFor(cdp, selector) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error(`Cards selector did not render: ${selector}`);
}

async function navigateWithRetry(cdp, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(350 * attempt);
    }
  }
}

function serializeError(error) {
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  return { name: "UnknownError", message: String(error), stack: "" };
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}

function renderReport(value) {
  const status = value.failures.length === 0 ? "APPROVED" : "FAILED";
  return `# Cards A3 interface validation\n\n- Status: **${status}**\n- Browser: ${value.browser}\n- Commit: ${value.commit}\n- Screenshots: ${value.screenshots.join(", ")}\n- Failures: ${value.failures.length}\n`;
}
