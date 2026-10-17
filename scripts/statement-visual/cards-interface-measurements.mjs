import { join } from "node:path";
import { evaluate, screenshot } from "./cdp.mjs";

export async function validateCardsPage(
  cdp,
  viewportKind,
  captureName = viewportKind,
  { check, outputDir, validateFirstFoldNegativeControl },
) {
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
      const originalActionMinHeight = action?.style.minHeight || '';
      const originalActionMinWidth = action?.style.minWidth || '';
      if (action) {
        action.style.height = '30px';
        action.style.width = '30px';
        action.style.minHeight = '30px';
        action.style.minWidth = '30px';
      }
      const actionTargetNegativeRejected = Boolean(action && (rect(action).height < 44 || rect(action).width < 44));
      if (action) {
        action.style.height = originalActionHeight;
        action.style.width = originalActionWidth;
        action.style.minHeight = originalActionMinHeight;
        action.style.minWidth = originalActionMinWidth;
      }
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
      const purchaseHeader = document.querySelector('.cards-purchase-section-header');
      const purchaseTrigger = purchaseHeader?.querySelector('[data-open-modal="purchase"]');
      const closeTrigger = header?.querySelector('[data-api-path$="/close"]');
      const payTrigger = header?.querySelector('[data-open-modal="payment"]');
      const documentsTrigger = header?.querySelector('[data-open-modal="invoice-attachments"]');
      const secondaryActions = header?.querySelector('.cards-invoice-secondary-actions');
      const invoiceFacts = Array.from(header?.querySelectorAll('.cards-invoice-metadata > div') || []);
      const invoiceFactsReadable = invoiceFacts.length === 3 && invoiceFacts.every(
        (fact) => visible(fact.querySelector('dt')) && visible(fact.querySelector('dd')),
      );
      const primaryDecision = header?.querySelector('.cards-invoice-primary');
      const invoiceContext = header?.querySelector('.cards-invoice-title-block');
      const primaryAmount = header?.querySelector('.cards-invoice-primary > strong');
      const invoiceAmountLeads = Boolean(
        primaryDecision && invoiceContext &&
        (window.innerWidth <= 760
          ? rect(primaryDecision).bottom <= rect(invoiceContext).top + 1
          : rect(primaryDecision).left < rect(invoiceContext).left)
      );
      const invoiceSecondaryFooter = Boolean(
        secondaryActions && primaryDecision && invoiceContext &&
        rect(secondaryActions).top >=
          Math.max(rect(primaryDecision).bottom, rect(invoiceContext).bottom) - 1
      );
      const mobileInvoiceActionsCompact = window.innerWidth > 760 || Boolean(
        secondaryActions && documentsTrigger && closeTrigger &&
        getComputedStyle(secondaryActions).display === 'grid' &&
        Math.abs(rect(documentsTrigger).top - rect(closeTrigger).top) < 3
      );
      const payNextToAmount = Boolean(
        primaryAmount &&
        (!payTrigger || (window.innerWidth <= 430
          ? rect(payTrigger).top >= rect(primaryAmount).bottom - 1
          : Math.abs(rect(payTrigger).bottom - rect(primaryAmount).bottom) < 25))
      );
      const invoiceActionsSeparated = Boolean(
        secondaryActions &&
        (!payTrigger ||
          rect(secondaryActions).right <= rect(payTrigger).left + 1 ||
          rect(payTrigger).bottom <= rect(secondaryActions).top + 1)
      );
      const actionsBelongToContext = Boolean(
        visible(purchaseTrigger) &&
        purchaseHeader?.querySelector('h3')?.textContent.trim() === 'Itens da fatura' &&
        (!closeTrigger || closeTrigger.closest('.cards-invoice-secondary-actions')) &&
        (!payTrigger || payTrigger.closest('.cards-invoice-primary')) &&
        documentsTrigger?.closest('.cards-invoice-secondary-actions') &&
        !secondaryActions?.querySelector('.sf-button-primary') &&
        !document.querySelector('.cards-reconciliation-filters [data-open-modal="purchase"]') &&
        !document.querySelector('.sf-page-header [data-open-modal="purchase"]') &&
        !document.querySelector('.cards-invoice-document-link')
      );
      const master = document.querySelector('.cards-master-panel');
      const detail = document.querySelector('.cards-detail-panel');
      const detailLayout = document.querySelector('.cards-a3-page .sf-detail-layout');
      const page = document.querySelector('.cards-a3-page');
      const main = document.querySelector('.main-area > main');
      const mainContentWidth = () => {
        if (!main) return 0;
        const style = getComputedStyle(main);
        return rect(main).width - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
      };
      const widthMatchesShell = () => Boolean(page && main && Math.abs(rect(page).width - mainContentWidth()) <= 2);
      const widthBefore = widthMatchesShell();
      const previousWidthCap = page?.style.maxWidth || '';
      if (page && window.innerWidth >= 1600) page.style.maxWidth = '1300px';
      const narrowerPageRejected = window.innerWidth < 1600 || !widthMatchesShell();
      if (page) page.style.maxWidth = previousWidthCap;
      const widthRestored = widthMatchesShell();
      const sidebarGeometryValid = () => Boolean(master && detail &&
        rect(master).width >= 220 && rect(master).width <= 290 &&
        rect(master).right + 10 <= rect(detail).left &&
        Math.abs(rect(master).top - rect(detail).top) <= 2);
      const sidebarBefore = sidebarGeometryValid();
      const originalGridColumns = detailLayout?.style.gridTemplateColumns || '';
      if (detailLayout && window.innerWidth >= 1000) detailLayout.style.gridTemplateColumns = 'minmax(0,1fr)';
      const sidebarNegativeRejected = window.innerWidth < 1000 || !sidebarGeometryValid();
      if (detailLayout) detailLayout.style.gridTemplateColumns = originalGridColumns;
      const sidebarRestored = window.innerWidth < 1000 || sidebarGeometryValid();
      const masterFactsVisible = visible(master?.querySelector('.cards-master-meta dt')) &&
        visible(master?.querySelector('.cards-instrument-nav li'));

      const firstPurchaseRow = rows[0];
      const firstPurchaseDescription = firstPurchaseRow?.querySelector('.cards-purchase-description strong');
      const firstPurchaseAmount = firstPurchaseRow?.querySelector('.cards-purchase-amount');
      const firstPurchaseLegible = Boolean(firstPurchaseRow && [firstPurchaseDescription, firstPurchaseAmount].every(
        (node) => visible(node) && rect(node).top >= 0 &&
          rect(node).bottom <= window.innerHeight - 12 &&
          rect(node).left >= rect(firstPurchaseRow).left - 1 &&
          rect(node).right <= rect(firstPurchaseRow).right + 1
      ));
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
      const monthTitle = currentPeriod?.querySelector('strong');
      const monthTitleSingleLine = window.innerWidth > 760 || Boolean(
        monthTitle &&
        rect(monthTitle).height < 24 &&
        rect(monthTitle).left >= rect(currentPeriod).left - 1 &&
        rect(monthTitle).right <= rect(currentPeriod).right + 1
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
      const invoiceCopy = document.querySelector('.cards-invoice-metadata')?.textContent || '';
      const settlementCopy = document.querySelector('.cards-settlement-note')?.textContent || '';
      const currencies = Array.from(document.querySelectorAll('.sf-money[data-currency]')).map((node) => node.getAttribute('data-currency'));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        archetype: document.querySelector('[data-cards-archetype]')?.getAttribute('data-cards-archetype') || '',
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        masterVisible: visible(master),
        detailVisible: visible(detail),
        invoiceHeaderVisible: visible(header),
        actionsBelongToContext,
        invoiceActionsSeparated,
        invoiceAmountLeads,
        invoiceSecondaryFooter,
        mobileInvoiceActionsCompact,
        monthTitleSingleLine,
        payNextToAmount,
        invoiceFactsReadable,
        primaryAmountVisible: visible(primaryAmount),
        primaryAmountTop: rect(primaryAmount).top,
        firstPurchaseRowTop: rect(firstPurchaseRow).top,
        firstPurchaseRowBottom: rect(firstPurchaseRow).bottom,
        firstPurchaseDescriptionBottom: rect(firstPurchaseDescription).bottom,
        firstPurchaseAmountBottom: rect(firstPurchaseAmount).bottom,
        firstPurchaseLegible,
        masterBottom: rect(master).bottom,
        masterWidth: rect(master).width,
        detailWidth: rect(detail).width,
        pageWidth: rect(page).width,
        mainWidth: rect(main).width,
        mainContentWidth: mainContentWidth(),
        fullWidthUsesCanonicalShell: widthBefore && widthRestored && narrowerPageRejected,
        sidebarBefore,
        sidebarNegativeRejected: sidebarNegativeRejected && sidebarRestored,
        masterFactsVisible,
        invoiceHeaderTop: rect(header).top,
        statusVisible: visible(status),
        searchVisible: visible(search),
        searchHeight: rect(search).height,
        periodsDoNotOverlap,
        monthPopupInsideViewport: popupInsideViewport,
        monthPopupNegativeRejected: popupNegativeRejected && popupRestored,
        monthPopupRect: popupRect,
        periodNavigationRects: [previousPeriod, currentPeriod, nextPeriod].map(rect),
        heroAction: rect(Array.from(document.querySelectorAll('[data-open-modal="purchase"]')).find(visible)),
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
    measurements.fullWidthUsesCanonicalShell,
    "Golden Screen: cards must fill the canonical main area without a narrower page cap",
    measurements,
  );
  check(
    measurements.masterVisible && measurements.detailVisible,
    "Master-detail hierarchy is incomplete",
    measurements,
  );
  check(measurements.invoiceHeaderVisible, "Selected invoice context is not visible", measurements);
  check(
    measurements.invoiceFactsReadable,
    "Invoice closing, due date or currency is unreadable",
    measurements,
  );
  check(
    measurements.invoiceActionsSeparated,
    "Invoice primary and secondary actions overlap",
    measurements,
  );
  check(
    measurements.invoiceAmountLeads && measurements.payNextToAmount,
    "Invoice value must lead and settlement must remain attached to it",
    measurements,
  );
  check(
    measurements.invoiceSecondaryFooter,
    "Invoice secondary operations must stay in the footer below the decision",
    measurements,
  );
  check(
    measurements.mobileInvoiceActionsCompact,
    "Mobile invoice actions are not aligned",
    measurements,
  );
  check(
    measurements.monthTitleSingleLine,
    "Selected month wraps or overflows on mobile",
    measurements,
  );
  check(
    measurements.actionsBelongToContext,
    "Golden Screen: register, document, close and settle actions must stay with their respective context",
    measurements,
  );
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
    measurements.minimumActionTarget >= 44 &&
      measurements.actionTargetBefore &&
      measurements.actionTargetNegativeRejected,
    "Golden Screen: purchase menu actions need 44px touch targets and a rejecting negative control",
    measurements,
  );
  check(
    measurements.shellIsLight &&
      measurements.shellNegativeRejected &&
      measurements.noRepeatedHeader,
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
      measurements.firstPurchaseLegible &&
        measurements.firstPurchaseRowBottom <= measurements.viewport.height - 12,
      "Golden Screen: the full first purchase (description and amount) must be readable in the first desktop fold",
      measurements,
    );
    check(
      measurements.sidebarBefore &&
        measurements.sidebarNegativeRejected &&
        measurements.masterFactsVisible,
      "Golden Screen: card information must be visible in a separate left panel; stacking is a regression",
      measurements,
    );
    check(
      measurements.detailWidth >= 600,
      "Golden Screen: restoring the left panel must not crush the invoice or purchase table",
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
      measurements.primaryAmountTop < measurements.viewport.height * 0.62 &&
        measurements.primaryAmountTop - measurements.invoiceHeaderTop < 88,
      "Golden Screen: invoice amount must lead the mobile invoice decision without preceding metadata blocks",
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
