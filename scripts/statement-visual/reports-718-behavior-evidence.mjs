import assert from "node:assert/strict";

/** Validate the actual Chrome capture emitted by the #718 scenario, not a sibling's proof. */
export async function collectReport718Evidence(readEvidence) {
  const fileName = "reports-category-evolution.json";
  const report = await readEvidence(fileName);
  assert.equal(report.failures?.length, 0, `${fileName} has unresolved visual failures.`);
  assert.equal(report.desktop?.measurements?.pageFitsViewport, true);
  assert.equal(report.mobile?.measurements?.pageFitsViewport, true);
  assert.equal(report.mobile?.measurements?.tableScrollable, true);
  assert.equal(report.mobile?.measurements?.scrollerFocused, true);

  const expectedViewports = ["1366x768", "1024x768", "390x844", "320x740"];
  const scenarios = report.multiCurrency ?? [];
  for (const viewport of expectedViewports) {
    const scenario = scenarios.find((candidate) => candidate.viewport === viewport);
    assert.ok(scenario, `${fileName} lacks multi-currency evidence for ${viewport}.`);
    const { measurements } = scenario;
    // Each block must be photographed in the actual browser *after scrolling to
    // its content*. An opening-viewport capture cannot prove offscreen sections.
    for (const currency of ["BRL", "USD"]) {
      for (const layer of ["summary", "visualization", "detail"]) {
        const capture = scenario.capturedSections?.find(
          (item) => item.currency === currency && item.layer === layer,
        );
        assert.ok(capture, `${viewport} has no ${currency} ${layer} visual capture.`);
        assert.ok(
          report.screenshots?.includes(capture.screenshot),
          `${capture.screenshot} not registered.`,
        );
        assert.equal(
          capture.measurements?.visible,
          true,
          `${capture.screenshot} is outside the viewport.`,
        );
        assert.equal(
          capture.measurements?.correctCurrency,
          true,
          `${capture.screenshot} lost currency context.`,
        );
        assert.equal(
          capture.measurements?.hasContent,
          true,
          `${capture.screenshot} has no financial content.`,
        );
      }
    }
    assert.ok(measurements.currencies?.includes("BRL"));
    assert.ok(measurements.currencies?.includes("USD"));
    assert.equal(measurements.currenciesComplete, true);
    assert.equal(measurements.globalOverflow, false);
    assert.equal(measurements.filterFit?.fits, true, `${viewport} cuts selected evolution filter values`);
    if (viewport === "1366x768") {
      assert.equal(scenario.filterNegativeControl?.rejected, true);
      assert.equal(scenario.filterNegativeControl?.restored, true);
    }
    assert.equal(measurements.longLabelsReadable, true);
    assert.equal(measurements.trendFitsWithoutScroll, true);
    assert.equal(measurements.matrixRowsCompact, true);
    assert.equal(measurements.highlightsGrouped, true);
    if (viewport === "390x844" || viewport === "320x740") {
      assert.equal(measurements.tableScrollLocal, true);
    }
  }

  const cashFlow = report.cashFlow ?? [];
  for (const viewport of expectedViewports) {
    const proof = cashFlow.find((item) => item.viewport === viewport);
    assert.ok(proof, `${fileName} lacks real cash-flow evidence for ${viewport}.`);
    assert.match(proof.route, /view=cash-flow/);
    assert.equal(proof.measurements?.pageFitsViewport, true);
    assert.equal(proof.measurements?.filterFit?.fits, true, `${viewport} cuts cash-flow filters`);
    assert.equal(proof.measurements?.trendMoney?.fits, true, `${viewport} has overlapping money`);
    assert.ok(proof.measurements?.blockCurrencies?.includes("BRL"));
    assert.ok(proof.measurements?.blockCurrencies?.includes("USD"));
    if (viewport === "390x844" || viewport === "320x740") {
      assert.equal(proof.measurements?.tableScrollLocal, true);
      assert.equal(proof.measurements?.trendScrollLocal, true);
    }
    for (const currency of ["BRL", "USD"]) {
      for (const layer of ["summary", "visualization", "detail"]) {
        const capture = proof.capturedSections?.find(
          (section) => section.currency === currency && section.layer === layer,
        );
        assert.ok(capture, `${viewport} cash-flow lacks ${currency} ${layer}.`);
        assert.ok(report.screenshots?.includes(capture.screenshot));
        assert.equal(capture.measurements?.visible, true);
        assert.equal(capture.measurements?.correctCurrency, true);
        assert.equal(capture.measurements?.hasContent, true);
      }
    }
  }

  const moneyNegativeControl = cashFlow.find(
    (item) => item.viewport === "320x740",
  )?.moneyNegativeControl;
  assert.equal(moneyNegativeControl?.baseline, true);
  assert.equal(moneyNegativeControl?.observed, true);
  assert.equal(moneyNegativeControl?.restored, true);

  const mobileStates = report.mobileStates ?? [];
  for (const viewport of ["390x844", "320x740"]) {
    for (const state of ["empty", "filter-error", "api-error"]) {
      const proof = mobileStates.find((item) => item.viewport === viewport && item.state === state);
      assert.ok(proof, `${fileName} lacks ${state} mobile screenshot at ${viewport}.`);
      assert.ok(report.screenshots?.includes(proof.screenshot));
      assert.equal(proof.measurements?.state, state);
      assert.equal(proof.measurements?.pageFitsViewport, true);
      assert.equal(proof.measurements?.visible, true);
      assert.equal(proof.measurements?.hasReadyReport, false);
      if (state === "api-error") {
        assert.equal(proof.measurements?.retryHref, proof.route, "Retry must preserve filters.");
      }
      if (state === "filter-error") {
        assert.ok(proof.measurements?.invalidControls >= 3);
      }
    }
  }

  for (const [name, proof] of [
    ["clipped-category", report.negativeControl],
    ["uncontained-viewport", report.viewportNegativeControl],
  ]) {
    assert.equal(proof?.observed, true, `${name} negative control was not observed.`);
    assert.equal(proof?.restored, true, `${name} negative control was not restored.`);
  }

  return {
    files: [fileName],
    assertions: ["behavior:layout:desktop", "behavior:layout:mobile"],
    observations: {
      viewports: expectedViewports,
      currencies: ["BRL", "USD"],
      visualSectionCaptures: expectedViewports.length * 2 * 3 * 2,
      mobileStateCaptures: 6,
      negativeControls: ["clipped-category", "uncontained-viewport", "overlapping-money"],
    },
  };
}
