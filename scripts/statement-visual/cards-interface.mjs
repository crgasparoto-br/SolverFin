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
  compactMobile: undefined,
  compactMobileModal: undefined,
  longContentCompactMobile: undefined,
  longContentDesktop: undefined,
  longContentMobile: undefined,
  filteredEmptyMobile: undefined,
  filteredEmptyCompactMobile: undefined,
  screenshots: [],
};

await runViewportSession("desktop", 1366, 768, async (cdp) => {
  report.desktop = await validatePage(cdp, "desktop");
  report.screenshots.push("cards-desktop.png");
  report.filteredEmpty = await validateFilteredEmpty(cdp, "desktop");
  report.screenshots.push("cards-empty-desktop.png");
  report.longContentDesktop = await validateLongDescription(cdp, "desktop");
  report.screenshots.push("cards-long-desktop.png");
  report.desktopModal = await validateModal(cdp, "desktop");
  report.screenshots.push("cards-modal-desktop.png");
});

await runViewportSession("mobile", 390, 844, async (cdp) => {
  report.mobile = await validatePage(cdp, "mobile");
  report.screenshots.push("cards-mobile.png");
  report.longContentMobile = await validateLongDescription(cdp, "mobile");
  report.screenshots.push("cards-long-mobile.png");
  report.filteredEmptyMobile = await validateFilteredEmpty(cdp, "mobile");
  report.screenshots.push("cards-empty-mobile.png");
  report.mobileModal = await validateModal(cdp, "mobile");
  report.screenshots.push("cards-modal-mobile.png");
});

await runViewportSession("compact-mobile", 320, 740, async (cdp) => {
  report.compactMobile = await validatePage(cdp, "mobile", "compact-mobile");
  report.screenshots.push("cards-compact-mobile.png");
  report.longContentCompactMobile = await validateLongDescription(cdp, "compact-mobile");
  report.screenshots.push("cards-long-compact-mobile.png");
  report.filteredEmptyCompactMobile = await validateFilteredEmpty(cdp, "compact-mobile");
  report.screenshots.push("cards-empty-compact-mobile.png");
  report.compactMobileModal = await validateModal(cdp, "mobile", "compact-mobile");
  report.screenshots.push("cards-modal-compact-mobile.png");
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

async function validatePage(cdp, viewportKind, captureName = viewportKind) {
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
      const action = actions[0];
      const actionTargetBefore = rect(action).height >= 44 && rect(action).width >= 44;
      const originalActionHeight = action?.style.height || '';
      const originalActionWidth = action?.style.width || '';
      if (action) { action.style.height = '30px'; action.style.width = '30px'; }
      const actionTargetNegativeRejected = Boolean(action && (rect(action).height < 44 || rect(action).width < 44));
      if (action) { action.style.height = originalActionHeight; action.style.width = originalActionWidth; }
      const actionTargetRestored = Boolean(action && rect(action).height >= 44 && rect(action).width >= 44);
      const sidebar = document.querySelector('.sidebar');
      const pageTitle = document.querySelector('.cards-a3-page .sf-page-header');
      const shellTitle = document.querySelector('.topbar');
      const lightShell = () => {
        const color = sidebar ? getComputedStyle(sidebar).backgroundColor.match(/[0-9]+/g)?.slice(0,3).map(Number) : [];
        return color?.length === 3 && color.every((channel) => channel >= 220);
      };
      const shellIsLight = lightShell();
      const originalSidebarBackground = sidebar?.style.background || '';
      if (sidebar) sidebar.style.background = 'rgb(12, 48, 60)';
      const shellNegativeRejected = !lightShell();
      if (sidebar) sidebar.style.background = originalSidebarBackground;
      const shellRestored = lightShell();
      const noRepeatedHeader = !visible(shellTitle) || !visible(pageTitle);
      const statuses = Array.from(
        document.querySelectorAll('[data-purchase-item] .cards-purchase-status'),
      );
      const statusIconContract =
        statuses.length === rows.length &&
        statuses.every((node) => {
          const svg = node.querySelector('svg[aria-hidden="true"]');
          const row = node.closest('[data-purchase-item]');
          const reconciled = row?.dataset.reconciliation === 'reconciled';
          const isReconciled = node.classList.contains('cards-purchase-status-reconciled');
          return (
            Boolean(svg) &&
            visible(svg) &&
            Boolean(node.getAttribute('aria-label')) &&
            node.getAttribute('aria-label') === node.getAttribute('title') &&
            node.getAttribute('aria-label') === node.dataset.tooltip &&
            node.textContent.trim() === '' &&
            node.getAttribute('role') === 'img' &&
            node.tabIndex === 0 &&
            reconciled === isReconciled
          );
        });
      const firstStatusSvg = statuses[0]?.querySelector('svg');
      const originalStatusVisibility = firstStatusSvg?.style.visibility || '';
      if (firstStatusSvg) firstStatusSvg.style.visibility = 'hidden';
      const statusIconNegativeRejected = firstStatusSvg
        ? getComputedStyle(firstStatusSvg).visibility === 'hidden'
        : false;
      if (firstStatusSvg) firstStatusSvg.style.visibility = originalStatusVisibility;
      const statusIconRestored = firstStatusSvg
        ? getComputedStyle(firstStatusSvg).visibility !== 'hidden'
        : false;
      const header = document.querySelector('.cards-invoice-header');
      const master = document.querySelector('.cards-master-panel');
      const detail = document.querySelector('.cards-detail-panel');
      const primaryAmount = document.querySelector('.cards-invoice-primary > strong');
      const firstPurchaseRow = rows[0];
      const status = document.querySelector('.cards-invoice-title-row .sf-badge');
      const search = document.querySelector('[data-purchase-search]');
      const invoiceNavigation = document.querySelector('.cards-invoice-period-row');
      const monthPicker = document.querySelector('.cards-month-picker');
      const monthPopup = monthPicker?.querySelector('.cards-month-jump');
      const originallyOpen = Boolean(monthPicker?.open);
      if (monthPicker) monthPicker.open = true;
      const popupRect = rect(monthPopup);
      const popupInsideViewport = popupRect.width > 0 && popupRect.left >= -1 &&
        popupRect.right <= window.innerWidth + 1;
      const originalTransform = monthPopup?.style.transform || '';
      if (monthPopup) monthPopup.style.transform = 'translateX(100vw)';
      const popupNegativeRejected = rect(monthPopup).right > window.innerWidth;
      if (monthPopup) monthPopup.style.transform = originalTransform;
      const popupRestored = rect(monthPopup).right <= window.innerWidth + 1;
      if (monthPicker) monthPicker.open = originallyOpen;
      const previousPeriod = invoiceNavigation?.querySelector('.cards-invoice-period-link-previous');
      const currentPeriod = invoiceNavigation?.querySelector('.cards-invoice-current');
      const nextPeriod = invoiceNavigation?.querySelector('.cards-invoice-period-link-next');
      const periodTitleContained = [previousPeriod, nextPeriod].every((link) => {
        const title = link?.querySelector('strong');
        if (!title || !visible(title)) return true;
        const titleRect = rect(title);
        const linkRect = rect(link);
        return titleRect.left >= linkRect.left - 1 && titleRect.right <= linkRect.right + 1;
      });
      const periodsDoNotOverlap = Boolean(
        previousPeriod && currentPeriod && nextPeriod &&
        rect(previousPeriod).right <= rect(currentPeriod).left + 1 &&
        rect(currentPeriod).right <= rect(nextPeriod).left + 1 &&
        periodTitleContained
      );
      const tableHead = document.querySelector('.cards-purchase-table-head');
      const firstDate = document.querySelector('[data-purchase-item] [data-label="Data"]');
      const firstStatus = document.querySelector('[data-purchase-item] [data-label="Situação"]');
      const firstCategory = document.querySelector('[data-purchase-item] [data-label="Categoria"]');
      const purchaseCategoryContract = rows.length > 0 && rows.every((row) => {
        const cells = Array.from(row.querySelectorAll(':scope > [role="cell"]'));
        const category = row.querySelector(':scope > .cards-purchase-category[role="cell"]');
        const description = row.querySelector(':scope > .cards-purchase-description[role="cell"]');
        return Boolean(
          cells.length === 6 &&
          category && description &&
          category.textContent.trim() &&
          !description.contains(category) &&
          visible(category)
        );
      });
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
        primaryAmountTop: rect(primaryAmount).top,
        firstPurchaseRowTop: rect(firstPurchaseRow).top,
        firstPurchaseRowBottom: rect(firstPurchaseRow).bottom,
        masterBottom: rect(master).bottom,
        invoiceHeaderTop: rect(header).top,
        statusVisible: visible(status),
        searchVisible: visible(search),
        searchHeight: rect(search).height,
        periodsDoNotOverlap,
        monthPopupInsideViewport: popupInsideViewport,
        monthPopupNegativeRejected: popupNegativeRejected && popupRestored,
        monthPopupRect: popupRect,
        periodNavigationRects: [previousPeriod, currentPeriod, nextPeriod].map(rect),
        heroAction: rect(document.querySelector('[data-open-modal="purchase"]')),
        purchaseActionSecondary: Boolean(document.querySelector('[data-open-modal="purchase"].sf-button-secondary')),
        closeActionSecondary: !document.querySelector('[data-api-path$="/close"]') || Boolean(document.querySelector('[data-api-path$="/close"].sf-button-secondary')),
        payActionPrimary: !document.querySelector('[data-open-modal="payment"]') || Boolean(document.querySelector('[data-open-modal="payment"].sf-button-primary')),
        primaryInvoiceActionCount: document.querySelectorAll('.cards-invoice-header .sf-button-primary').length,
        advancedFiltersCollapsed: !document.querySelector('.cards-advanced-filters')?.open,
        tableHeaderVisible: visible(tableHead),
        rowCount: rows.length,
        categoryColumnHeader: Boolean(
          tableHead && Array.from(tableHead.querySelectorAll('[role="columnheader"]')).some(
            (cell) => cell.textContent.trim() === 'Categoria',
          )
        ),
        categoryCellsSeparate: purchaseCategoryContract,
        mobileCategoryLabel: firstCategory
          ? getComputedStyle(firstCategory, '::before').content.replaceAll('"', '')
          : '',
        minimumRowHeight: rows.length ? Math.min(...rows.map((row) => rect(row).height)) : 0,
        minimumActionTarget: actions.length ? Math.min(...actions.map((action) => Math.min(rect(action).height, rect(action).width))) : 0,
        actionTargetBefore,
        actionTargetNegativeRejected: actionTargetNegativeRejected && actionTargetRestored,
        shellIsLight,
        shellNegativeRejected: shellNegativeRejected && shellRestored,
        noRepeatedHeader,
        iconOnlyPurchaseStatuses: statusIconContract,
        statusIconNegativeRejected: statusIconNegativeRejected && statusIconRestored,
        purchaseActionIcons:
          actions.length > 0 &&
          actions.every(
            (action) =>
              Boolean(action.querySelector('svg[aria-hidden="true"]')) &&
              action.textContent.trim() === '',
          ),
        filterCount: document.querySelectorAll('[data-reconciliation-toggle]').length,
        resultAnnouncement: document.querySelector('[data-purchase-results-status]')?.textContent?.trim() || '',
        invoiceCopy,
        settlementCopy,
        currencies,
        cardSelect: Boolean(document.querySelector('[data-card-select]')),
        invoicePeriodNavigation: Boolean(document.querySelector('.cards-invoice-period-row')),
        previousPeriodControl: Boolean(document.querySelector('.cards-invoice-period-link-previous')),
        nextPeriodControl: Boolean(document.querySelector('.cards-invoice-period-link-next')),
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
  check(
    measurements.periodsDoNotOverlap,
    "Invoice period navigation overlaps at this viewport",
    measurements,
  );
  check(
    measurements.monthPopupInsideViewport && measurements.monthPopupNegativeRejected,
    "Invoice month picker escapes the viewport or its negative control fails",
    measurements,
  );
  check(measurements.primaryAmountVisible, "Invoice amount due is not visible", measurements);
  check(
    measurements.purchaseActionSecondary,
    "Purchase action competes with invoice decision",
    measurements,
  );
  check(measurements.closeActionSecondary, "Close action competes with settlement", measurements);
  check(
    measurements.payActionPrimary,
    "Settlement is not the invoice primary action",
    measurements,
  );
  check(
    measurements.primaryInvoiceActionCount <= 1,
    "Invoice has competing primary actions",
    measurements,
  );
  check(
    measurements.advancedFiltersCollapsed,
    "Unused advanced filters occupy the viewport",
    measurements,
  );
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
    measurements.invoicePeriodNavigation &&
      measurements.previousPeriodControl &&
      measurements.nextPeriodControl &&
      measurements.monthInput,
    "Invoice period navigation is incomplete",
    measurements,
  );
  check(measurements.searchVisible, "Purchase search is unavailable", measurements);
  check(measurements.filterCount >= 3, "Reconciliation filters are incomplete", measurements);
  check(measurements.rowCount > 0, "Cards page rendered no purchase rows", measurements);
  check(
    measurements.categoryColumnHeader && measurements.categoryCellsSeparate,
    "Golden Screen: purchase category must have its own visible table column",
    measurements,
  );
  check(
    measurements.iconOnlyPurchaseStatuses && measurements.statusIconNegativeRejected,
    "Golden Screen: purchase situations must be accessible SVG pictograms, not text badges",
    measurements,
  );
  check(
    measurements.minimumActionTarget >= 44 && measurements.actionTargetBefore && measurements.actionTargetNegativeRejected,
    "Golden Screen: purchase menu actions need 44px touch targets and a rejecting negative control",
    measurements,
  );
  check(
    measurements.shellIsLight && measurements.shellNegativeRejected && measurements.noRepeatedHeader,
    "Golden Screen: card shell must be light and have no repeated visible route title",
    measurements,
  );
  check(
    measurements.purchaseActionIcons,
    "Purchase actions must use shared SVG iconography",
    measurements,
  );
  check(
    measurements.resultAnnouncement.includes("compra"),
    "Purchase result count is not announced",
    measurements,
  );

  if (viewportKind === "desktop") {
    check(
      measurements.firstPurchaseRowTop < measurements.viewport.height - 15,
      "Golden Screen: first purchase row is below the desktop fold",
      measurements,
    );
    check(
      measurements.masterBottom < measurements.viewport.height * 0.38,
      "Golden Screen: expanded master context consumes the desktop fold",
      measurements,
    );
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
      measurements.primaryAmountTop < measurements.viewport.height * 0.75,
      "Golden Screen: invoice amount is below the mobile decision area",
      measurements,
    );
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
      !measurements.mobileStatusLabel.includes("Situação"),
      "Mobile purchase status duplicates the icon label instead of using tooltip/aria",
      measurements,
    );
    check(
      measurements.mobileCategoryLabel.includes("Categoria"),
      "Mobile purchase category lost its contextual label",
      measurements,
    );
    check(
      measurements.minimumActionTarget >= 44,
      "Purchase action target is smaller than 44px on mobile",
      measurements,
    );
  }

  const negative = await validateFirstFoldNegativeControl(cdp, viewportKind);
  check(
    negative.acceptedBefore && !negative.acceptedDuring && negative.acceptedAfter,
    "Golden Screen negative control failed to reject content pushed below the fold",
    negative,
  );
  measurements.firstFoldNegative = negative;
  await screenshot(cdp, join(outputDir, `cards-${captureName}.png`));
  return measurements;
}

async function validateFirstFoldNegativeControl(cdp, viewportKind) {
  return evaluate(
    cdp,
    `(() => {
      const target = document.querySelector(
        ${JSON.stringify(viewportKind === "desktop" ? "[data-purchase-item]" : ".cards-invoice-primary > strong")}
      );
      if (!target) return { acceptedBefore: false, acceptedDuring: false, acceptedAfter: false };
      const threshold = window.innerHeight * ${viewportKind === "desktop" ? "1" : "0.75"} - ${viewportKind === "desktop" ? "15" : "0"};
      const original = target.style.transform;
      const accepted = () => target.getBoundingClientRect().top < threshold;
      const acceptedBefore = accepted();
      target.style.transform = 'translateY(' + window.innerHeight + 'px)';
      const acceptedDuring = accepted();
      target.style.transform = original;
      return { acceptedBefore, acceptedDuring, acceptedAfter: accepted(), threshold };
    })()`,
  );
}

async function validateFilteredEmpty(cdp, captureName) {
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

  await screenshot(cdp, join(outputDir, `cards-empty-${captureName}.png`));
  await openCards(cdp);
  return result;
}

async function validateLongDescription(cdp, captureName) {
  const original = await evaluate(
    cdp,
    `(() => {
      const description = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      if (!description) return null;
      const html = description.innerHTML;
      description.textContent = 'Assinatura internacional recorrente com uma descricao operacional extensa para validar leitura integral, valor e moeda sem truncamento no extrato do cartao';
      return html;
    })()`,
  );
  assert.notEqual(original, null, "No purchase description for long-content validation");
  await sleep(80);
  const result = await evaluate(
    cdp,
    `(() => {
      const text = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      const amount = document.querySelector('[data-purchase-item] .cards-purchase-amount');
      const row = document.querySelector('[data-purchase-item]');
      const style = getComputedStyle(text);
      const descriptionRect = text.getBoundingClientRect();
      const amountRect = amount.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        whiteSpace: style.whiteSpace,
        ellipsis: style.textOverflow === 'ellipsis',
        lineWrap: descriptionRect.height > (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35) * 1.4,
        rowInViewport: rowRect.left >= -1 && rowRect.right <= window.innerWidth + 1,
        amountVisible: amountRect.width > 0 && amountRect.right <= window.innerWidth + 1,
        currencyVisible: Boolean(amount.querySelector('.sf-money[data-currency]')),
      };
    })()`,
  );
  check(result.noHorizontalOverflow, "Long description causes horizontal overflow", result);
  check(
    result.whiteSpace !== "nowrap" && !result.ellipsis && result.lineWrap,
    "Long description is truncated",
    result,
  );
  check(
    result.rowInViewport && result.amountVisible && result.currencyVisible,
    "Long description hides actions, values or currency",
    result,
  );
  await screenshot(cdp, join(outputDir, `cards-long-${captureName}.png`));
  await evaluate(
    cdp,
    `(() => {
      const description = document.querySelector('[data-purchase-item] .cards-purchase-description strong');
      if (description) description.innerHTML = ${JSON.stringify(original)};
    })()`,
  );
  return result;
}

async function validateModal(cdp, viewportKind, captureName = viewportKind) {
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
        closeIconText: close?.textContent?.trim() || "",
        closeIconColor: close ? getComputedStyle(close).color : "",
        dialogBackground: dialog ? getComputedStyle(dialog).backgroundColor : "",
        closeIconOpacity: close ? Number(getComputedStyle(close).opacity) : 0,
        singleColumn: style?.gridTemplateColumns ? style.gridTemplateColumns.split(' ').length === 1 : false,
        minimumActionHeight: buttons.length ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height)) : 0,
      };
    })()`,
  );
  check(measurements.visible, "Purchase modal did not open", measurements);
  check(measurements.labelled, "Purchase modal is not labelled", measurements);
  check(measurements.insideViewport, "Purchase modal exceeds the viewport", measurements);
  check(measurements.closeTarget >= 40, "Purchase modal close action is too small", measurements);
  check(
    measurements.closeIconText === "×" &&
      measurements.closeIconOpacity > 0 &&
      measurements.closeIconColor !== measurements.dialogBackground,
    "Purchase modal close icon is missing or visually indistinguishable",
    measurements,
  );
  // An invisible close icon must fail: restore the original DOM style.
  const negative = await evaluate(
    cdp,
    `(() => {
    const close = document.querySelector('dialog[data-modal="purchase"] [data-close-modal]');
    const original = close.style.visibility;
    close.style.visibility = 'hidden';
    const rejected = getComputedStyle(close).visibility === 'hidden';
    close.style.visibility = original;
    return { rejected, restored: getComputedStyle(close).visibility === 'visible' };
  })()`,
  );
  check(
    negative.rejected && negative.restored,
    "Close icon negative control did not reject and restore",
    negative,
  );
  if (viewportKind === "mobile") {
    check(measurements.singleColumn, "Purchase modal is not single-column on mobile", measurements);
    check(
      measurements.minimumActionHeight >= 40,
      "Purchase modal action is too small on mobile",
      measurements,
    );
  }
  await screenshot(cdp, join(outputDir, `cards-modal-${captureName}.png`));
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
