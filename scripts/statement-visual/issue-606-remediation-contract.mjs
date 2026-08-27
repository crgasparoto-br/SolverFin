const MULTI_COVERAGE_EXECUTION_MODULES = new Map([
  ["core-pages", "scripts/statement-visual/issue-606-core-pages-execution.mjs"],
  ["reports-category-evolution", "scripts/statement-visual/issue-606-reports-execution.mjs"],
  ["cards-interface", "scripts/statement-visual/issue-606-cards-execution.mjs"],
]);

export const supplementalVisualScenarioModules = [
  {
    id: "dashboard-empty-state",
    module: "scripts/statement-visual/issue-606-dashboard-empty.mjs",
    coverage: [pilotEmptyCoverage("/dashboard", "A1")],
  },
  {
    id: "accounts-cards-empty-state",
    module: "scripts/statement-visual/issue-606-accounts-cards-empty.mjs",
    coverage: [pilotEmptyCoverage("/contas-cartoes", "A3")],
  },
  {
    id: "budgets-empty-state",
    module: "scripts/statement-visual/issue-606-budgets-empty.mjs",
    coverage: [pilotEmptyCoverage("/orcamentos", "A1")],
  },
];

export function getVisualScenarioModules(baseScenarios) {
  return [...baseScenarios, ...supplementalVisualScenarioModules];
}

export function buildVisualScenarioExecutions(scenarios) {
  return scenarios.flatMap((scenario) => {
    if (!Array.isArray(scenario.coverage) || scenario.coverage.length === 0) {
      throw new Error(`Scenario ${scenario.id ?? "<unknown>"} has no executable coverage.`);
    }

    if (scenario.coverage.length === 1) {
      return [executionFor(scenario, scenario.coverage[0], 0, scenario.module, scenario.id)];
    }

    const executionModule = MULTI_COVERAGE_EXECUTION_MODULES.get(scenario.id);
    if (!executionModule) {
      throw new Error(
        `Scenario ${scenario.id} has ${scenario.coverage.length} coverage records and requires an explicit one-record execution module override.`,
      );
    }

    return scenario.coverage.map((record, coverageIndex) => {
      const suffix = `${coverageIndex}-${slug(record.route)}-${slug(record.state)}`;
      return executionFor(
        scenario,
        record,
        coverageIndex,
        executionModule,
        `${scenario.id}::${suffix}`,
      );
    });
  });
}

export function executionIdentity(execution) {
  if (!Array.isArray(execution.coverage) || execution.coverage.length !== 1) {
    throw new Error(
      `Execution ${execution.id ?? "<unknown>"} must contain exactly one coverage record.`,
    );
  }
  const record = execution.coverage[0];
  return {
    scenarioId: execution.id,
    sourceScenarioId: execution.sourceScenarioId ?? execution.id,
    module: execution.module,
    coverageIndex: execution.coverageIndex ?? 0,
    route: record.route,
    state: record.state,
    layout: record.layout,
    interaction: record.interaction,
  };
}

export function formatExecutionContext(execution) {
  const identity = executionIdentity(execution);
  return `scenario=${identity.scenarioId} sourceScenario=${identity.sourceScenarioId} route=${identity.route} state=${identity.state} layout=${identity.layout} interaction=${identity.interaction}`;
}

export function buildExecutionEnvironment(execution, baseEnvironment = process.env) {
  const identity = executionIdentity(execution);
  const candidateSha = baseEnvironment.STATEMENT_VISUAL_CANDIDATE_SHA;
  return {
    ...baseEnvironment,
    ...(candidateSha ? { GITHUB_SHA: candidateSha } : {}),
    STATEMENT_VISUAL_SCENARIO_ID: identity.scenarioId,
    STATEMENT_VISUAL_SOURCE_SCENARIO_ID: identity.sourceScenarioId,
    STATEMENT_VISUAL_COVERAGE_INDEX: String(identity.coverageIndex),
    STATEMENT_VISUAL_ROUTE: identity.route,
    STATEMENT_VISUAL_STATE: identity.state,
    STATEMENT_VISUAL_LAYOUT: identity.layout,
    STATEMENT_VISUAL_INTERACTION: identity.interaction,
  };
}

export function buildExecutionResult(execution, outcome, message) {
  const failed = Boolean(outcome.error) || outcome.code !== 0;
  return {
    ...executionIdentity(execution),
    result: failed ? "failed" : "passed",
    ...(failed ? { message } : {}),
  };
}

function executionFor(source, record, coverageIndex, module, id) {
  return {
    id,
    sourceScenarioId: source.id,
    module,
    coverageIndex,
    coverage: [record],
  };
}

function pilotEmptyCoverage(route, archetype) {
  return {
    route,
    archetype,
    audience: "authenticated",
    state: "empty",
    layout: "desktop-mobile",
    interaction: "state-render",
    dataProfile: "fresh-profile",
    components: [],
    realBrowser: true,
    archetypeSupport: [],
  };
}

function slug(value) {
  return (
    String(value)
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "surface"
  );
}
