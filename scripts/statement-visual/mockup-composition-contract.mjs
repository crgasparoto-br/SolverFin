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
  if (layout.currencyControlExpected === true) {
    assert.ok(
      layout.currencyControl?.visible,
      "Currency filter must remain visibly rendered on desktop and mobile.",
    );
    assert.equal(
      layout.currencyControl.disabled,
      !layout.consolidated,
      "Currency filter is editable only when All accounts is selected.",
    );
  }
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
    layout.accountPickerBoundToForm,
    true,
    "Moving the account selector must preserve native GET submission.",
  );
  if (layout.accountPicker) {
    assert.ok(layout.accountChevron, "Account selector must render its dropdown arrow.");
    const trailingInset = layout.accountPicker.right - layout.accountChevron.right;
    assert.ok(
      trailingInset >= 8 && trailingInset <= 24,
      "Account dropdown arrow must stay at the right edge of the selector.",
    );
    assert.ok(
      Math.abs(
        layout.accountChevron.top +
          layout.accountChevron.height / 2 -
          (layout.accountPicker.top + layout.accountPicker.height / 2),
      ) <= 4,
      "Account dropdown arrow must stay vertically centered.",
    );
  }
  assert.equal(
    layout.periodInHeading,
    true,
    "Period navigation must compose the account summary header.",
  );
  assert.ok(layout.summary.width >= layout.list.width - 64, "Summary regressed to a sidebar.");
  if (layout.viewport.width <= 760) {
    assert.ok(
      layout.list.top <= layout.viewport.height * 0.96,
      "Mobile chrome pushes the movement list below the first-viewport density budget.",
    );
  }
  if (layout.viewport.width >= 1101) {
    if (
      layout.viewport.width >= 1280 &&
      !layout.consolidated &&
      layout.accountPicker &&
      layout.period
    ) {
      assert.ok(
        layout.accountPicker.width >= Math.min(360, layout.context.width - 32),
        "Desktop account selector must use the available room before the period control.",
      );
      assert.ok(
        layout.period.left - layout.accountPicker.right <= 86,
        "Desktop account selector leaves excessive unused space before the period.",
      );
    }
    if (layout.firstMovement) {
      assert.ok(
        layout.firstMovement.width > 0 && layout.firstMovement.height > 0,
        "Desktop first movement must be visibly rendered.",
      );
      assert.ok(
        layout.firstMovement.bottom <= layout.viewport.height,
        "Desktop summary and filters must keep the complete first movement in the viewport.",
      );
    }
    if (layout.sortControl && layout.applyControl) {
      assert.ok(
        layout.sortControl.right <= layout.applyControl.left ||
          layout.applyControl.right <= layout.sortControl.left ||
          layout.sortControl.bottom <= layout.applyControl.top ||
          layout.applyControl.bottom <= layout.sortControl.top,
        "Desktop sort and Apply controls must not overlap.",
      );
    }
    // Reference row detail. The chips must read as chips and carry their own glyph.
    if (layout.categoryChip) {
      assert.equal(
        layout.categoryChip.hasGlyph,
        true,
        "Desktop category chip must carry its own glyph, like the reference.",
      );
      assert.ok(layout.categoryChip.radius >= 999, "Desktop category chip must render as a pill.");
      assert.notEqual(
        layout.categoryChip.background,
        "rgba(0, 0, 0, 0)",
        "Desktop category chip must keep a tint instead of collapsing to bare text.",
      );
    }
    // The chip tint must distinguish the directions instead of flattening them together.
    const directionColors = layout.categoryDirectionColors ?? {};
    if (directionColors.in && directionColors.out) {
      assert.notEqual(
        directionColors.in,
        directionColors.out,
        "Desktop entry and exit chips must not share one colour.",
      );
    }
    if (layout.statusChip) {
      assert.equal(
        layout.statusChip.hasGlyph,
        true,
        "Desktop status chip must carry its own glyph, like the reference.",
      );
      assert.ok(layout.statusChip.radius >= 999, "Desktop status chip must render as a pill.");
    }
    if (layout.selectionControl) {
      assert.equal(
        layout.selectionControl.appearance,
        "none",
        "Desktop selection control must be a styled rounded square, not the native circle.",
      );
      assert.ok(
        layout.selectionControl.radius > 0 && layout.selectionControl.radius <= 8,
        "Desktop selection control must stay a rounded square.",
      );
    }
    if (layout.movementGlyph) {
      assert.equal(
        layout.movementGlyph.hasGlyph,
        true,
        "Desktop movement glyph tile must publish its own icon.",
      );
      assert.ok(
        layout.movementGlyph.width >= 40 && layout.movementGlyph.height >= 40,
        "Desktop movement glyph tile must keep the reference size.",
      );
    }
    assert.equal(layout.visiblePrimaryFilters, 4, "Desktop must expose four primary filters.");
    assert.deepEqual(
      layout.truncatedDefaultFilters,
      [],
      "Desktop filters must display their complete default values.",
    );
    assert.deepEqual(
      layout.truncatedSearchPlaceholder,
      [],
      "Desktop search must display its complete placeholder.",
    );
    assert.ok(
      layout.queryFields.height <= 150,
      "Desktop filters regressed to stacked controls instead of a compact row.",
    );
  }
  if (layout.viewport.width > 760) {
    assert.ok(
      layout.queryHeading.top <= layout.queryFields.bottom + 1 &&
        layout.queryHeading.bottom >= layout.queryFields.top - 1,
      "Desktop filter options must stay inline with the compact query controls.",
    );
    assert.ok(
      layout.context.right <= layout.period.left + 1 &&
        layout.period.right <= layout.balance.left + 1,
      "Desktop period navigation must sit between account context and balance.",
    );
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
  // Inspect the overall header hierarchy before asserting exact control alignment.
  // This keeps each Chrome negative control discriminating its intended regression.
  if (
    layout.viewport.width >= 1101 &&
    layout.accountPicker &&
    layout.periodMonthNav &&
    layout.currentMonthButton
  ) {
    for (const control of [layout.periodMonthNav, layout.currentMonthButton]) {
      assert.ok(
        Math.abs(control.top - layout.accountPicker.top) <= 4 &&
          Math.abs(control.bottom - layout.accountPicker.bottom) <= 4,
        "Desktop period and Current month must align to both account-selector edges.",
      );
    }
  }
}

export function measureMockupComposition() {
  const root = document.querySelector('[data-golden-screen="statement"]');
  const heading = root?.querySelector(".statement-account-heading");
  const context = root?.querySelector(".statement-context");
  const balance = root?.querySelector(".summary-balance");
  const menu = root?.querySelector(".statement-secondary-actions");
  const period = root?.querySelector(".statement-period-control");
  const accountPicker = root?.querySelector(".statement-account-control");
  const accountInput = accountPicker?.querySelector('input[name="accountId"]');
  const filters = root?.querySelector(".filter-form");
  const queryHeading = root?.querySelector(".statement-query-heading");
  const queryFields = root?.querySelector("#statement-query-fields");
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
  // Rendered text width, so a value that no longer fits is detected instead of estimated.
  const textWidthIn = (element, text) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.textContent = text;
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    probe.style.font = style.font;
    probe.style.letterSpacing = style.letterSpacing;
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  };
  // A native select draws its indicator inside the content box; a value that fits the text
  // box but not the indicator area is still clipped, so the allowance is measured as well.
  const NATIVE_SELECT_INDICATOR = 20;
  return {
    viewport: { width: innerWidth, height: innerHeight },
    heading: rect(heading),
    context: rect(context),
    balance: rect(balance),
    period: rect(period),
    periodMonthNav: rect(period?.querySelector(".month-nav")),
    currentMonthButton: rect(period?.querySelector("[data-month-current]")),
    consolidated: Boolean(root?.querySelector("[data-all-accounts]")),
    currencyControlExpected: true,
    currencyControl: (() => {
      const field = accountPicker?.querySelector(".statement-currency-field");
      const select = field?.querySelector("select");
      if (!field || !select) {
        const subtitle = accountPicker?.querySelector(".account-select-sub");
        return {
          disabled: true,
          visible: Boolean(
            subtitle &&
            subtitle.getClientRects().length > 0 &&
            subtitle.textContent?.trim().startsWith("Moeda:"),
          ),
        };
      }
      const fieldStyle = getComputedStyle(field);
      const selectStyle = getComputedStyle(select);
      const bounds = field.getBoundingClientRect();
      return {
        disabled: select.disabled,
        visible:
          bounds.width >= 64 &&
          bounds.height >= 32 &&
          select.getClientRects().length > 0 &&
          fieldStyle.clipPath === "none" &&
          fieldStyle.visibility !== "hidden" &&
          selectStyle.visibility !== "hidden",
      };
    })(),
    accountPicker: rect(accountPicker?.querySelector(".account-select-trigger")),
    accountChevron: rect(accountPicker?.querySelector(".account-select-chevron")),
    queryHeading: rect(queryHeading),
    queryFields: rect(queryFields),
    visiblePrimaryFilters: [
      ".statement-kind-field",
      ".statement-status-field",
      ".statement-reconciliation-field",
      ".statement-category-field",
    ].filter((selector) => {
      const select = filters?.querySelector(`${selector} select`);
      return select && select.getClientRects().length > 0;
    }).length,
    truncatedDefaultFilters: [
      ".statement-kind-field",
      ".statement-status-field",
      ".statement-reconciliation-field",
      ".statement-category-field",
    ].flatMap((selector) => {
      const select = filters?.querySelector(`${selector} select`);
      if (!select || select.value !== "" || !select.getClientRects().length) return [];
      const style = getComputedStyle(select);
      const text = select.selectedOptions[0]?.textContent?.trim() ?? "";
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const needed = textWidthIn(select, text) + padding + NATIVE_SELECT_INDICATOR;
      return needed > select.clientWidth + 0.5 ? [select.name] : [];
    }),
    truncatedSearchPlaceholder: (() => {
      const input = filters?.querySelector(".statement-search-field input");
      if (!input || input.value || !input.getClientRects().length) return [];
      const placeholder = input.placeholder ?? "";
      if (!placeholder) return [];
      // A placeholder is not part of the value, so it is rendered to be measured.
      input.value = placeholder;
      const clipped = input.scrollWidth > input.clientWidth + 1;
      input.value = "";
      return clipped ? [placeholder] : [];
    })(),
    summary: rect(root?.querySelector(".account-summary")),
    list: rect(root?.querySelector(".statement-panel")),
    firstMovement: rect(root?.querySelector(".statement-body")),
    sortControl: rect(filters?.querySelector(".statement-sort-field")),
    applyControl: rect(filters?.querySelector(".statement-filter-actions button[type=submit]")),
    sameHeading:
      !!heading && context?.parentElement === heading && balance?.parentElement === heading,
    periodInHeading: !!heading && period?.parentElement === heading,
    accountPickerInContext: !!context && accountPicker?.parentElement === context,
    accountPickerBoundToForm: !!filters && !!accountInput && accountInput.form === filters,
    primaryCount: root?.querySelectorAll(".statement-heading-actions > button").length,
    secondaryCount: menu?.querySelectorAll("button[data-quick-kind]").length,
    menuOpen: menu?.open,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    // Reference row detail: the chips carry their own glyph and read as chips, and the
    // selection control is a rounded square instead of the native circle.
    categoryChip: (() => {
      const chip = root?.querySelector(".statement-body .col-category[data-category-direction]");
      if (!chip) return undefined;
      const style = getComputedStyle(chip);
      return {
        hasGlyph:
          !!chip.querySelector("svg") &&
          chip.querySelector("svg").getBoundingClientRect().width > 0,
        background: style.backgroundColor,
        radius: parseFloat(style.borderTopLeftRadius) || 0,
      };
    })(),
    statusChip: (() => {
      const chip = root?.querySelector(".statement-body .statement-status");
      if (!chip) return undefined;
      const style = getComputedStyle(chip);
      return {
        hasGlyph:
          !!chip.querySelector("svg") &&
          chip.querySelector("svg").getBoundingClientRect().width > 0,
        background: style.backgroundColor,
        radius: parseFloat(style.borderTopLeftRadius) || 0,
        width: chip.getBoundingClientRect().width,
        labelHidden:
          getComputedStyle(chip.querySelector(".statement-status-label")).display === "none",
        hasTooltip:
          !!chip.title &&
          chip.title === chip.getAttribute("aria-label") &&
          chip.dataset.tooltip === chip.title,
        accessible: chip.getAttribute("role") === "img" && chip.tabIndex === 0,
      };
    })(),
    selectionControl: (() => {
      const input = root?.querySelector(".statement-body .col-select input[type=checkbox]");
      if (!input) return undefined;
      const style = getComputedStyle(input);
      return { appearance: style.appearance, radius: parseFloat(style.borderTopLeftRadius) || 0 };
    })(),
    // The chip colour must carry the movement direction: entry and exit cannot share a colour.
    categoryDirectionColors: (() => {
      const colors = {};
      root
        ?.querySelectorAll(".statement-body .col-category[data-category-direction]")
        .forEach((chip) => {
          const direction = chip.getAttribute("data-category-direction");
          if (!colors[direction]) colors[direction] = getComputedStyle(chip).color;
        });
      return colors;
    })(),
    movementGlyph: (() => {
      const tile = root?.querySelector(".statement-body .col-row-icon");
      if (!tile) return undefined;
      const box = tile.getBoundingClientRect();
      return { width: box.width, height: box.height, hasGlyph: !!tile.querySelector("svg") };
    })(),
  };
}
