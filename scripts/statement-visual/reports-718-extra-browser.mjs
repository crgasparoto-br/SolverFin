import { join } from "node:path";
import { evaluate, screenshot, setViewport } from "./cdp.mjs";
import { reportPageViewportExpression } from "./report-page-viewport.mjs";

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

/** Evidence from the real SSR cash-flow view, not category-evolution markup. */
export async function validateCashFlow(cdp, context) {
  const { baseUrl, outputDir, screenshots, check, navigateWithRetry, waitForState } = context;
  const referenceDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const route = `/relatorios?view=cash-flow&referenceDate=${referenceDate}&horizonDays=30`;
  const snapshots = [];
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [320, 740],
  ]) {
    const viewport = `${width}x${height}`;
    await setViewport(cdp, width, height);
    await navigateWithRetry(cdp, `${baseUrl}${route}`, `cash flow ${viewport}`);
    await waitForState(cdp, "ready");
    const measurements = await evaluate(
      cdp,
      `(() => {
      const blocks = Array.from(document.querySelectorAll('.cash-flow-block'));
      const viewport = ${reportPageViewportExpression(".cash-flow-report-list")};
      return {
        pageFitsViewport: viewport.fits,
        trendMoney: ${trendMoneyTextFitExpression()},
        blockCurrencies: blocks.map((block) => block.querySelector('.report-analysis-heading h2')?.textContent?.trim()),
        tableScrollLocal: blocks.every((block) => {
          const table = block.querySelector('.evolution-table-scroll');
          return table?.tabIndex === 0 && (innerWidth > 390 || table.scrollWidth > table.clientWidth + 1);
        }),
        trendScrollLocal: blocks.every((block) => {
          const trend = block.querySelector('.report-trend');
          return trend?.tabIndex === 0 && (innerWidth > 390 || trend.scrollWidth > trend.clientWidth + 1);
        }),
      };
    })()`,
    );
    check(measurements.pageFitsViewport, `Cash flow ${viewport} expands the page`, measurements);
    check(
      measurements.trendMoney.fits,
      `Cash flow ${viewport} trend values overlap adjacent columns`,
      measurements.trendMoney,
    );
    check(
      ["BRL", "USD"].every((currency) => measurements.blockCurrencies.includes(currency)),
      `Cash flow ${viewport} does not isolate BRL and USD`,
      measurements,
    );
    if (width <= 390) {
      check(
        measurements.tableScrollLocal,
        `Cash flow ${viewport} table cannot scroll locally`,
        measurements,
      );
      check(
        measurements.trendScrollLocal,
        `Cash flow ${viewport} trend cannot scroll locally`,
        measurements,
      );
    }
    const capturedSections = [];
    for (const currency of ["BRL", "USD"]) {
      for (const layer of ["summary", "visualization", "detail"]) {
        const section = await evaluate(
          cdp,
          `(() => {
          const block = document.getElementById(${JSON.stringify(`cash-flow-${currency.toLowerCase()}`)});
          const target = block?.querySelector('[data-analysis-layer="${layer}"]');
          if (!target) return { visible:false, correctCurrency:false, hasContent:false };
          target.scrollIntoView({ behavior:'instant', block:'start', inline:'nearest' });
          const bounds = target.getBoundingClientRect();
          const visibleHeight = Math.max(0, Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0));
          const money = Array.from(target.querySelectorAll('.sf-money[data-currency]'));
          const correctCurrency = block.querySelector('.report-analysis-heading h2')?.textContent?.trim() === '${currency}'
            && money.every((item) => item.getAttribute('data-currency') === '${currency}');
          const hasContent = '${layer}' === 'visualization'
            ? Boolean(target.querySelector('.report-trend .report-trend-point'))
            : '${layer}' === 'detail'
              ? Boolean(target.querySelector('table.cash-flow-table tbody tr')) && money.length > 0
              : money.length >= 2;
          return { visible: bounds.top >= -2 && bounds.top < innerHeight - 80 && visibleHeight >= 80,
            correctCurrency, hasContent, monetaryNodes: money.length };
        })()`,
        );
        const screenshotName = `reports-cash-flow-${viewport}-${currency.toLowerCase()}-${layer}.png`;
        await screenshot(cdp, join(outputDir, screenshotName));
        screenshots.push(screenshotName);
        check(
          section.visible && section.correctCurrency && section.hasContent,
          `Cash flow ${viewport} ${currency} ${layer} is not inspectable`,
          section,
        );
        capturedSections.push({
          currency,
          layer,
          screenshot: screenshotName,
          measurements: section,
        });
      }
    }
    const moneyNegativeControl =
      width === 320
        ? await evaluate(
            cdp,
            `(() => {
              const target = document.querySelector('.cash-flow-block .report-trend-point .sf-money-value');
              if (!target) return { observed: false, restored: false, baseline: false };
              const before = target.getAttribute('style');
              const originalText = target.textContent;
              const baseline = ${trendMoneyTextFitExpression()}.fits;
              target.textContent = originalText + ' 999999999999999999999999999999999999999';
              target.style.display = 'inline-block';
              target.style.minWidth = '1000px';
              target.style.whiteSpace = 'nowrap';
              target.style.wordBreak = 'normal';
              target.style.overflowWrap = 'normal';
              const observed = !${trendMoneyTextFitExpression()}.fits;
              target.textContent = originalText;
              if (before === null) target.removeAttribute('style');
              else target.setAttribute('style', before);
              const restored = ${trendMoneyTextFitExpression()}.fits;
              return { baseline, observed, restored };
            })()`,
          )
        : null;
    if (moneyNegativeControl) {
      check(
        moneyNegativeControl.baseline &&
          moneyNegativeControl.observed &&
          moneyNegativeControl.restored,
        `Cash flow ${viewport} negative control missed monetary overlap`,
        moneyNegativeControl,
      );
    }
    snapshots.push({ viewport, route, measurements, capturedSections, moneyNegativeControl });
  }
  return snapshots;
}

/** Capture actual empty, invalid-filter and retryable API error in both mobile widths. */
export async function validateMobileStates(cdp, context) {
  const { baseUrl, outputDir, screenshots, check, navigateWithRetry, waitForState } = context;
  const scenarios = [
    {
      state: "empty",
      route: "/relatorios?view=category-evolution&interval=monthly&start=2099-01&periods=1",
    },
    {
      state: "filter-error",
      route: "/relatorios?view=category-evolution&interval=quarterly&start=2026-13&periods=abc",
    },
    {
      state: "api-error",
      route:
        "/relatorios?view=category-evolution&interval=monthly&start=2099-01&periods=1&cardId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ];
  const snapshots = [];
  for (const [width, height] of [
    [390, 844],
    [320, 740],
  ]) {
    const viewport = `${width}x${height}`;
    for (const scenario of scenarios) {
      await setViewport(cdp, width, height);
      await navigateWithRetry(cdp, `${baseUrl}${scenario.route}`, `${scenario.state} ${viewport}`);
      await waitForState(cdp, scenario.state);
      const measurements = await evaluate(
        cdp,
        `(() => {
        const section = document.querySelector('.report-analysis-state [data-analysis-layer="summary"]');
        section?.scrollIntoView({ behavior:'instant', block:'start', inline:'nearest' });
        const bounds = section?.getBoundingClientRect();
        const retry = document.querySelector('.report-retry');
        return {
          state: document.querySelector('[data-report-state]')?.getAttribute('data-report-state'),
          pageFitsViewport: ${reportPageViewportExpression(".report-analysis-state")}.fits,
          visible: Boolean(bounds && bounds.top >= -2 && bounds.top < innerHeight - 60),
          hasReadyReport: Boolean(document.querySelector('[data-report-state="ready"]')),
          retryHref: retry?.getAttribute('href') ?? null,
          invalidControls: document.querySelectorAll('[aria-invalid="true"], [data-invalid-filter]').length,
        };
      })()`,
      );
      const screenshotName = `reports-${scenario.state}-${viewport}.png`;
      await screenshot(cdp, join(outputDir, screenshotName));
      screenshots.push(screenshotName);
      check(
        measurements.state === scenario.state &&
          measurements.pageFitsViewport &&
          measurements.visible,
        `${scenario.state} ${viewport} is not accessible inside the viewport`,
        measurements,
      );
      check(
        !measurements.hasReadyReport,
        `${scenario.state} ${viewport} leaks partial results`,
        measurements,
      );
      if (scenario.state === "api-error") {
        check(
          measurements.retryHref === scenario.route,
          `API error ${viewport} lost its recoverable URL`,
          measurements,
        );
      }
      if (scenario.state === "filter-error") {
        check(
          measurements.invalidControls >= 3,
          `Invalid filter ${viewport} loses error descriptions`,
          measurements,
        );
      }
      snapshots.push({
        viewport,
        state: scenario.state,
        route: scenario.route,
        screenshot: screenshotName,
        measurements,
      });
    }
  }
  return snapshots;
}
