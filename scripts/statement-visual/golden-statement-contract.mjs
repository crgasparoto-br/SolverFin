import assert from "node:assert/strict";

/** Layout invariants, not a substitute for reviewing the captured composition. */
export function assertGoldenStatement(layout) {
  const required = [
    "viewport",
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
  assert.ok(
    Number.isFinite(layout.viewport.width) && Number.isFinite(layout.viewport.height),
    "Viewport dimensions must be recorded.",
  );
  assert.equal(layout.row?.display, "grid", "Legacy row layout overrode the Golden composition.");
  assert.equal(layout.overflow, false, "Golden statement has document overflow.");
  assert.deepEqual(
    layout.overflowElements ?? [],
    [],
    "Golden statement has visible elements outside the viewport.",
  );
  assert.deepEqual(layout.summaryCollisions ?? [], [], "Golden statement summary values overlap.");
  assert.deepEqual(
    layout.statusCollisions ?? [],
    [],
    "Statement status text overlaps its icon or escapes its badge.",
  );
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
  if (layout.viewport.width >= 1280 && layout.viewport.height >= 740) {
    assert.ok(
      layout.row.bottom <= layout.viewport.height,
      "Excess vertical chrome pushes the first transaction out of the desktop viewport.",
    );
  }
  if (layout.viewport.width <= 760) {
    const mobileListBudget = layout.viewport.height * 0.96;
    assert.ok(
      layout.list.y <= mobileListBudget,
      `Mobile chrome pushes Movimentações below the density budget: ${layout.list.y}px > ${mobileListBudget.toFixed(1)}px.`,
    );
  }
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
    viewport: { width: innerWidth, height: innerHeight },
    row: rect('.statement-body'),
    root: rect('[data-golden-screen="statement"]'),
    overview: rect('.statement-overview'), summary: rect('.account-summary'),
    list: rect('.statement-panel'), description: rect('.statement-body .col-description'),
    descriptionText: rect('.statement-body .col-description > strong'),
    category: rect('.statement-body .col-category'), amount: rect('.statement-body .col-amount'),
    balance: rect('.statement-body .col-balance'),
    summaryCollisions: (() => {
      const nodes = Array.from(document.querySelectorAll('.account-summary .summary-total strong'))
        .filter(element => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      const collisions = [];
      for (let index = 0; index < nodes.length; index += 1) {
        const left = nodes[index].getBoundingClientRect();
        for (let other = index + 1; other < nodes.length; other += 1) {
          const right = nodes[other].getBoundingClientRect();
          const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left);
          const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
          if (horizontal > 1 && vertical > 1) {
            collisions.push([nodes[index].textContent.trim(), nodes[other].textContent.trim()]);
          }
        }
      }
      return collisions;
    })(),
    statusCollisions: Array.from(document.querySelectorAll('.statement-body .statement-status')).flatMap(badge => {
      const label = badge.querySelector('.statement-status-label');
      const icon = badge.querySelector('svg');
      if (!label || !icon || !badge.getBoundingClientRect().width) return [];
      const bounds = badge.getBoundingClientRect();
      const glyph = icon.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(label);
      const fails = Array.from(range.getClientRects()).some(text =>
        text.left < bounds.left - 1 || text.right > bounds.right + 1 ||
        text.top < bounds.top - 1 || text.bottom > bounds.bottom + 1 ||
        (Math.min(text.right, glyph.right) - Math.max(text.left, glyph.left) > 1 &&
         Math.min(text.bottom, glyph.bottom) - Math.max(text.top, glyph.top) > 1));
      return fails ? [label.textContent.trim()] : [];
    }),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    overflowElements: Array.from(document.querySelectorAll('body *')).filter(element => {
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return false;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }
        const currentBox = current.getBoundingClientRect();
        if (
          style.clipPath.includes('inset(50%') ||
          (style.clipPath !== 'none' && currentBox.width <= 1.5 && currentBox.height <= 1.5)
        ) {
          return false;
        }
      }
      return box.right > innerWidth + 1 || box.left < -1;
    }).slice(0, 30).map(element => ({
      tag: element.tagName, className: element.className,
      width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right,
      display: getComputedStyle(element).display
    }))
  };
})()`;
