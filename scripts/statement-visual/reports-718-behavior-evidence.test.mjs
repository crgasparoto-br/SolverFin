import assert from "node:assert/strict";
import test from "node:test";

import { collectReport718Evidence } from "./reports-718-behavior-evidence.mjs";

function fixture() {
  return {
    failures: [],
    desktop: { measurements: { pageFitsViewport: true } },
    mobile: {
      measurements: {
        pageFitsViewport: true,
        tableScrollable: true,
        scrollerFocused: true,
      },
    },
    multiCurrency: ["1366x768", "390x844", "320x740"].map((viewport) => ({
      viewport,
      measurements: {
        currencies: ["BRL", "USD"],
        currenciesComplete: true,
        globalOverflow: false,
        longLabelsReadable: true,
        trendScrollLocal: true,
        tableScrollLocal: true,
      },
    })),
    negativeControl: { observed: true, restored: true },
    viewportNegativeControl: { observed: true, restored: true },
  };
}

test("#718 adapter validates original Chrome evidence and full viewport coverage", async () => {
  const proof = await collectReport718Evidence(async () => fixture());
  assert.deepEqual(proof.assertions, ["behavior:layout:desktop", "behavior:layout:mobile"]);
  assert.deepEqual(proof.files, ["reports-category-evolution.json"]);
});

test("#718 adapter rejects incomplete currency coverage or mobile overflow", async () => {
  const missingCurrency = fixture();
  missingCurrency.multiCurrency[1].measurements.currenciesComplete = false;
  await assert.rejects(collectReport718Evidence(async () => missingCurrency));
  const overflowing = fixture();
  overflowing.multiCurrency[2].measurements.globalOverflow = true;
  await assert.rejects(collectReport718Evidence(async () => overflowing));
});

test("#718 adapter rejects untested or un-restored negative controls", async () => {
  const missing = fixture();
  missing.viewportNegativeControl = undefined;
  await assert.rejects(collectReport718Evidence(async () => missing));
  const stale = fixture();
  stale.negativeControl.restored = false;
  await assert.rejects(collectReport718Evidence(async () => stale));
});

test("#718 adapter does not accept an omitted small mobile viewport", async () => {
  const partial = fixture();
  partial.multiCurrency.pop();
  await assert.rejects(collectReport718Evidence(async () => partial));
});
