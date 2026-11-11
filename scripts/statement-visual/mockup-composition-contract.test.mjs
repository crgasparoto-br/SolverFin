import assert from "node:assert/strict";
import test from "node:test";

import { assertMockupComposition } from "./mockup-composition-contract.mjs";

const box = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const fixture = () => ({
  viewport: { width: 1366, height: 768 },
  heading: box(250, 130, 1000, 90),
  context: box(250, 140, 300, 70),
  period: box(570, 145, 220, 60),
  balance: box(810, 145, 440, 60),
  queryHeading: box(920, 350, 200, 44),
  queryFields: box(250, 350, 650, 44),
  visiblePrimaryFilters: 4,
  truncatedDefaultFilters: [],
  truncatedSearchPlaceholder: [],
  summary: box(250, 130, 1000, 190),
  list: box(230, 450, 1040, 250),
  firstMovement: box(250, 495, 990, 45),
  sameHeading: true,
  periodInHeading: true,
  accountPickerInContext: true,
  accountPickerBoundToForm: true,
  primaryCount: 1,
  secondaryCount: 2,
  menuOpen: false,
  overflow: false,
});

test("accepts the horizontal hierarchy with one exposed action", () => {
  assert.doesNotThrow(() => assertMockupComposition(fixture()));
});
test("rejects stacked desktop hierarchy even with the right nodes", () => {
  const layout = fixture();
  layout.balance = box(250, 225, 1000, 60);
  assert.throws(() => assertMockupComposition(layout), /period navigation|side by side|horizontal/);
});
test("rejects three exposed actions and lost secondary actions", () => {
  assert.throws(() => assertMockupComposition({ ...fixture(), primaryCount: 3 }), /one quick/);
  assert.throws(() => assertMockupComposition({ ...fixture(), secondaryCount: 0 }), /remain/);
});
test("rejects an initially open menu and a summary sidebar", () => {
  assert.throws(() => assertMockupComposition({ ...fixture(), menuOpen: true }), /collapsed/);
  assert.throws(
    () => assertMockupComposition({ ...fixture(), summary: box(250, 130, 260, 300) }),
    /sidebar/,
  );
});
test("accepts mobile stacking but rejects reversed financial context", () => {
  const layout = {
    ...fixture(),
    viewport: { width: 390, height: 844 },
    context: box(24, 140, 342, 70),
    balance: box(24, 220, 342, 60),
  };
  assert.doesNotThrow(() => assertMockupComposition(layout));
  assert.throws(
    () => assertMockupComposition({ ...layout, balance: box(24, 110, 342, 60) }),
    /account before balance/,
  );
});

test("rejects the pre-fix mobile composition that delays the movement list", () => {
  const layout = {
    ...fixture(),
    viewport: { width: 390, height: 844 },
    context: box(24, 140, 342, 70),
    balance: box(24, 220, 342, 60),
    list: box(24, 824, 342, 240),
  };
  assert.throws(() => assertMockupComposition(layout), /density budget/);
});

test("keeps the account chevron at the right edge on desktop and mobile", () => {
  for (const width of [1366, 390, 320]) {
    const layout = fixture();
    layout.viewport = { width, height: width === 1366 ? 768 : 844 };
    if (width <= 760) {
      layout.context = box(16, 140, width - 32, 70);
      layout.balance = box(16, 220, width - 32, 60);
    }
    layout.accountPicker = box(
      width === 1366 ? 250 : 16,
      155,
      width === 1366 ? 290 : width - 32,
      44,
    );
    layout.accountChevron = box(layout.accountPicker.right - 30, 170, 14, 14);
    assert.doesNotThrow(() => assertMockupComposition(layout));
    assert.throws(
      () =>
        assertMockupComposition({
          ...layout,
          accountChevron: box(layout.accountPicker.left + 110, 170, 14, 14),
        }),
      /right edge/,
    );
    assert.throws(
      () =>
        assertMockupComposition({
          ...layout,
          accountChevron: box(layout.accountPicker.right - 30, 157, 14, 14),
        }),
      /vertically centered/,
    );
  }
});

test("desktop period and Current month share both account-selector edges", () => {
  const layout = {
    ...fixture(),
    accountPicker: box(250, 170, 365, 46),
    accountChevron: box(585, 186, 14, 14),
    periodMonthNav: box(635, 170, 192, 46),
    currentMonthButton: box(835, 170, 108, 46),
  };
  assert.doesNotThrow(() => assertMockupComposition(layout));
  assert.throws(
    () => assertMockupComposition({ ...layout, periodMonthNav: box(635, 161, 192, 46) }),
    /both account-selector edges/,
  );
  assert.throws(
    () => assertMockupComposition({ ...layout, currentMonthButton: box(835, 170, 108, 39) }),
    /both account-selector edges/,
  );
  const mobile = {
    ...layout,
    viewport: { width: 390, height: 844 },
    context: box(24, 140, 342, 70),
    balance: box(24, 220, 342, 60),
  };
  assert.doesNotThrow(
    () => assertMockupComposition(mobile),
    "Mobile keeps the existing stacked layout.",
  );
});

test("rejects a hidden currency selector or a currency selector editable on one account", () => {
  const individual = {
    ...fixture(),
    currencyControlExpected: true,
    consolidated: false,
    currencyControl: { visible: true, disabled: true },
  };
  assert.doesNotThrow(() => assertMockupComposition(individual));
  assert.throws(
    () =>
      assertMockupComposition({
        ...individual,
        currencyControl: { visible: false, disabled: true },
      }),
    /visibly rendered/,
  );
  assert.throws(
    () =>
      assertMockupComposition({
        ...individual,
        currencyControl: { visible: true, disabled: false },
      }),
    /editable only/,
  );
  const all = {
    ...individual,
    consolidated: true,
    currencyControl: { visible: true, disabled: false },
  };
  assert.doesNotThrow(() => assertMockupComposition(all));
  assert.throws(
    () => assertMockupComposition({ ...all, currencyControl: { visible: false, disabled: false } }),
    /visibly rendered/,
  );
});

test("rejects selector left in query or orphaned from original GET form", () => {
  assert.throws(
    () => assertMockupComposition({ ...fixture(), accountPickerInContext: false }),
    /financial context/,
  );
  assert.throws(
    () => assertMockupComposition({ ...fixture(), accountPickerBoundToForm: false }),
    /native GET/,
  );
});

test("rejects admin-style stacked filters at desktop widths", () => {
  const layout = fixture();
  layout.queryFields = box(250, 350, 650, 260);
  assert.throws(() => assertMockupComposition(layout), /stacked controls/);
});

test("rejects desktop filters hidden from the visual composition", () => {
  assert.throws(
    () => assertMockupComposition({ ...fixture(), visiblePrimaryFilters: 3 }),
    /four primary filters/,
  );
});

test("rejects desktop composition hiding the first movement below the fold", () => {
  assert.throws(
    () => assertMockupComposition({ ...fixture(), firstMovement: box(250, 780, 990, 45) }),
    /complete first movement in the viewport/,
  );
});

test("rejects a partially clipped first desktop movement", () => {
  assert.throws(
    () => assertMockupComposition({ ...fixture(), firstMovement: box(250, 750, 990, 45) }),
    /complete first movement in the viewport/,
  );
});

test("rejects first desktop transaction rendered with zero height", () => {
  assert.throws(
    () => assertMockupComposition({ ...fixture(), firstMovement: box(250, 495, 990, 0) }),
    /visibly rendered/,
  );
});

test("rejects truncated default financial filter choices on desktop", () => {
  assert.throws(
    () => assertMockupComposition({ ...fixture(), truncatedDefaultFilters: ["reconciliation"] }),
    /complete default values/,
  );
});

test("rejects a truncated desktop search placeholder", () => {
  assert.throws(
    () =>
      assertMockupComposition({
        ...fixture(),
        truncatedSearchPlaceholder: ["Descrição ou categoria"],
      }),
    /complete placeholder/,
  );
});

test("rejects overlapping desktop sort and Apply controls", () => {
  assert.throws(
    () =>
      assertMockupComposition({
        ...fixture(),
        sortControl: box(900, 350, 140, 44),
        applyControl: box(1010, 350, 90, 44),
      }),
    /must not overlap/,
  );
});
