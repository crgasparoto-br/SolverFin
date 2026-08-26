import assert from "node:assert/strict";
import test from "node:test";

import {
  criticalStructuralComponents,
  legacyProcessorBaselineIds,
  legacyProcessorRetirementCoverage,
  pilotRoutes,
  visualScenarioModules,
} from "./coverage-contract.mjs";
import { validateCoverageContract } from "../validate-statement-visual-coverage.mjs";

test("canonical visual coverage contract is internally consistent", () => {
  const result = validateCoverageContract();
  assert.deepEqual(result.errors, []);
});

test("equivalent route/state/layout/interaction/data fingerprints are rejected", () => {
  const duplicate = structuredClone(visualScenarioModules[0]);
  duplicate.id = "duplicate-fingerprint-control";
  duplicate.module = "scripts/statement-visual/duplicate-fingerprint-control.mjs";
  duplicate.coverage = [structuredClone(visualScenarioModules[0].coverage[0])];
  const result = validateCoverageContract({ scenarios: [...visualScenarioModules, duplicate] });
  assert.ok(
    result.errors.some((error) => error.includes("Equivalent visual fingerprint duplicated")),
  );
});

test("critical component coverage cannot disappear silently", () => {
  const result = validateCoverageContract({
    criticalComponents: [...criticalStructuralComponents, "MissingCriticalPrimitive"],
  });
  assert.ok(result.errors.some((error) => error.includes("MissingCriticalPrimitive")));
});

test("a migrated pilot requires its own alternate-state browser evidence", () => {
  const pilots = pilotRoutes.map((pilot) =>
    pilot.route === "/dashboard" ? { ...pilot, adoption: "migrated" } : pilot,
  );
  const result = validateCoverageContract({ pilots });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("Migrated pilot route requires route-specific") &&
        error.includes("/dashboard"),
    ),
  );
});

test("legacy retirement evidence remains mandatory after an adapter disappears", () => {
  const legacyCoverage = { ...legacyProcessorRetirementCoverage };
  delete legacyCoverage[legacyProcessorBaselineIds[0]];
  const result = validateCoverageContract({ legacyCoverage, currentLegacyIds: [] });
  assert.ok(result.errors.some((error) => error.includes(legacyProcessorBaselineIds[0])));
});
