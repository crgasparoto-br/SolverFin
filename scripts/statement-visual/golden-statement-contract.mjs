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
    layout.summaryCardOverflow ?? [],
    [],
    "Golden statement amounts must stay within their own summary cards.",
  );
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
  if (layout.viewport.width > 760) {
    // Reference anatomy: the category owns the column right after the description, and the
    // movement carries a glyph tile in front of the date.
    assert.ok(
      layout.category.x >= layout.description.right - 1,
      "Category must occupy its own column after the description.",
    );
    assert.ok(
      layout.category.right <= layout.amount.x + 1,
      "Category must not run into the amount column.",
    );
    assert.ok(
      (layout.rowIcon?.width ?? 0) >= 24 && (layout.rowIcon?.width ?? 0) <= 48,
      "Movement row must publish its glyph tile at the reference size.",
    );
    assert.ok(
      (layout.rowIcon?.x ?? 0) < layout.date.x,
      "Movement glyph must precede the date column.",
    );
  } else {
    assert.ok(layout.category.y > layout.description.y, "Category must be on the secondary line.");
  }
  // Reference row detail: the chips must read as chips and keep their own glyph.
  if (layout.categoryChip) {
    assert.equal(
      layout.categoryChip.hasGlyph,
      true,
      "Category chip must carry its own glyph, like the reference.",
    );
    assert.ok(layout.categoryChip.radius >= 999, "Category chip must render as a pill.");
    assert.notEqual(
      layout.categoryChip.background,
      "rgba(0, 0, 0, 0)",
      "Category chip must keep its tint instead of collapsing to bare text.",
    );
  }
  // The chip tint must distinguish the directions instead of flattening them together.
  const directionColors = layout.categoryDirectionColors ?? {};
  if (directionColors.in && directionColors.out) {
    assert.notEqual(
      directionColors.in,
      directionColors.out,
      "Entry and exit chips must not share one colour.",
    );
  }
  if (layout.statusChip) {
    assert.equal(
      layout.statusChip.hasGlyph,
      true,
      "Status chip must carry its own glyph, like the reference.",
    );
    assert.ok(layout.statusChip.radius >= 999, "Status chip must render as a pill.");
  }
  if (layout.selectionControl) {
    assert.equal(
      layout.selectionControl.appearance,
      "none",
      "Selection control must be a styled rounded square, not the native circle.",
    );
    assert.ok(
      layout.selectionControl.radius > 0 && layout.selectionControl.radius <= 8,
      "Selection control must stay a rounded square.",
    );
  }
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
    rowIcon: rect('.statement-body .col-row-icon'),
    date: rect('.statement-body .col-date'),
    // Reference row detail: chips read as chips and carry their own glyph, and the
    // selection control is a styled rounded square instead of the native circle.
    categoryChip: (() => {
      const chip = document.querySelector('.statement-body .col-category');
      if (!chip) return null;
      const style = getComputedStyle(chip);
      const glyph = chip.querySelector('svg');
      return { hasGlyph: !!glyph && glyph.getBoundingClientRect().width > 0,
        background: style.backgroundColor,
        radius: parseFloat(style.borderTopLeftRadius) || 0 };
    })(),
    // The chip colour must carry the movement direction: entry and exit cannot share a colour.
    categoryDirectionColors: (() => {
      const colors = {};
      document.querySelectorAll('.statement-body .col-category[data-category-direction]').forEach((chip) => {
        const direction = chip.getAttribute('data-category-direction');
        if (!colors[direction]) colors[direction] = getComputedStyle(chip).color;
      });
      return colors;
    })(),
    statusChip: (() => {
      const chip = document.querySelector('.statement-body .statement-status');
      if (!chip) return null;
      const style = getComputedStyle(chip);
      const glyph = chip.querySelector('svg');
      return { hasGlyph: !!glyph && glyph.getBoundingClientRect().width > 0,
        background: style.backgroundColor,
        radius: parseFloat(style.borderTopLeftRadius) || 0 };
    })(),
    selectionControl: (() => {
      const input = document.querySelector('.statement-body .col-select input[type=checkbox]');
      if (!input) return null;
      const style = getComputedStyle(input);
      return { appearance: style.appearance, radius: parseFloat(style.borderTopLeftRadius) || 0 };
    })(),
    // F-702-04: viewport overflow and sibling collisions cannot detect text that
    // paints outside its OWN card but remains inside the page or its sibling.
    summaryCardOverflow: Array.from(document.querySelectorAll('.account-summary .summary-total[data-summary-total]')).flatMap(card => {
      const value = card.querySelector('.summary-total-copy > strong');
      if (!value) return [];
      const cardBox = card.getBoundingClientRect();
      if (cardBox.width <= 0 || cardBox.height <= 0) return [];
      const valueBox = value.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(value);
      const textRects = Array.from(range.getClientRects()).filter(part => part.width > 0 && part.height > 0);
      const outside = textRects.some(part =>
        part.left < cardBox.left - 1 || part.right > cardBox.right + 1 ||
        part.top < cardBox.top - 1 || part.bottom > cardBox.bottom + 1);
      const clipped = value.scrollWidth > value.clientWidth + 1 ||
        value.scrollHeight > value.clientHeight + 1;
      const misplaced = valueBox.left < cardBox.left - 1 || valueBox.right > cardBox.right + 1;
      return outside || clipped || misplaced ? [card.dataset.summaryTotal || value.textContent.trim()] : [];
    }),
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
      // Real clipping: the chip keeps its metadata on one line, so a content box narrower
      // than the rendered content hides part of the state instead of wrapping it.
      if (badge.scrollWidth > badge.clientWidth + 1) return [label.textContent.trim()];
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
