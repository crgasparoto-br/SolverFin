export function cardsPageMeasurementExpressionPart1() {
  return `(() => {
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
`;
}
