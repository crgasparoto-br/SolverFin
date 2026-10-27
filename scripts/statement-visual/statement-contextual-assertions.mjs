import assert from "node:assert/strict";

export function assertContextualSurface(measured, state, dialog) {
  assert.equal(measured.visible, true, `${state}: missing contextual surface`);
  assert.equal(measured.inside, true, `${state}: surface escapes viewport`);
  // Detect off-center dialogs before narrower mobile mutations expose form overflow.
  if (dialog && (state === "new" || state === "edit" || state === "clone")) {
    assert.ok(
      measured.horizontalCenterDelta <= 40,
      `${state}: dialog is off horizontal center (${measured.horizontalCenterDelta}px)`,
    );
  }
  assert.equal(measured.horizontalOverflow, false, `${state}: surface overflows`);
  assert.equal(measured.documentOverflow, false, `${state}: document overflows`);
  assert.equal(measured.unnamedButtons, 0, `${state}: unnamed button`);
  if (dialog) {
    if (state === "new" || state === "edit" || state === "clone") {
      assert.equal(measured.visibleAccountFields, 1, `${state}: duplicate account fields`);
      assert.equal(measured.documentScrollLocked, true, `${state}: background remains scrollable`);
      assert.equal(measured.dialogOverflowHidden, true, `${state}: dialog has a second scrollbar`);
      assert.equal(measured.panelScrollControlled, true, `${state}: form must own scrolling`);
      for (const action of ["cancel", "save"]) {
        const height = measured.footerActionHeights?.[action];
        assert.ok(
          Number.isFinite(height) && height >= 44,
          `${state}: ${action} footer touch target must be at least 44px high (got ${height ?? "missing"}px)`,
        );
      }
      const oneColumn = measured.footerActionColumns === 1;
      if (state === "edit") {
        assert.equal(
          measured.footerContinueHidden,
          true,
          "edit: create-only submit must stay hidden",
        );
        assert.ok(
          oneColumn
            ? measured.footerSaveAfterCancel
            : measured.footerActionRowDelta !== null && measured.footerActionRowDelta <= 2,
          "edit: Cancel and Save must fit side by side or stack in order on compact mobile",
        );
      } else {
        assert.equal(
          measured.footerContinueHidden,
          false,
          `${state}: Save and continue must be visible`,
        );
        assert.ok(
          measured.footerActionHeights?.continue >= 44,
          `${state}: Continue touch target must be at least 44px`,
        );
        assert.ok(
          oneColumn
            ? measured.footerContinueAfterCancel
            : measured.footerContinueRowDelta !== null && measured.footerContinueRowDelta <= 2,
          `${state}: Cancel and Continue must share a row or stack in order on compact mobile`,
        );
        assert.equal(
          measured.footerPrimaryBelowContinue,
          true,
          `${state}: primary Save must follow Continue`,
        );
      }
      assert.equal(
        measured.footerActionsContained,
        true,
        `${state}: footer actions must fit fully inside the dialog content area`,
      );
      assert.equal(
        measured.tooltipStatusCount,
        3,
        `${state}: status icons require accessible tooltips`,
      );
      assert.equal(
        measured.statusLabelVisuallyHidden,
        true,
        `${state}: status label should not consume footer width`,
      );
      if (state === "new" || state === "clone") {
        assert.ok(measured.readOnlyOriginalName, `${state}: original account name is missing`);
        assert.equal(
          measured.readOnlyInputHidden,
          true,
          `${state}: truncated account input remains visible`,
        );
        assert.equal(
          measured.readOnlyVisibleName,
          measured.readOnlyOriginalName,
          `${state}: the full read-only account name must be visible`,
        );
      }
      if (state === "edit") {
        assert.ok(measured.selectedAccountName, "edit: missing selected account");
        assert.equal(
          measured.fullAccountName,
          measured.selectedAccountName,
          "edit: full account name is not readable",
        );
      }
      assert.ok(
        measured.verticalCenterDelta <= 40,
        `${state}: dialog is off vertical center (${measured.verticalCenterDelta}px)`,
      );
    }
    assert.equal(measured.focusInside, true, `${state}: dialog does not contain focus`);
    assert.equal(measured.closeButtons, 1, `${state}: duplicate or missing close action`);
    assert.equal(
      measured.closeGlyphDuplications,
      0,
      `${state}: close glyph duplicates a visible SVG`,
    );
  }
}
