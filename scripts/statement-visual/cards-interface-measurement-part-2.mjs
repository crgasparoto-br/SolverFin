export function cardsPageMeasurementExpressionPart2() {
  return `      const originalMetricBorder = metricItems[0]?.style.border || "";
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
    })()`;
}
