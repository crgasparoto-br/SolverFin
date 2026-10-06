import assert from "node:assert/strict";

/** Financial values are observed, never reconstructed from the design image. */
export function assertMockupComposition(layout) {
  for (const key of ["heading", "context", "balance", "summary", "list"]) {
    const box = layout[key];
    assert.ok(box && box.width > 0 && box.height > 0, `Missing mockup region: ${key}`);
  }
  assert.equal(layout.sameHeading, true, "Account and balance must share one header.");
  assert.equal(layout.overflow, false, "Mockup composition overflows the document.");
  assert.equal(layout.primaryCount, 1, "Only one quick action should be exposed initially.");
  assert.equal(layout.secondaryCount, 2, "Secondary quick actions must remain available.");
  assert.equal(layout.menuOpen, false, "Secondary actions should start collapsed.");
  assert.ok(layout.summary.width >= layout.list.width - 64, "Summary regressed to a sidebar.");
  if (layout.viewport.width <= 760) {
    assert.ok(
      layout.list.top <= layout.viewport.height * 0.94,
      "Mobile chrome pushes the movement list below the first-viewport density budget.",
    );
  }
  if (layout.viewport.width > 760) {
    assert.ok(
      layout.context.right <= layout.balance.left + 1,
      "Desktop account and balance must be side by side.",
    );
    assert.ok(
      Math.min(layout.context.bottom, layout.balance.bottom) >
        Math.max(layout.context.top, layout.balance.top),
      "Desktop header lost its horizontal hierarchy.",
    );
  } else {
    assert.ok(
      layout.balance.top >= layout.context.bottom - 1,
      "Mobile must keep account before balance without overlap.",
    );
  }
}

export function measureMockupComposition() {
  const root = document.querySelector('[data-golden-screen="statement"]');
  const heading = root?.querySelector(".statement-account-heading");
  const context = root?.querySelector(".statement-context");
  const balance = root?.querySelector(".summary-balance");
  const menu = root?.querySelector(".statement-secondary-actions");
  const rect = (element) => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  };
  return {
    viewport: { width: innerWidth, height: innerHeight },
    heading: rect(heading),
    context: rect(context),
    balance: rect(balance),
    summary: rect(root?.querySelector(".account-summary")),
    list: rect(root?.querySelector(".statement-panel")),
    sameHeading:
      !!heading && context?.parentElement === heading && balance?.parentElement === heading,
    primaryCount: root?.querySelectorAll(".statement-heading-actions > button").length,
    secondaryCount: menu?.querySelectorAll("button[data-quick-kind]").length,
    menuOpen: menu?.open,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
}
