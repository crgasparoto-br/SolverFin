import assert from "node:assert/strict";
import test from "node:test";

import {
  criticalStructuralComponents,
  legacyProcessorBaselineIds,
  legacyProcessorRetirementCoverage,
  pilotRoutes,
  visualScenarioModules,
} from "./coverage-contract.mjs";
import {
  buildExecutionEnvironment,
  buildExecutionResult,
  buildVisualScenarioExecutions,
  formatExecutionContext,
  getVisualScenarioModules,
} from "./issue-606-remediation-contract.mjs";
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
  const result = validateCoverageContract({
    scenarios: [...getVisualScenarioModules(visualScenarioModules), duplicate],
  });
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

test("a foundation fixture cannot substitute a pilot route alternate state", () => {
  const scenarios = getVisualScenarioModules(visualScenarioModules).filter(
    (scenario) => scenario.id !== "dashboard-empty-state",
  );
  const dashboardPilot = pilotRoutes.find((pilot) => pilot.route === "/dashboard");
  assert.ok(dashboardPilot);

  const result = validateCoverageContract({ scenarios, pilots: [dashboardPilot] });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("requires route-specific empty/error/alternate coverage") &&
        error.includes("/dashboard"),
    ),
  );
});

test("a secondary coverage failure keeps its exact route and state identity", () => {
  const executions = buildVisualScenarioExecutions(getVisualScenarioModules(visualScenarioModules));
  const emptyReportExecution = executions.find(
    (execution) =>
      execution.sourceScenarioId === "reports-category-evolution" &&
      execution.coverage[0]?.state === "empty",
  );
  assert.ok(emptyReportExecution);

  const failure = buildExecutionResult(
    emptyReportExecution,
    { code: 1, signal: null, error: null },
    "exit=1",
  );
  assert.equal(failure.result, "failed");
  assert.equal(failure.route, "/relatorios");
  assert.equal(failure.state, "empty");
  assert.match(formatExecutionContext(emptyReportExecution), /state=empty/);
  assert.doesNotMatch(formatExecutionContext(emptyReportExecution), /state=normal/);
});

test("candidate visual SHA replaces merge-preview SHA in child evidence", () => {
  const execution = buildVisualScenarioExecutions(
    getVisualScenarioModules(visualScenarioModules),
  )[0];
  const environment = buildExecutionEnvironment(execution, {
    GITHUB_SHA: "merge-preview-sha",
    STATEMENT_VISUAL_CANDIDATE_SHA: "material-head-sha",
  });

  assert.equal(environment.GITHUB_SHA, "material-head-sha");
  assert.equal(environment.STATEMENT_VISUAL_CANDIDATE_SHA, "material-head-sha");
});

test("new multi-coverage scenarios fail closed without a focused execution override", () => {
  const first = structuredClone(visualScenarioModules[0].coverage[0]);
  const second = { ...structuredClone(first), state: "empty", dataProfile: "empty-control" };
  assert.throws(
    () =>
      buildVisualScenarioExecutions([
        {
          id: "unmapped-multi-coverage-control",
          module: "scripts/statement-visual/unmapped-control.mjs",
          coverage: [first, second],
        },
      ]),
    /requires an explicit one-record execution module override/,
  );
});

test("legacy retirement evidence remains mandatory after an adapter disappears", () => {
  const legacyCoverage = { ...legacyProcessorRetirementCoverage };
  delete legacyCoverage[legacyProcessorBaselineIds[0]];
  const result = validateCoverageContract({ legacyCoverage, currentLegacyIds: [] });
  assert.ok(result.errors.some((error) => error.includes(legacyProcessorBaselineIds[0])));
});
