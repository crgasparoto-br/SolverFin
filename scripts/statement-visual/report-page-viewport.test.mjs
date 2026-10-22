import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { reportPageViewportExpression } from "./report-page-viewport.mjs";

function element(clientWidth, scrollWidth = clientWidth, overflowX = "clip") {
  return {
    clientWidth,
    scrollWidth,
    overflowX,
    className: "report-trend",
    getBoundingClientRect: () => ({ left: 0, right: clientWidth }),
  };
}

function evaluateMock(changes = {}) {
  const elements = {
    body: element(375),
    ".app-shell": element(375),
    ".main-area": element(375),
    main: element(375),
    ".currency-report-list": element(347),
    ".report-trend": element(332, 1728, "auto"),
  };
  for (const [selector, patch] of Object.entries(changes)) {
    Object.assign(elements[selector], patch);
  }
  const document = {
    documentElement: { clientWidth: 375, scrollWidth: 1611 },
    querySelector: (selector) => elements[selector],
    querySelectorAll: () => [elements[".report-trend"]],
  };
  return runInNewContext(reportPageViewportExpression(), {
    document,
    innerWidth: 375,
    getComputedStyle: (item) => ({ overflowX: item.overflowX }),
  });
}

test("accepts a contained viewport with independently scrollable financial charts", () => {
  const result = evaluateMock();
  assert.equal(result.rootScrollWidth, 1611);
  assert.equal(result.fits, true);
  assert.equal(result.localScrollers[0].scrolls, true);
});

test("rejects a genuine out-of-viewport layout, not just local scrolling", () => {
  assert.equal(evaluateMock({ main: { scrollWidth: 439 } }).fits, false);
  assert.equal(evaluateMock({ body: { scrollWidth: 450 } }).fits, false);
  const outside = { getBoundingClientRect: () => ({ left: 0, right: 450 }) };
  assert.equal(evaluateMock({ ".main-area": outside }).fits, false);
});

test("rejects hidden or clipped local charts and charts outside their viewport", () => {
  assert.equal(evaluateMock({ ".report-trend": { overflowX: "hidden" } }).fits, false);
  assert.equal(evaluateMock({ ".report-trend": { overflowX: "clip" } }).fits, false);
  const outside = { getBoundingClientRect: () => ({ left: 0, right: 500 }) };
  assert.equal(evaluateMock({ ".report-trend": outside }).fits, false);
});

test("fails closed if the report boundary is absent", () => {
  const elements = {
    body: element(375),
    ".app-shell": element(375),
    ".main-area": element(375),
    main: element(375),
  };
  const document = {
    documentElement: { clientWidth: 375, scrollWidth: 375 },
    querySelector: (selector) => elements[selector] ?? null,
    querySelectorAll: () => [],
  };
  const measured = runInNewContext(reportPageViewportExpression(), {
    document,
    innerWidth: 375,
    getComputedStyle: (item) => ({ overflowX: item.overflowX }),
  });
  assert.equal(measured.fits, false);
});

test("supports an explicit viewport boundary for cash-flow and SSR error states", () => {
  const elements = {
    body: element(375),
    ".app-shell": element(375),
    ".main-area": element(375),
    main: element(375),
    ".cash-flow-report-list": element(347),
  };
  const document = {
    documentElement: { clientWidth: 375, scrollWidth: 375 },
    querySelector: (selector) => elements[selector] ?? null,
    querySelectorAll: () => [],
  };
  const context = {
    document,
    innerWidth: 375,
    getComputedStyle: (item) => ({ overflowX: item.overflowX }),
  };
  assert.equal(runInNewContext(reportPageViewportExpression(".cash-flow-report-list"), context).fits, true);
  assert.equal(runInNewContext(reportPageViewportExpression(".report-analysis-state"), context).fits, false);
});
