export function measurementExpression() {
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

export function negativeControlExpression() {
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
