import assert from "node:assert/strict";
import test from "node:test";

import { rectanglesOverlap } from "./rectangles-overlap.mjs";

const text = { left: 408, right: 650, top: 100, bottom: 120 };

test("metadata below the description does not overlap despite sharing horizontal space", () => {
  assert.equal(rectanglesOverlap(text, { left: 408, right: 680, top: 126, bottom: 144 }), false);
});

test("adjacent columns and touching edges do not overlap", () => {
  assert.equal(rectanglesOverlap(text, { left: 656, right: 800, top: 100, bottom: 120 }), false);
  assert.equal(rectanglesOverlap(text, { left: 650, right: 800, top: 100, bottom: 120 }), false);
});

test("real horizontal and vertical collisions are rejected in either ordering", () => {
  const collision = { left: 630, right: 680, top: 110, bottom: 140 };
  assert.equal(rectanglesOverlap(text, collision), true);
  assert.equal(rectanglesOverlap(collision, text), true);
});

test("expanded details overlapping a metadata row are detected", () => {
  const expanded = { left: 408, right: 700, top: 100, bottom: 240 };
  assert.equal(rectanglesOverlap(expanded, { left: 408, right: 680, top: 220, bottom: 240 }), true);
});

test("non-rendered boxes and subpixel touching are not collisions", () => {
  assert.equal(rectanglesOverlap(text, { left: 450, right: 450, top: 100, bottom: 120 }), false);
  assert.equal(rectanglesOverlap(text, { left: 649.6, right: 680, top: 100, bottom: 120 }), false);
});

test("invalid geometry fails closed", () => {
  assert.throws(() => rectanglesOverlap(text, { ...text, top: NaN }), TypeError);
  assert.throws(() => rectanglesOverlap(text, text, -1), TypeError);
});
