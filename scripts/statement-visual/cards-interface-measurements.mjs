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
        document.querySelectorAll('[data-purchase-item] [data-purchase-status-control] > summary > .cards-purchase-status'),
      );
      const statusIconContract =
        statuses.length === rows.length &&
        statuses.every((node) => {
          const svg = node.querySelector('svg[aria-hidden="true"]');
          const row = node.closest('[data-purchase-item]');
          const reconciled = row?.dataset.reconciliation === 'reconciled';
          const isReconciled = node.classList.contains('cards-purchase-status-reconciled');
          const control = node.closest('[data-purchase-status-control]');
          const trigger = control?.querySelector(':scope > summary');
          const menu = control?.querySelector('.cards-purchase-status-menu');
          const canChange = trigger?.getAttribute('aria-label')?.includes('Alterar situação');
          const action = menu?.querySelector('[data-set-purchase-status]');
          const readonly = menu?.querySelector('.cards-purchase-status-readonly');
          return (
            Boolean(svg) &&
            visible(svg) &&
            Boolean(node.getAttribute('aria-label')) &&
            node.getAttribute('aria-label') === node.getAttribute('title') &&
            node.getAttribute('aria-label') === node.dataset.tooltip &&
            node.textContent.trim() === '' &&
            node.getAttribute('role') === 'img' &&
            trigger?.tabIndex === 0 &&
            trigger?.getAttribute('aria-label')?.includes(node.getAttribute('aria-label')) &&
            rect(trigger).width >= 44 && rect(trigger).height >= 44 &&
            Boolean(menu) &&
            (canChange
              ? Boolean(action && action.querySelector('.cards-purchase-status svg[aria-hidden="true"]') && !readonly)
              : Boolean(readonly && !action)) &&
            reconciled === isReconciled
          );
        });
      const actionableStatus = Array.from(
        document.querySelectorAll('[data-purchase-status-control]'),
      ).find((node) => node.querySelector('[data-set-purchase-status]'));
      const actionableTrigger = actionableStatus?.querySelector(':scope > summary');
      const actionableMenu = actionableStatus?.querySelector('.cards-purchase-status-menu');
      if (actionableTrigger) actionableTrigger.click();
      const statusMenuOperable = Boolean(
        actionableStatus?.open && actionableMenu && visible(actionableMenu) &&
        Array.from(actionableMenu.querySelectorAll('[data-set-purchase-status]')).every(
          (button) => rect(button).height >= 44 && visible(button),
        ) &&
        rect(actionableMenu).left >= -1 &&
        rect(actionableMenu).right <= window.innerWidth + 1,
      );
      if (actionableStatus) actionableStatus.open = false;
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
      const instrumentDisclosure = master?.querySelector('.cards-instrument-nav');
      const disclosureOriginallyOpen = Boolean(instrumentDisclosure?.open);
      if (instrumentDisclosure) instrumentDisclosure.open = true;
      const instrumentLimitRows = Array.from(
        instrumentDisclosure?.querySelectorAll('li:has(.cards-instrument-limit)') || [],
      );
      const instrumentLimitsBelowIdentity = instrumentLimitRows.length > 0 &&
        instrumentLimitRows.every((row) => {
          const identity = row.querySelector('.cards-instrument-name');
          const limit = row.querySelector('.cards-instrument-limit');
          const copy = row.querySelector('.cards-instrument-copy');
          return Boolean(
            identity && limit && copy &&
            visible(identity) && visible(limit) &&
            limit.textContent.trim().startsWith('Limite ') &&
            rect(limit).top >= rect(identity).bottom - 1 &&
            rect(limit).left >= rect(copy).left - 1 &&
            rect(limit).right <= rect(copy).right + 1
          );
        });
      if (instrumentDisclosure) instrumentDisclosure.open = disclosureOriginallyOpen;
      const financialSummary = document.querySelector(".cards-invoice-summary");
      const metricItems = Array.from(financialSummary?.querySelectorAll(".cards-summary-metric") || []);
      const metricTileFree = () => metricItems.length === 4 && metricItems.every((metric) => {
        const style = getComputedStyle(metric);
        const hasFullTileFrame =
          parseFloat(style.borderTopWidth) > 0 &&
          parseFloat(style.borderRightWidth) > 0 &&
          parseFloat(style.borderBottomWidth) > 0;
        return !metric.querySelector(".cards-summary-icon") && !hasFullTileFrame;
      });
      const summaryBefore = metricTileFree();
      const originalMetricBorder = metricItems[0]?.style.border || "";
      if (metricItems[0]) metricItems[0].style.border = "2px solid rgb(19, 33, 50)";
      const metricTileNegativeRejected = !metricTileFree();
      if (metricItems[0]) metricItems[0].style.border = originalMetricBorder;
      const summaryUnboxed = summaryBefore && metricTileNegativeRejected && metricTileFree();
      const mobileContextConcise = window.innerWidth > 760 || Boolean(
        master && rect(master).height < 150 &&
        !visible(master.querySelector(".cards-card-identity>div strong")),
      );
      const mobileSummaryConcise = window.innerWidth > 760 || Boolean(
        financialSummary &&
        rect(financialSummary).height < (window.innerWidth <= 350 ? 215 : 165),
      );

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
        const instrument = row.querySelector(':scope > .cards-purchase-instrument[role="cell"]');
        const description = row.querySelector(':scope > .cards-purchase-description[role="cell"]');
        const arrow = category?.querySelector('svg[aria-hidden="true"]');
        const label = category?.querySelector('.cards-purchase-category-label');
        return Boolean(
          cells.length === 7 &&
          category && description && instrument && visible(instrument) &&
          category.dataset.categoryDirection === (row.querySelector('.cards-purchase-amount.is-negative') ? 'in' : 'out') &&
          arrow?.querySelector('path[d="M10 3.5v12"]') &&
          visible(arrow) &&
          label?.textContent.trim() &&
          visible(label) &&
          !description.contains(category) &&
          visible(category)
        );
      });
      // Assert all three visual tones without fabricating financial movements.
      const categoryBadge = firstCategory?.querySelector('.cards-purchase-category-badge');
      const colorProbe = document.createElement('span');
      colorProbe.style.position = 'absolute';
      document.body.append(colorProbe);
      const tokenBackground = (token) => {
        colorProbe.style.backgroundColor = 'var(' + token + ')';
        return getComputedStyle(colorProbe).backgroundColor;
      };
      const backgroundByDirection = {
        in: tokenBackground('--success-bg'),
        out: tokenBackground('--danger-bg'),
        transfer: tokenBackground('--neutral-control-hover'),
      };
      colorProbe.remove();
      const originalCategoryDirection = firstCategory?.dataset.categoryDirection;
      const categoryBadgeBackground = () =>
        categoryBadge ? getComputedStyle(categoryBadge).backgroundColor : '';
      const directionFillsMatch = Boolean(
        firstCategory && categoryBadge &&
        Object.entries(backgroundByDirection).every(([direction, expected]) => {
          firstCategory.dataset.categoryDirection = direction;
          return expected !== 'rgba(0, 0, 0, 0)' &&
            categoryBadgeBackground() === expected;
        })
      );
      if (firstCategory && originalCategoryDirection) {
        firstCategory.dataset.categoryDirection = originalCategoryDirection;
      }
      const categoryToneContract = Boolean(
        purchaseCategoryContract &&
        originalCategoryDirection === (firstCategory?.closest('[data-purchase-item]')?.querySelector('.cards-purchase-amount.is-negative') ? 'in' : 'out') &&
        directionFillsMatch &&
        categoryBadgeBackground() === backgroundByDirection[originalCategoryDirection] &&
        rect(categoryBadge).width > 0 &&
        rect(categoryBadge).right <= rect(firstCategory).right + 1 &&
        !getComputedStyle(firstCategory).backgroundColor.includes('254, 242, 242')
      );
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
        instrumentLimitsBelowIdentity,
        summaryUnboxed,
        summaryHeight: rect(financialSummary).height,
        mobileContextConcise,
        mobileSummaryConcise,
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
        categoryToneContract,
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
        statusMenuOperable,
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
    measurements.categoryToneContract,
    "Category backgrounds must match Extrato: green in, red out, gray transfer",
    measurements,
  );
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
  check(
    measurements.instrumentLimitsBelowIdentity,
    "Instrument limits must appear below identifiers and start with Limite",
    measurements,
  );
  check(
    measurements.iconOnlyPurchaseStatuses && measurements.statusMenuOperable,
    "Purchase status icon must open an accessible, correctly placed reconciliation menu",
    measurements,
  );
  check(measurements.invoiceHeaderVisible, "Selected invoice context is not visible", measurements);
  check(
    measurements.summaryUnboxed,
    "Design skill: summary metrics must not regress into bordered tile cards",
    measurements,
  );
  check(
    measurements.mobileContextConcise && measurements.mobileSummaryConcise,
    "Design skill: mobile card selection or summary wastes first-fold space",
    measurements,
  );
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

  // Regression: the global button:hover rule must never turn a contextual action
  // into a dark primary button with unreadable dark text.
  const hoverTarget = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('.cards-purchase-status-menu [data-set-purchase-status]:not(:disabled)');
      const details = button?.closest('[data-purchase-status-control]');
      if (!button || !details) return null;
      details.open = true;
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        visible: rect.width >= 44 && rect.height >= 44 &&
          rect.top >= 0 && rect.bottom <= window.innerHeight &&
          rect.left >= 0 && rect.right <= window.innerWidth,
      };
    })()`,
  );
  check(
    Boolean(hoverTarget?.visible),
    "Status menu action is outside the visible viewport",
    hoverTarget,
  );
  if (hoverTarget?.visible) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: hoverTarget.x,
      y: hoverTarget.y,
    });
    const hover = await evaluate(
      cdp,
      `(() => {
        const button = document.querySelector('.cards-purchase-status-menu [data-set-purchase-status]:not(:disabled)');
        if (!button) return { hovered: false };
        const probe = document.createElement('span');
        probe.style.background = 'var(--neutral-control-hover)';
        probe.style.color = 'var(--neutral-control-text-hover)';
        document.body.append(probe);
        const expectedBackground = getComputedStyle(probe).backgroundColor;
        const expectedForeground = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(button);
        const background = style.backgroundColor;
        const foreground = style.color;
        const luminance = (value) => {
          const rgb = value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
          const channels = rgb.map((value) => {
            const normalized = value / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        // A transparent action is painted over its ancestors, not over black.
        const ancestors = [];
        for (let node = button; node; node = node.parentElement) ancestors.unshift(node);
        let compositedRgb = [255, 255, 255];
        for (const node of ancestors) {
          const channels = (getComputedStyle(node).backgroundColor.match(/[\\d.]+/g) || []).map(Number);
          if (channels.length < 3) continue;
          const alpha = channels[3] ?? 1;
          compositedRgb = compositedRgb.map((value, index) =>
            channels[index] * alpha + value * (1 - alpha)
          );
        }
        const effectiveBackground = 'rgb(' + compositedRgb.map(Math.round).join(', ') + ')';
        const a = luminance(effectiveBackground);
        const b = luminance(foreground);
        return {
          hovered: button.matches(':hover'),
          enabled: !button.disabled,
          background,
          effectiveBackground,
          compositedRgb,
          foreground,
          expectedBackground,
          expectedForeground,
          contrastRatio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      })()`,
    );
    check(
      hover.hovered &&
        hover.enabled &&
        hover.contrastRatio >= 4.5 &&
        hover.compositedRgb.every((value) => value >= 210),
      "Golden Screen status option must remain light with readable text on hover",
      hover,
    );
    measurements.statusMenuHover = hover;
    await screenshot(cdp, join(outputDir, `cards-status-menu-${captureName}.png`));
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await evaluate(
      cdp,
      `document.querySelectorAll('[data-purchase-status-control]').forEach((node) => { node.open = false; })`,
    );
  }
  return measurements;
}
