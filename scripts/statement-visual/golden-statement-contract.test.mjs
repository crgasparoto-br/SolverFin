import assert from "node:assert/strict";
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
    description: { y: 600 },
    descriptionText: { font: 16 },
    category: { y: 630, font: 12 },
    amount: { y: 600, font: 16 },
    balance: { y: 630, font: 12 },
    overflow: false,
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
