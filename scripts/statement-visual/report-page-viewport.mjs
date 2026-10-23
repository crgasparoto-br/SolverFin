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

/** Selected filter text fits the *visible native field*, not just its page boundary. */
export function reportSelectedFilterFitExpression(selector) {
  return `(() => {
    const form = document.querySelector(${JSON.stringify(selector)});
    if (!form) return { fits: false, reason: 'missing filter form', controls: [] };
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const controls = Array.from(form.querySelectorAll('input:not([type="hidden"]), select')).map((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      let label = node.tagName === 'SELECT' ? (node.selectedOptions[0]?.textContent?.trim() || '') : node.value;
      if (node.type === 'month' && /^\\d{4}-\\d{2}$/.test(node.value)) {
        label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
          .format(new Date(node.value + '-01T12:00:00'));
      } else if (node.type === 'date' && /^\\d{4}-\\d{2}-\\d{2}$/.test(node.value)) {
        label = new Intl.DateTimeFormat('pt-BR').format(new Date(node.value + 'T12:00:00'));
      }
      context.font = style.font;
      const labelWidth = context.measureText(label).width;
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const nativeChrome = node.tagName === 'SELECT' || node.type === 'date' || node.type === 'month' ? 32 : 4;
      const available = rect.width - padding - nativeChrome;
      return { name: node.name, label, width: rect.width, labelWidth, available,
        fits: Boolean(label) && rect.width > 0 && labelWidth <= available + 1 };
    });
    return { fits: controls.length > 0 && controls.every((control) => control.fits),
      controls, columns: getComputedStyle(form).gridTemplateColumns.split(' ').filter(Boolean).length };
  })()`;
}
