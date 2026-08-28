const SEMANTIC_INTERACTION_MODULE = "scripts/statement-visual/issue-606-semantic-interactions.mjs";

export const BEHAVIOR_ASSERTION_PREFIX = "behavior:";

const MULTI_COVERAGE_EXECUTION_MODULES = new Map([
  [
    "core-pages",
    [
      SEMANTIC_INTERACTION_MODULE,
      "scripts/statement-visual/issue-606-core-pages-execution.mjs",
      "scripts/statement-visual/issue-606-core-pages-execution.mjs",
      "scripts/statement-visual/issue-606-core-pages-execution.mjs",
    ],
  ],
  [
    "reports-category-evolution",
    [
      SEMANTIC_INTERACTION_MODULE,
      "scripts/statement-visual/issue-606-reports-execution.mjs",
      "scripts/statement-visual/issue-606-reports-execution.mjs",
    ],
  ],
  [
    "cards-interface",
    [SEMANTIC_INTERACTION_MODULE, "scripts/statement-visual/issue-606-cards-execution.mjs"],
  ],
]);

const RECORD_ENRICHMENTS = new Map([
  [
    "core-pages:0",
    {
      requiredAssertions: ["focus", "overflow"],
      components: ["PageContainer", "PageHeader", "DataTable"],
      legacyProcessorIds: ["statement-list-sorting", "statement-insight-context"],
    },
  ],
  ["core-pages:1", { components: ["PageContainer", "PageHeader"] }],
  [
    "reports-category-evolution:0",
    {
      requiredAssertions: ["focus", "overflow"],
      components: ["FilterBar", "SummaryGrid", "DataTable"],
    },
  ],
  [
    "cards-interface:0",
    {
      requiredAssertions: ["filters", "modal"],
      components: ["SummaryGrid"],
      legacyProcessorIds: [
        "card-list-sorting",
        "card-instrument-subtotals",
        "cards-interface",
        "cards-interface-finalizer",
      ],
    },
  ],
]);

const SCENARIO_ENRICHMENTS = new Map([
  [
    "accounts-cards-interface",
    {
      components: ["DetailLayout", "Dialog", "Tabs"],
      legacyProcessorIds: [
        "accounts-cards-tabs",
        "accounts-cards-standardization",
        "accounts-cards-action-menus",
      ],
    },
  ],
  ["settings-interface", { components: ["FormLayout", "Dialog"] }],
  ["sidebar-navigation", { components: ["Drawer"] }],
  ["categories-interface", { legacyProcessorIds: ["categories-icons-tooltips"] }],
  [
    "cards-interface-adversarial",
    { legacyProcessorIds: ["cards-interface", "cards-interface-finalizer"] },
  ],
  [
    "account-remuneration",
    { legacyProcessorIds: ["statement-list-sorting", "account-remuneration-disclosure"] },
  ],
  ["account-remuneration-mobile", { legacyProcessorIds: ["account-remuneration-disclosure"] }],
  ["financial-insights", { legacyProcessorIds: ["statement-insight-context"] }],
  ["inbox-interface-refinement", { legacyProcessorIds: ["inbox-list-layout"] }],
  ["bank-message-ai-inbox", { legacyProcessorIds: ["inbox-structured-payload"] }],
  ["inbox-interface-accessibility", { legacyProcessorIds: ["inbox-list-layout"] }],
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
  return [...baseScenarios.map(enrichScenario), ...supplementalVisualScenarioModules];
}

export function buildVisualScenarioExecutions(scenarios) {
  return scenarios.flatMap((scenario) => {
    if (!Array.isArray(scenario.coverage) || scenario.coverage.length === 0) {
      throw new Error(`Scenario ${scenario.id ?? "<unknown>"} has no executable coverage.`);
    }

    if (scenario.coverage.length === 1) {
      return [executionFor(scenario, scenario.coverage[0], 0, scenario.module, scenario.id)];
    }

    const executionModules = MULTI_COVERAGE_EXECUTION_MODULES.get(scenario.id);
    if (!executionModules || executionModules.length !== scenario.coverage.length) {
      throw new Error(
        `Scenario ${scenario.id} has ${scenario.coverage.length} coverage records and requires an explicit one-record execution module override for every record.`,
      );
    }

    return scenario.coverage.map((record, coverageIndex) => {
      const suffix = `${coverageIndex}-${slug(record.route)}-${slug(record.state)}`;
      return executionFor(
        scenario,
        record,
        coverageIndex,
        executionModules[coverageIndex],
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
    sourceModule: execution.sourceModule ?? execution.module,
    module: execution.module,
    coverageIndex: execution.coverageIndex ?? 0,
    route: record.route,
    state: record.state,
    layout: record.layout,
    interaction: record.interaction,
    requiredAssertions: execution.requiredAssertions ?? record.requiredAssertions ?? [],
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
  const failed = Boolean(outcome.error) || outcome.code !== 0 || outcome.semanticOk === false;
  return {
    ...executionIdentity(execution),
    result: failed ? "failed" : "passed",
    ...(failed ? { message } : {}),
  };
}

export function isBehaviorAssertion(value) {
  return typeof value === "string" && value.startsWith(BEHAVIOR_ASSERTION_PREFIX);
}

export function behaviorClaimAssertionsForRecord(record) {
  const assertions = [];
  const realFlow = isRealApplicationFlowRoute(record.route);

  if (realFlow) {
    for (const component of record.components ?? []) {
      assertions.push(`${BEHAVIOR_ASSERTION_PREFIX}component:${component}`);
    }
  }

  for (const legacyId of record.legacyProcessorIds ?? []) {
    assertions.push(`${BEHAVIOR_ASSERTION_PREFIX}legacy:${legacyId}`);
  }

  if (realFlow && record.layout === "desktop-mobile") {
    assertions.push(`${BEHAVIOR_ASSERTION_PREFIX}layout:desktop`);
    assertions.push(`${BEHAVIOR_ASSERTION_PREFIX}layout:mobile`);
  }

  return unique(assertions);
}

function enrichScenario(scenario) {
  const scenarioEnrichment = SCENARIO_ENRICHMENTS.get(scenario.id) ?? {};
  return {
    ...scenario,
    coverage: scenario.coverage.map((record, index) => {
      const recordEnrichment = RECORD_ENRICHMENTS.get(`${scenario.id}:${index}`) ?? {};
      return mergeCoverage(record, scenarioEnrichment, recordEnrichment);
    }),
  };
}

function mergeCoverage(record, ...enrichments) {
  const merged = { ...record };
  for (const enrichment of enrichments) {
    if (enrichment.components) {
      merged.components = unique([...(merged.components ?? []), ...enrichment.components]);
    }
    if (enrichment.legacyProcessorIds) {
      merged.legacyProcessorIds = unique([
        ...(merged.legacyProcessorIds ?? []),
        ...enrichment.legacyProcessorIds,
      ]);
    }
    if (enrichment.requiredAssertions) {
      merged.requiredAssertions = unique([
        ...(merged.requiredAssertions ?? []),
        ...enrichment.requiredAssertions,
      ]);
    }
  }
  merged.components ??= [];
  merged.legacyProcessorIds ??= [];
  merged.requiredAssertions ??= [];
  merged.requiredAssertions = unique([
    ...merged.requiredAssertions,
    ...behaviorClaimAssertionsForRecord(merged),
  ]);
  return merged;
}

function executionFor(source, record, coverageIndex, module, id) {
  return {
    id,
    sourceScenarioId: source.id,
    sourceModule: source.module,
    module,
    coverageIndex,
    requiredAssertions: record.requiredAssertions ?? [],
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
    requiredAssertions: [],
    legacyProcessorIds: [],
  };
}

function isRealApplicationFlowRoute(route) {
  return typeof route === "string" && (route.startsWith("/") || route.startsWith("shell://"));
}

function unique(values) {
  return [...new Set(values)];
}

function slug(value) {
  return (
    String(value)
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "surface"
  );
}
