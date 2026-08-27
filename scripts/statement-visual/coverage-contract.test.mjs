import assert from "node:assert/strict";
import test from "node:test";

import {
  criticalStructuralComponents,
  criticalStructuralRealFlowComponents,
  criticalStructuralRealFlowCoverage,
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
import { validateSemanticProof } from "./semantic-proof.mjs";
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

test("a component fixture cannot satisfy critical structural real-flow coverage", () => {
  const result = validateCoverageContract({
    criticalComponents: ["PageContainer"],
    criticalRealFlowComponents: ["PageContainer"],
    criticalRealFlowCoverage: { PageContainer: ["ui-primitives"] },
  });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("lacks explicit real application-flow evidence: PageContainer") &&
        error.includes("ui-primitives"),
    ),
  );
});

test("a state fixture cannot impersonate a real structural filter flow", () => {
  const result = validateCoverageContract({
    criticalComponents: ["FilterBar"],
    criticalRealFlowComponents: ["FilterBar"],
    criticalRealFlowCoverage: { FilterBar: ["foundation-states"] },
  });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("lacks explicit real application-flow evidence: FilterBar") &&
        error.includes("foundation-states"),
    ),
  );
});

test("a route-shaped record without real-browser execution cannot satisfy structural coverage", () => {
  const scenarios = getVisualScenarioModules(visualScenarioModules).map((scenario) => {
    if (scenario.id !== "core-pages") return structuredClone(scenario);
    return {
      ...structuredClone(scenario),
      coverage: scenario.coverage.map((record) => ({
        ...structuredClone(record),
        realBrowser: false,
      })),
    };
  });
  const result = validateCoverageContract({
    scenarios,
    criticalComponents: ["PageContainer"],
    criticalRealFlowComponents: ["PageContainer"],
    criticalRealFlowCoverage: { PageContainer: ["core-pages"] },
  });
  assert.ok(
    result.errors.some((error) =>
      error.includes("lacks explicit real application-flow evidence: PageContainer"),
    ),
  );
});

test("a route-shaped record without an explicit component claim cannot satisfy structural coverage", () => {
  const scenarios = getVisualScenarioModules(visualScenarioModules).map((scenario) => {
    if (scenario.id !== "core-pages") return structuredClone(scenario);
    return {
      ...structuredClone(scenario),
      coverage: scenario.coverage.map((record) => ({
        ...structuredClone(record),
        components: record.components.filter((component) => component !== "PageContainer"),
      })),
    };
  });
  const result = validateCoverageContract({
    scenarios,
    criticalComponents: ["PageContainer"],
    criticalRealFlowComponents: ["PageContainer"],
    criticalRealFlowCoverage: { PageContainer: ["core-pages"] },
  });
  assert.ok(
    result.errors.some((error) =>
      error.includes("lacks explicit real application-flow evidence: PageContainer"),
    ),
  );
});

test("canonical structural real-flow mappings cover only critical components", () => {
  assert.deepEqual(
    [...criticalStructuralRealFlowComponents].sort(),
    Object.keys(criticalStructuralRealFlowCoverage).sort(),
  );
  for (const component of criticalStructuralRealFlowComponents) {
    assert.ok(criticalStructuralComponents.includes(component));
    assert.ok(criticalStructuralRealFlowCoverage[component].length > 0);
  }
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
    { code: 1, signal: null, error: null, semanticOk: false },
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

test("focused overrides cannot retain interaction metadata without semantic assertions", () => {
  const scenarios = getVisualScenarioModules(visualScenarioModules).map((scenario) => {
    if (scenario.id !== "cards-interface") return structuredClone(scenario);
    const clone = structuredClone(scenario);
    clone.coverage[0].requiredAssertions = [];
    return clone;
  });
  const result = validateCoverageContract({ scenarios });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("cards-interface") && error.includes("without semantic assertions"),
    ),
  );
});

test("semantic proof rejects a missing declared interaction while identity stays correct", () => {
  const execution = buildVisualScenarioExecutions(getVisualScenarioModules(visualScenarioModules)).find(
    (item) => item.sourceScenarioId === "cards-interface" && item.coverage[0]?.state === "normal",
  );
  assert.ok(execution);
  const validation = validateSemanticProof(execution, {
    schemaVersion: 1,
    scenarioId: execution.id,
    sourceScenarioId: execution.sourceScenarioId,
    route: execution.coverage[0].route,
    state: execution.coverage[0].state,
    assertions: ["filters"],
  });
  assert.ok(validation.errors.some((error) => error.includes("modal")));
});

test("semantic proof rejects a sibling route identity even when assertions are complete", () => {
  const execution = buildVisualScenarioExecutions(getVisualScenarioModules(visualScenarioModules)).find(
    (item) => item.sourceScenarioId === "cards-interface" && item.coverage[0]?.state === "normal",
  );
  assert.ok(execution);
  const validation = validateSemanticProof(execution, {
    schemaVersion: 1,
    scenarioId: execution.id,
    sourceScenarioId: execution.sourceScenarioId,
    route: "/rota-irma",
    state: execution.coverage[0].state,
    assertions: ["filters", "modal"],
  });
  assert.ok(validation.errors.some((error) => error.includes("route")));
});

test("legacy retirement evidence remains mandatory after an adapter disappears", () => {
  const legacyCoverage = { ...legacyProcessorRetirementCoverage };
  delete legacyCoverage[legacyProcessorBaselineIds[0]];
  const result = validateCoverageContract({ legacyCoverage, currentLegacyIds: [] });
  assert.ok(result.errors.some((error) => error.includes(legacyProcessorBaselineIds[0])));
});

test("legacy retirement mapping cannot survive when the mapped scenario drops its responsibility claim", () => {
  const scenarios = getVisualScenarioModules(visualScenarioModules).map((scenario) => {
    if (scenario.id !== "accounts-cards-interface") return structuredClone(scenario);
    const clone = structuredClone(scenario);
    clone.coverage[0].legacyProcessorIds = clone.coverage[0].legacyProcessorIds.filter(
      (id) => id !== "accounts-cards-tabs",
    );
    return clone;
  });
  const result = validateCoverageContract({ scenarios });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("accounts-cards-tabs") &&
        error.includes("explicit equivalent-responsibility claim"),
    ),
  );
});

test("a second legacy surface fails closed when metadata survives but equivalent behavior is unclaimed", () => {
  const scenarios = getVisualScenarioModules(visualScenarioModules).map((scenario) => {
    if (scenario.id !== "cards-interface") return structuredClone(scenario);
    const clone = structuredClone(scenario);
    clone.coverage[0].legacyProcessorIds = clone.coverage[0].legacyProcessorIds.filter(
      (id) => id !== "card-list-sorting",
    );
    return clone;
  });
  const result = validateCoverageContract({ scenarios });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("card-list-sorting") &&
        error.includes("explicit equivalent-responsibility claim"),
    ),
  );
});
