import assert from "node:assert/strict";
import test from "node:test";

import { behaviorClaimAssertionsForRecord } from "./issue-606-remediation-contract.mjs";
import { validateSemanticProof } from "./semantic-proof.mjs";

const cases = [
  {
    id: "budgets-normal",
    route: "/orcamentos",
    state: "normal",
    interaction: "viewport-smoke",
    dataProfile: "demo-seed",
  },
  {
    id: "dashboard-empty",
    route: "/dashboard",
    state: "empty",
    interaction: "state-render",
    dataProfile: "fresh-profile",
  },
  {
    id: "accounts-cards-empty",
    route: "/contas-cartoes",
    state: "empty",
    interaction: "state-render",
    dataProfile: "fresh-profile",
  },
];

for (const scenario of cases) {
  test(`${scenario.id} requires observed mobile proof even without component or legacy claims`, () => {
    const record = {
      route: scenario.route,
      audience: "authenticated",
      state: scenario.state,
      layout: "desktop-mobile",
      interaction: scenario.interaction,
      dataProfile: scenario.dataProfile,
      components: [],
      legacyProcessorIds: [],
    };
    const requiredAssertions = behaviorClaimAssertionsForRecord(record);

    assert.deepEqual(requiredAssertions, [
      "behavior:layout:desktop",
      "behavior:layout:mobile",
    ]);

    const execution = {
      id: scenario.id,
      sourceScenarioId: scenario.id,
      requiredAssertions,
      coverage: [record],
    };
    const mutation = validateSemanticProof(execution, {
      schemaVersion: 1,
      scenarioId: scenario.id,
      sourceScenarioId: scenario.id,
      route: scenario.route,
      state: scenario.state,
      assertions: ["behavior:layout:desktop"],
    });

    assert.ok(
      mutation.errors.some((error) => error.includes("behavior:layout:mobile")),
      "metadata-only desktop-mobile coverage must fail when mobile behavior is unobserved",
    );
  });
}

test("component fixtures remain outside real-flow desktop-mobile behavior binding", () => {
  const assertions = behaviorClaimAssertionsForRecord({
    route: "component://foundation-states",
    audience: "authenticated",
    state: "alternate",
    layout: "desktop-mobile",
    interaction: "keyboard-focus-state-render",
    dataProfile: "all-foundation-states",
    components: [],
    legacyProcessorIds: [],
  });
  assert.deepEqual(assertions, []);
});
