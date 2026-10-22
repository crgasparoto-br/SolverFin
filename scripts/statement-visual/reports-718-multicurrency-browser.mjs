import { join } from "node:path";
import { evaluate, screenshot, setViewport } from "./cdp.mjs";
import { reportPageViewportExpression } from "./report-page-viewport.mjs";

/** Chrome proof of independently scoped BRL and USD analytics across viewports. */
export async function validateMultiCurrency(cdp, month, context) {
  const { baseUrl, outputDir, screenshots, check, navigateWithRetry, waitForState } = context;
  const snapshots = [];
  for (const [width, height, label] of [
    [1366, 768, "desktop"],
    [390, 844, "mobile"],
    [320, 740, "mobile-small"],
  ]) {
    await setViewport(cdp, width, height);
    await navigateWithRetry(
      cdp,
      `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=12`,
      `reports multi-currency ${label}`,
    );
    await waitForState(cdp, "ready");
    const measurements = await evaluate(
      cdp,
      `(() => {
      const pageViewport = ${reportPageViewportExpression()};
      const blocks = Array.from(document.querySelectorAll('[data-report-analysis="a5"][data-currency]'));
      return {
        currencies: blocks.map((block) => block.getAttribute('data-currency')),
        currenciesComplete: ['BRL', 'USD'].every((currency) => {
          const block = blocks.find((item) => item.getAttribute('data-currency') === currency);
          if (!block) return false;
          const layers = Array.from(block.querySelectorAll('[data-analysis-layer]'))
            .map((layer) => layer.getAttribute('data-analysis-layer'));
          const money = Array.from(block.querySelectorAll('.sf-money[data-currency]'));
          return layers.join('|') === 'summary|visualization|highlights|detail'
            && money.length > 0
            && money.every((node) => node.getAttribute('data-currency') === currency)
            && Boolean(block.querySelector('[data-emphasis="true"]'));
        }),
        globalOverflow: !pageViewport.fits,
        pageViewport,
        tableScrollLocal: Array.from(document.querySelectorAll('.evolution-table-scroll'))
          .every((node) => node.scrollWidth > node.clientWidth && node.tabIndex === 0),
        trendFitsWithoutScroll: (() => {
          const trends = Array.from(document.querySelectorAll('.report-trend-grid'));
          return trends.length === 2 && trends.every((node) => {
            const frame = node.getBoundingClientRect();
            return node.tabIndex === 0 && node.scrollWidth <= node.clientWidth + 1
              && Array.from(node.children).every((point) => {
                const bounds = point.getBoundingClientRect();
                return bounds.left >= frame.left - 1 && bounds.right <= frame.right + 1;
              });
          });
        })(),
        matrixRowsCompact: Array.from(document.querySelectorAll('.evolution-table .report-section-row'))
          .every((row) => row.getBoundingClientRect().height <= 44),
        matrixRowHeights: Array.from(document.querySelectorAll('.evolution-table .report-section-row'))
          .map((row) => Math.round(row.getBoundingClientRect().height * 10) / 10),
        highlightsGrouped: blocks.every((block) => {
          const grid = block.querySelector('[data-analysis-layer="highlights"] .report-highlights-grid');
          return grid && grid.querySelectorAll('.report-highlight').length === 2
            && grid.querySelectorAll('.sf-alert').length === 1;
        }),
        longLabelsReadable: Array.from(document.querySelectorAll('.report-category-label > span:last-child'))
          .every((node) => getComputedStyle(node).textOverflow !== 'ellipsis'),
      };
    })()`,
    );
    // Preserve the opening viewport and independently capture every currency below
    // the fold. A screenshot of filters alone cannot attest monetary readability.
    const capturedSections = [];
    for (const currency of ["BRL", "USD"]) {
      for (const layer of ["summary", "visualization", "detail"]) {
        const section = await evaluate(
          cdp,
          `(() => {
            const block = Array.from(document.querySelectorAll('[data-report-analysis="a5"][data-currency]'))
              .find((candidate) => candidate.getAttribute('data-currency') === ${JSON.stringify(currency)});
            const target = block?.querySelector('[data-analysis-layer="${layer}"]');
            if (!block || !target) return { visible: false, correctCurrency: false, hasContent: false };
            target.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' });
            const bounds = target.getBoundingClientRect();
            const viewportHeight = document.documentElement.clientHeight;
            const visibleHeight = Math.max(0, Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0));
            const title = target.querySelector('.report-layer-heading h2, .report-layer-heading h3');
            const duplicateCurrency = Array.from(target.querySelectorAll('.sf-money-currency'))
              .some((item) => getComputedStyle(item).display !== 'none');
            const money = target.querySelectorAll('.sf-money[data-currency]');
            const hasContent = '${layer}' === 'summary'
              ? money.length > 0 && Array.from(money).every((item) => item.getAttribute('data-currency') === '${currency}')
              : '${layer}' === 'visualization'
                ? Boolean(target.querySelector('.report-trend'))
                : Boolean(target.querySelector('table, .sf-table-wrap'));
            return {
              visible: bounds.top >= -2 && bounds.top <= viewportHeight - 100 && visibleHeight >= 100,
              correctCurrency: title?.textContent?.endsWith(' - ${currency}') === true && !duplicateCurrency,
              hasContent,
              viewportTop: Math.round(bounds.top),
              visibleHeight: Math.round(visibleHeight),
            };
          })()`,
        );
        const sectionScreenshot = `reports-${label}-${width}x${height}-${currency.toLowerCase()}-${layer}.png`;
        await screenshot(cdp, join(outputDir, sectionScreenshot));
        screenshots.push(sectionScreenshot);
        check(section.visible, `${currency} ${layer} is not visible in ${label} evidence`, section);
        check(section.correctCurrency, `${currency} ${layer} lost the currency heading`, section);
        check(section.hasContent, `${currency} ${layer} has no inspectable content`, section);
        capturedSections.push({
          currency,
          layer,
          screenshot: sectionScreenshot,
          measurements: section,
        });
      }
    }
    // Return to the top so the original reference capture remains comparable.
    await evaluate(cdp, `window.scrollTo({ top: 0, behavior: 'instant' })`);
    const filename = `reports-multicurrency-${label}-${width}x${height}.png`;
    await screenshot(cdp, join(outputDir, filename));
    screenshots.push(filename);
    check(measurements.currencies.includes("BRL"), "Missing BRL block", measurements);
    check(measurements.currencies.includes("USD"), "Missing USD block", measurements);
    check(
      measurements.currenciesComplete,
      "Per-currency layers or Money values became mixed",
      measurements,
    );
    check(
      !measurements.globalOverflow,
      "Reports multi-currency page leaks horizontal overflow",
      measurements,
    );
    check(measurements.longLabelsReadable, "Reports category labels are truncated", measurements);
    check(
      measurements.trendFitsWithoutScroll,
      "Category trend still needs a horizontal scrollbar",
      measurements,
    );
    check(measurements.matrixRowsCompact, "Category matrix rows are too tall", measurements);
    check(
      measurements.highlightsGrouped,
      "Review highlights are not in a compact strip",
      measurements,
    );
    if (width <= 390) {
      check(
        measurements.tableScrollLocal,
        "Multi-currency mobile table lost local scroll",
        measurements,
      );
    }
    snapshots.push({
      viewport: `${width}x${height}`,
      screenshot: filename,
      measurements,
      capturedSections,
    });
  }
  // Layout de 12 meses em uma única linha constitui um breakpoint diferente
  // da prova mobile/tablet; reutilize a mesma fixture e navegador.
  await setViewport(cdp, 1600, 900);
  await navigateWithRetry(
    cdp,
    `${baseUrl}/relatorios?view=category-evolution&interval=monthly&start=${month}&periods=12`,
    "reports wide desktop 12 months",
  );
  await waitForState(cdp, "ready");
  const wideTrend = await evaluate(
    cdp,
    `(() => {
      const trends = Array.from(document.querySelectorAll('.report-trend-grid'));
      const details = trends.map((trend) => {
        const points = Array.from(trend.querySelectorAll('.report-trend-point'));
        const firstTop = points[0]?.getBoundingClientRect().top;
        const columns = getComputedStyle(trend).gridTemplateColumns.split(' ').filter(Boolean).length;
        const moneyFits = points.every((point) => {
          const amount = point.querySelector('.sf-money-value');
          if (!amount) return false;
          const rect = amount.getBoundingClientRect();
          const frame = point.getBoundingClientRect();
          return rect.left >= frame.left - 1 && rect.right <= frame.right + 1;
        });
        return {
          currency: trend.closest('[data-currency]')?.getAttribute('data-currency'),
          columns,
          points: points.length,
          oneRow: points.every((point) => Math.abs(point.getBoundingClientRect().top - firstTop) < 1),
          noOverflow: trend.scrollWidth <= trend.clientWidth + 1,
          moneyFits,
        };
      });
      return { fits: details.length === 2 && details.every((item) =>
        item.points === 12 && item.columns === 12 && item.oneRow
          && item.noOverflow && item.moneyFits), details };
    })()`,
  );
  const wideScreenshot = "reports-wide-desktop-twelve-months.png";
  await screenshot(cdp, join(outputDir, wideScreenshot));
  screenshots.push(wideScreenshot);
  check(
    wideTrend.fits,
    "The 12 monthly results wrap or their values overflow at 1600px",
    wideTrend,
  );
  return snapshots;
}
