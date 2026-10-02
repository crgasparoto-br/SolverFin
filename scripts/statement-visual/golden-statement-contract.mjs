import assert from "node:assert/strict";

/** Layout invariants, not a substitute for reviewing the captured composition. */
export function assertGoldenStatement(layout) {
  for (const name of ["root", "overview", "summary", "list", "description", "descriptionText", "category", "amount", "balance"]) {
    assert.ok(layout[name], `Golden statement is missing ${name}.`);
  }
  assert.equal(layout.overflow, false, "Golden statement has document overflow.");
  assert.ok(Math.abs(layout.list.width - layout.root.width) <= 2, "Statement list lost the available width.");
  assert.ok(layout.overview.bottom <= layout.list.y + 1, "Financial overview must precede the list.");
  assert.ok(layout.summary.width >= layout.list.width - 64, "Financial summary regressed to a sidebar.");
  assert.ok(layout.descriptionText.font > layout.category.font * 1.15, "Description lost visual priority over metadata.");
  assert.ok(layout.amount.font > layout.balance.font * 1.15, "Amount lost visual priority over balance.");
  assert.ok(layout.category.y > layout.description.y, "Category must remain on the secondary line.");
  assert.ok(layout.balance.y > layout.amount.y, "Running balance must remain below the amount.");
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
    root: rect('[data-golden-screen="statement"]'),
    overview: rect('.statement-overview'), summary: rect('.account-summary'),
    list: rect('.statement-panel'), description: rect('.statement-body .col-description'),
    descriptionText: rect('.statement-body .col-description > strong'),
    category: rect('.statement-body .col-category'), amount: rect('.statement-body .col-amount'),
    balance: rect('.statement-body .col-balance'),
    overflow: document.documentElement.scrollWidth > innerWidth + 1
  };
})()`;
