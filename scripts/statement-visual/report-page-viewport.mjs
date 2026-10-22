/**
 * DocumentElement.scrollWidth may include a horizontally scrollable descendant
 * even when every report shell boundary is clipped and fits the viewport.
 * Inspect the visible layout boundaries, not the intrinsic width of the chart.
 * Local scrollers must remain scrollable, rather than hidden or clipped.
 */
export function reportPageViewportExpression(listSelector = ".currency-report-list") {
  return `(() => {
    const viewportWidth = document.documentElement.clientWidth || innerWidth;
    const selectors = ['body', '.app-shell', '.main-area', 'main', ${JSON.stringify(listSelector)}];
    const boundaries = selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, present: false, fits: false };
      const box = element.getBoundingClientRect();
      const fits = box.left >= -1 && box.right <= viewportWidth + 1
        && element.clientWidth <= viewportWidth + 1
        && element.scrollWidth <= element.clientWidth + 1;
      return {
        selector, present: true, fits,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: box.left, right: box.right,
      };
    });
    const localScrollers = Array.from(document.querySelectorAll(
      '.report-trend, .evolution-table-scroll, .report-detail-layer .sf-table-wrap',
    )).map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const scrolls = element.scrollWidth > element.clientWidth + 1;
      return {
        selector: element.className,
        fits: box.left >= -1 && box.right <= viewportWidth + 1,
        scrolls,
        scrollEnabled: !scrolls || ['auto', 'scroll'].includes(style.overflowX),
      };
    });
    return {
      fits: boundaries.every((item) => item.fits)
        && localScrollers.every((item) => item.fits && item.scrollEnabled),
      boundaries,
      localScrollers,
      rootScrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
    };
  })()`;
}

/** Layout assertion: monetary text must not bleed into an adjacent trend point. */
export function trendMoneyTextFitExpression() {
  return `(() => {
    const values = Array.from(document.querySelectorAll('.cash-flow-block .report-trend-point .sf-money-value'));
    const violations = [];
    for (const value of values) {
      const point = value.closest('.report-trend-point');
      if (!point) { violations.push({ text: value.textContent, reason: 'no point' }); continue; }
      const bounds = point.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(value);
      const textRects = Array.from(range.getClientRects());
      if (textRects.length === 0 || textRects.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right - 8)) {
        violations.push({ text: value.textContent, pointLeft: bounds.left, pointRight: bounds.right,
          textRects: textRects.map((rect) => ({ left: rect.left, right: rect.right })) });
      }
    }
    return { fits: values.length > 0 && violations.length === 0, checked: values.length, violations };
  })()`;
}

