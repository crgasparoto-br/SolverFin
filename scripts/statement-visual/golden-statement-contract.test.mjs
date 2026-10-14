import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertGoldenStatement } from "./golden-statement-contract.mjs";

function fixture() {
  return {
    viewport: { width: 1366, height: 768 },
    row: { display: "grid", bottom: 680 },
    root: { width: 1090 },
    overview: { bottom: 340 },
    summary: { width: 1040 },
    list: { width: 1090, y: 430 },
    description: { y: 600, x: 340, right: 700, width: 360 },
    descriptionText: { font: 16 },
    category: { y: 620, x: 712, right: 860, width: 148, font: 12 },
    amount: { y: 600, x: 900, right: 1040, width: 140, font: 16 },
    balance: { y: 630, font: 12 },
    rowIcon: { x: 272, y: 600, width: 36, height: 36 },
    date: { x: 320, y: 600, width: 88 },
    overflow: false,
    overflowElements: [],
    summaryCollisions: [],
  };
}

test("a complete first desktop transaction remains visible", () => {
  assert.doesNotThrow(() => assertGoldenStatement(fixture()));
});

test("excess vertical chrome cannot pass only because horizontal layout is correct", () => {
  const layout = fixture();
  layout.row.bottom = 814;
  assert.throws(() => assertGoldenStatement(layout), /first transaction out/);
});

test("mobile reflow is not forced into a desktop height budget", () => {
  const layout = fixture();
  layout.viewport = { width: 390, height: 844 };
  layout.row.bottom = 1100;
  assert.doesNotThrow(() => assertGoldenStatement(layout));
});

test("sidebar and typography regressions remain rejected", () => {
  const sidebar = fixture();
  sidebar.summary.width = 260;
  assert.throws(() => assertGoldenStatement(sidebar), /sidebar/);
  const amount = fixture();
  amount.amount.font = 12;
  assert.throws(() => assertGoldenStatement(amount), /Amount lost visual priority/);
});

test("missing viewport dimensions cannot bypass the density check", () => {
  const layout = fixture();
  layout.viewport = {};
  assert.throws(() => assertGoldenStatement(layout), /Viewport dimensions/);
});

test("a category folded back under the description is rejected on desktop", () => {
  const layout = fixture();
  layout.category = { y: 630, x: 340, right: 520, width: 180, font: 12 };
  assert.throws(() => assertGoldenStatement(layout), /own column after the description/);
});

test("a category running into the amount column is rejected", () => {
  const layout = fixture();
  layout.category = { y: 620, x: 712, right: 960, width: 248, font: 12 };
  assert.throws(() => assertGoldenStatement(layout), /run into the amount column/);
});

test("a movement row without its glyph tile is rejected on desktop", () => {
  const layout = fixture();
  layout.rowIcon = { x: 272, y: 600, width: 0, height: 0 };
  assert.throws(() => assertGoldenStatement(layout), /glyph tile/);
});

test("a glyph placed after the date is rejected on desktop", () => {
  const layout = fixture();
  layout.rowIcon = { x: 420, y: 600, width: 36, height: 36 };
  assert.throws(() => assertGoldenStatement(layout), /precede the date column/);
});

test("visible elements outside the viewport fail the Golden Screen gate", () => {
  const layout = fixture();
  layout.viewport = { width: 320, height: 740 };
  layout.overflowElements = [{ tag: "A", right: 419 }];
  assert.throws(() => assertGoldenStatement(layout), /outside the viewport/);
});

test("overlapping summary values fail the Golden Screen gate", () => {
  const layout = fixture();
  layout.viewport = { width: 320, height: 740 };
  layout.summaryCollisions = [["R$ 1.063.266.987,01", "-R$ 53.949.672,92"]];
  assert.throws(() => assertGoldenStatement(layout), /summary values overlap/);
});

test("mobile month clipping must have a negative control", () => {
  const source = readFileSync(
    new URL("./golden-statement.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(width === 390\)/);
  assert.match(source, /GS-MOBILE-NC-MONTH-CLIPPED/);
  assert.match(source, /month-width-negative/);
  assert.match(source, /narrowed < 240/);
  assert.match(source, /assert\.ok\(\(await read\(probe\)\) >= 240\)/);
});
