import assert from "node:assert/strict";

const STATES = new Set(["multi-currency", "partial", "error", "long-content"]);
const REQUIRED_VIEWPORTS = [320, 390, 1366];

// Convert the Chrome-produced report into observed behavior, not a metadata-only claim.
// The screenshots and keyboard interactions must already have been exercised by the
// focused runner; this adapter never launches a second browser or synthesizes a pass.
export async function collectDashboard724Evidence(state, readEvidence, requireArtifact) {
  assert.ok(STATES.has(state), `Unsupported #724 Dashboard state: ${state}`);
  const fileName = `issue-724-dashboard-${state}.json`;
  const report = await readEvidence(fileName);
  assert.equal(report.route, "/dashboard", `${fileName} route mismatch`);
  assert.equal(report.state, state, `${fileName} state mismatch`);
  assert.match(report.provenance ?? "", /controlled API responses/);
  assert.deepEqual(report.failures ?? [], [], `${fileName} recorded browser failures`);

  const viewports = report.viewports ?? [];
  const widths = viewports.map((viewport) => viewport.width).sort((left, right) => left - right);
  assert.deepEqual(
    widths,
    REQUIRED_VIEWPORTS,
    `${fileName} lacks the exact Desktop/Mobile coverage`,
  );
  const artifacts = [fileName];
  for (const viewport of viewports) {
    const measurements = viewport.measurements ?? {};
    assert.equal(measurements.viewportWidth, viewport.width, "Chrome width mismatch");
    assert.equal(measurements.documentUrl, "about:blank", "Live page replaced controlled SSR");
    assert.equal(measurements.noHorizontalOverflow, true, "Dashboard has horizontal overflow");
    assert.equal(measurements.mainPresent, true, "Dashboard main region missing");
    assert.ok(viewport.screenshot, "Chrome viewport has no screenshot");
    await requireArtifact(viewport.screenshot);
    artifacts.push(viewport.screenshot);
    if (state === "error") {
      assert.equal(measurements.hasError, true, "SSR error state not rendered");
      assert.equal(measurements.currencyCount, 0, "Error state leaked currency summaries");
    } else {
      assert.equal(measurements.hasError, false, "Dashboard unexpectedly rendered an error");
      assert.equal(measurements.hasNextActions, true, "Dashboard next action missing");
      assert.equal(
        measurements.supportingAfterActions,
        true,
        "Supporting metrics precede decision",
      );
      assert.equal(measurements.amountsSeparatedByCurrency, true, "Currency amounts are missing");
      assert.equal(measurements.primaryCount, state === "multi-currency" ? 4 : 2);
      assert.deepEqual(
        measurements.currencies,
        state === "multi-currency" ? ["BRL", "USD"] : ["BRL"],
      );
      assert.equal(viewport.keyboard?.open, true, "Enter failed to open currency evidence");
      assert.equal(viewport.keyboard?.hash, "#dashboard-evidence-brl-available");
      if (state === "partial") {
        assert.equal(measurements.hasPartial, true, "Partial warning missing");
      }
      if (state === "long-content") {
        assert.equal(measurements.longItemVisible, true, "Long description fixture missing");
        assert.ok(viewport.expandedScreenshot, "Long evidence expansion screenshot missing");
        await requireArtifact(viewport.expandedScreenshot);
        artifacts.push(viewport.expandedScreenshot);
      }
    }
  }
  return {
    files: artifacts,
    assertions: ["behavior:layout:desktop", "behavior:layout:mobile"],
    observations: {
      state,
      widths,
      syntheticSSR: true,
      screenshotsVerified: artifacts.length - 1,
      keyboardVerified: state !== "error",
    },
  };
}
