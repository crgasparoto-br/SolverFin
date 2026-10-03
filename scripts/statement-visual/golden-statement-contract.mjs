import assert from "node:assert/strict";

/** Layout invariants, not a substitute for reviewing the captured composition. */
export function assertGoldenStatement(layout) {
  const required = [
    "root",
    "overview",
    "summary",
    "list",
    "description",
    "descriptionText",
    "category",
    "amount",
    "balance",
  ];
  for (const name of required) {
    assert.ok(layout[name], `Golden statement is missing ${name}.`);
  }
  assert.equal(layout.row?.display, "grid", "Legacy row layout overrode the Golden composition.");
  assert.equal(layout.overflow, false, "Golden statement has document overflow.");
  assert.ok(
    Math.abs(layout.list.width - layout.root.width) <= 2,
    "Statement list lost the available width.",
  );
  assert.ok(layout.overview.bottom <= layout.list.y + 1, "Overview must precede the list.");
  assert.ok(layout.summary.width >= layout.list.width - 64, "Summary regressed to a sidebar.");
  assert.ok(
    layout.descriptionText.font > layout.category.font * 1.15,
    "Description lost visual priority over metadata.",
  );
  assert.ok(
    layout.amount.font > layout.balance.font * 1.15,
    "Amount lost visual priority over balance.",
  );
  assert.ok(layout.category.y > layout.description.y, "Category must be on the secondary line.");
  assert.ok(layout.balance.y > layout.amount.y, "Running balance must be below the amount.");
}

export const goldenStatementMeasurements = `(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: box.x, y: box.y, width: box.width, height: box.height,
      bottom: box.bottom, right: box.right, font: parseFloat(style.fontSize),
      display: style.display };
  };
  return {
    row: rect('.statement-body'),
    root: rect('[data-golden-screen="statement"]'),
    overview: rect('.statement-overview'), summary: rect('.account-summary'),
    list: rect('.statement-panel'), description: rect('.statement-body .col-description'),
    descriptionText: rect('.statement-body .col-description > strong'),
    category: rect('.statement-body .col-category'), amount: rect('.statement-body .col-amount'),
    balance: rect('.statement-body .col-balance'),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    overflowElements: Array.from(document.querySelectorAll('body *')).filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
    }).slice(0, 30).map(element => ({
      tag: element.tagName, className: element.className,
      width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right,
      display: getComputedStyle(element).display
    }))
  };
})()`;
