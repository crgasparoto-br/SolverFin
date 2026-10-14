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
  assert.equal(
    layout.accountPickerInContext,
    true,
    "Account selector must stay in financial context, not query filters.",
  );
  if (layout.statusChip) {
    assert.equal(
      layout.statusChip.labelHidden,
      true,
      "Movement status must display only the icon.",
    );
    assert.equal(
      layout.statusChip.hasTooltip,
      true,
      "Movement status must expose its full label on hover.",
    );
    assert.equal(
      layout.statusChip.accessible,
      true,
      "Movement status must retain a keyboard-accessible name.",
    );
    assert.ok(layout.statusChip.width <= 40, "Movement status must remain icon-sized.");
  }
  assert.equal(
    layo¶»§q«^