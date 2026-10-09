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
  summary: box(250, 130, 1000, 190),
  list: box(230, 450, 1040, 250),
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
