import assert from "node:assert/strict";
import test from "node:test";

import { collectReport718Evidence } from "./reports-718-behavior-evidence.mjs";

function fixture() {
  const sections = ["1366x768", "1024x768", "390x844", "320x740"].flatMap((viewport) =>
    ["BRL", "USD"].flatMap((currency) =>
      ["summary", "visualization", "detail"].map((layer) => ({
        viewport,
        currency,
        layer,
        screenshot: `reports-${viewport}-${currency}-${layer}.png`,
        measurements: { visible: true, correctCurrency: true, hasContent: true },
      })),
    ),
  );
  const cashFlow = ["1366x768", "1024x768", "390x844", "320x740"].map((viewport) => ({
    viewport,
    route: "/relatorios?view=cash-flow&horizonDays=30",
    measurements: {
      pageFitsViewport: true,
      filterFit: { fits: true },
      trendMoney: { fits: true, checked: 6, violations: [] },
      blockCurrencies: ["BRL", "USD"],
      tableScrollLocal: true,
      trendScrollLocal: true,
    },
    moneyNegativeControl:
      viewport === "320x740" ? { baseline: true, observed: true, restored: true } : null,
    capturedSections: ["BRL", "USD"].flatMap((currency) =>
      ["summary", "visualization", "detail"].map((layer) => ({
        currency,
        layer,
        screenshot: `cash-${viewport}-${currency}-${layer}.png`,
        measurements: { visible: true, correctCurrency: true, hasContent: true },
      })),
    ),
  }));
  const mobileStates = ["390x844", "320x740"].flatMap((viewport) =>
    ["empty", "filter-error", "api-error"].map((state) => ({
      viewport,
      state,
      route: `/relatorios?state=${state}`,
      screenshot: `state-${viewport}-${state}.png`,
      measurements: {
        state,
        visible: true,
        pageFitsViewport: true,
        hasReadyReport: false,
        invalidControls: 3,
        retryHref: state === "api-error" ? `/relatorios?state=${state}` : null,
      },
    })),
  );
  return {
    screenshots: [
      ...sections.map((section) => section.screenshot),
      ...cashFlow.flatMap((scenario) =>
        scenario.capturedSections.map((section) => section.screenshot),
      ),
      ...mobileStates.map((scenario) => scenario.screenshot),
    ],
    cashFlow,
    mobileStates,
    failures: [],
    desktop: { measurements: { pageFitsViewport: true } },
    mobile: {
      measurements: {
        pageFitsViewport: true,
        tableScrollable: true,
        scrollerFocused: true,
      },
    },
    multiCurrency: ["1366x768", "1024x768", "390x844", "320x740"].map((viewport) => ({
      viewport,
      capturedSections: sections.filter((section) => section.viewport === viewport),
      filterNegativeControl: viewport === "1366x768" ? { rejected: true, restored: true } : null,
      measurements: {
        filterFit: { fits: true },
        currencies: ["BRL", "USD"],
        currenciesComplete: true,
        globalOverflow: false,
        longLabelsReadable: true,
        trendFitsWithoutScroll: true,
        matrixRowsCompact: true,
        highlightsGrouped: true,
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

test("#718 adapter rejects category trend scrollbar, tall matrix rows or detached review alerts", async () => {
  for (const field of ["trendFitsWithoutScroll", "matrixRowsCompact", "highlightsGrouped"]) {
    const evidence = fixture();
    evidence.multiCurrency[1].measurements[field] = false;
    await assert.rejects(
      collectReport718Evidence(async () => evidence),
      { name: "AssertionError" },
    );
  }
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

test("#718 adapter rejects opening-only screenshot evidence with no offscreen captures", async () => {
  const missing = fixture();
  missing.multiCurrency[0].capturedSections = [];
  await assert.rejects(
    collectReport718Evidence(async () => missing),
    /visual capture/,
  );
});

test("#718 adapter rejects a capture without visible monetary content or currency context", async () => {
  const obscured = fixture();
  obscured.multiCurrency[1].capturedSections[2].measurements.visible = false;
  await assert.rejects(
    collectReport718Evidence(async () => obscured),
    /outside the viewport/,
  );
  const wrongCurrency = fixture();
  wrongCurrency.multiCurrency[2].capturedSections[3].measurements.correctCurrency = false;
  await assert.rejects(
    collectReport718Evidence(async () => wrongCurrency),
    /currency context/,
  );
});

test("#718 rejects missing cash-flow currency/layer and mobile state evidence", async () => {
  const missingCash = fixture();
  missingCash.cashFlow[1].capturedSections.pop();
  await assert.rejects(
    collectReport718Evidence(async () => missingCash),
    /cash-flow lacks/,
  );
  const missingState = fixture();
  missingState.mobileStates.pop();
  await assert.rejects(
    collectReport718Evidence(async () => missingState),
    /mobile screenshot/,
  );
});

test("#718 rejects cash-flow money mix, mobile overflow and broken recovery link", async () => {
  const mixed = fixture();
  mixed.cashFlow[0].capturedSections[2].measurements.correctCurrency = false;
  await assert.rejects(collectReport718Evidence(async () => mixed));
  const overflow = fixture();
  overflow.mobileStates[0].measurements.pageFitsViewport = false;
  await assert.rejects(collectReport718Evidence(async () => overflow));
  const brokenRetry = fixture();
  brokenRetry.mobileStates[2].measurements.retryHref = "/relatorios";
  await assert.rejects(
    collectReport718Evidence(async () => brokenRetry),
    /Retry must preserve/,
  );
});

test("#718 rejects overlapping trend currency text and an ineffective negative control", async () => {
  const overlapping = fixture();
  overlapping.cashFlow[1].measurements.trendMoney.fits = false;
  await assert.rejects(
    collectReport718Evidence(async () => overlapping),
    /overlapping money/,
  );
  const weakNegative = fixture();
  weakNegative.cashFlow[3].moneyNegativeControl.observed = false;
  await assert.rejects(collectReport718Evidence(async () => weakNegative));
});

test("A718-05 adapter rejects clipped desktop selections despite no page overflow", async () => {
  const installments = fixture();
  installments.multiCurrency[0].measurements.filterFit.fits = false;
  await assert.rejects(collectReport718Evidence(async () => installments), /cuts selected evolution filter/);
  const cashFlow = fixture();
  cashFlow.cashFlow[1].measurements.filterFit.fits = false;
  await assert.rejects(collectReport718Evidence(async () => cashFlow), /cuts cash-flow filters/);
  const weakControl = fixture();
  weakControl.multiCurrency[0].filterNegativeControl.rejected = false;
  await assert.rejects(collectReport718Evidence(async () => weakControl));
});

test("A718-05 adapter requires real tablet coverage", async () => {
  const missing = fixture();
  missing.multiCurrency.splice(1, 1);
  await assert.rejects(collectReport718Evidence(async () => missing), /1024x768/);
});
