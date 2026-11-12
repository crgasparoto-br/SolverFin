import test from "node:test";
import assert from "node:assert/strict";
import { verifyGate } from "./ci-gate.mjs";

const profiles = ["fast", "standard", "critical"];
function fixture(profile) {
  return {
    RISK_PROFILE: profile,
    CLASSIFY_RESULT: "success",
    MERGE_PREVIEW_RESULT: "success",
    FAST_RESULT: profile === "fast" ? "success" : "skipped",
    STANDARD_RESULT: profile === "standard" ? "success" : "skipped",
    CRITICAL_RESULT: profile === "critical" ? "success" : "skipped",
  };
}
for (const profile of profiles) {
  test(`${profile.toUpperCase()} gate accepts exactly one successful path`, () => {
    assert.equal(verifyGate(fixture(profile)), true);
  });
  test(`${profile.toUpperCase()} gate rejects failure of selected path`, () => {
    const inputs = fixture(profile);
    inputs[`${profile.toUpperCase()}_RESULT`] = "failure";
    assert.throws(() => verifyGate(inputs));
  });
  test(`${profile.toUpperCase()} gate rejects accidental extra path`, () => {
    const inputs = fixture(profile);
    const other = profiles.find((candidate) => candidate !== profile);
    inputs[`${other.toUpperCase()}_RESULT`] = "success";
    assert.throws(() => verifyGate(inputs));
  });
}
test("gate rejects failed classification and merge preview", () => {
  assert.throws(() => verifyGate({ ...fixture("critical"), CLASSIFY_RESULT: "failure" }));
  assert.throws(() => verifyGate({ ...fixture("critical"), MERGE_PREVIEW_RESULT: "failure" }));
});
test("gate rejects unknown or absent risk profile", () => {
  assert.throws(() => verifyGate({ ...fixture("critical"), RISK_PROFILE: "unknown" }));
  assert.throws(() => verifyGate({ ...fixture("critical"), RISK_PROFILE: "" }));
});
