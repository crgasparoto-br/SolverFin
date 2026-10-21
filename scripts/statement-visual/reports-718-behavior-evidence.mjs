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

  const expectedViewports = ["1366x768", "390x844", "320x740"];
  const scenarios = report.multiCurrency ?? [];
  for (const viewport of expectedViewports) {
    const scenario = scenarios.find((candidate) => candidate.viewport === viewport);
    assert.ok(scenario, `${fileName} lacks multi-currency evidence for ${viewport}.`);
    const { measurements } = scenario;
    assert.ok(measurements.currencies?.includes("BRL"));
    assert.ok(measurements.currencies?.includes("USD"));
    assert.equal(measurements.currenciesComplete, true);
    assert.equal(measurements.globalOverflow, false);
    assert.equal(measurements.longLabelsReadable, true);
    if (viewport !== "1366x768") {
      assert.equal(measurements.trendScrollLocal, true);
      assert.equal(measurements.tableScrollLocal, true);
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
      negativeControls: ["clipped-category", "uncontained-viewport"],
    },
  };
}
