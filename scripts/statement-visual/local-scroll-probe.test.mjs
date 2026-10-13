import assert from "node:assert/strict";
import test from "node:test";

import { probeLocalHorizontalScroll } from "./local-scroll-probe.mjs";

function fixture(overflowX = "auto", expandsDocument = false) {
  const root = { scrollWidth: 320 };
  let appended = false;
  const element = {
    clientWidth: 200,
    scrollWidth: 200,
    scrollLeft: 5,
    scrollTop: 7,
    ownerDocument: {
      documentElement: root,
      defaultView: { getComputedStyle: () => ({ overflowX }) },
      createElement: () => ({
        setAttribute() {},
        style: {},
        remove() {
          appended = false;
          element.scrollWidth = 200;
          root.scrollWidth = 320;
        },
      }),
    },
    append() {
      appended = true;
      element.scrollWidth = 264;
      if (expandsDocument) root.scrollWidth = 500;
    },
  };
  return { element, appended: () => appended };
}

test("fitting tables are exercised with wide content and restored", () => {
  const { element, appended } = fixture();
  const result = probeLocalHorizontalScroll(element);
  assert.equal(result.passed, true);
  assert.ok(result.probeScrollWidth > result.clientWidth);
  assert.equal(appended(), false);
  assert.equal(element.scrollWidth, 200);
  assert.equal(element.scrollLeft, 5);
  assert.equal(element.scrollTop, 7);
});

test("visible or hidden overflow cannot satisfy local scrolling", () => {
  for (const overflow of ["visible", "hidden", "clip"]) {
    assert.equal(probeLocalHorizontalScroll(fixture(overflow).element).passed, false);
  }
});

test("document expansion is rejected even when the table scrolls", () => {
  const { element, appended } = fixture("auto", true);
  assert.equal(probeLocalHorizontalScroll(element).passed, false);
  assert.equal(appended(), false);
});

test("an invisible or absent table is not evidence", () => {
  assert.equal(probeLocalHorizontalScroll(null).passed, false);
  const { element } = fixture();
  element.clientWidth = 0;
  assert.equal(probeLocalHorizontalScroll(element).passed, false);
});
