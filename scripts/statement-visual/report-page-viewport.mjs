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
