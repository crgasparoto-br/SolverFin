import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const measurementSource = readFileSync(
  new URL("./cards-interface-measurements.mjs", import.meta.url),
  "utf8",
);
const negativeSource = readFileSync(new URL("./cards-interface.mjs", import.meta.url), "utf8");

test("#715: first desktop purchase must be fully readable, not just begin above the fold", () => {
  assert.match(measurementSource, /firstPurchaseLegible &&/);
  assert.match(measurementSource, /firstPurchaseRowBottom <= measurements.viewport.height - 12/);
  assert.match(measurementSource, /firstPurchaseDescriptionBottom/);
  assert.match(measurementSource, /firstPurchaseAmountBottom/);
  assert.match(negativeSource, /box.bottom <= threshold/);
  assert.doesNotMatch(
    measurementSource,
    /firstPurchaseRowTop < measurements.viewport.height - 15/,
  );
});

test("#715: mobile invoice amount leads the header and rejects a late decision", () => {
  assert.match(measurementSource, /primaryAmountTop - measurements.invoiceHeaderTop < 88/);
  assert.match(negativeSource, /box.top - header.getBoundingClientRect\(\).top < 88/);
});
