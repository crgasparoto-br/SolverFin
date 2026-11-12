import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  criticalStructuralComponents,
  criticalStructuralRealFlowComponents,
  criticalStructuralRealFlowCoverage,
  flattenCoverageRecords,
  legacyProcessorBaselineIds,
  legacyProcessorRetirementCoverage,
  pilotRoutes,
  visualScenarioModules,
} from "./statement-visual/coverage-contract.mjs";
import {
  behaviorClaimAssertionsForRecord,
  buildVisualScenarioExecutions,
  getVisualScenarioModules,
} from "./statement-visual/issue-606-remediation-contract.mjs";
import { validateSemanticProof } from "./statement-visual/semantic-proof.mjs";

const ALTERNATIVE_STATES = new Set([
  "alternate",
  "empty",
  "error",
  "recoverable-error",
  "permission",
  "unavailable",
]);

const REQUIRED_COVERAGE_FIELDS = [
  "route",
  "audience",
  "state",
  "layout",
  "interaction",
  "dataProfile",
];

const SEMANTIC_BINDING_INTERACTIONS = new Set([
  "overflow-and-focus",
  "keyboard-focus-overflow",
  "filters-modal",
]);

export function isRealApplicationFlowRoute(route) {
  return typeof route === "string" && (route.startsWith("/") || route.startsWith("shell://"));
}

export function validateCoverageContract({
  scenarios = getVisualScenarioModules(visualScenarioModules),
  pilots = pilotRoutes,
  criticalComponents = criticalStructuralComponents,
  criticalRealFlowComponents = criticalStructuralRealFlowComponents,
  criticalRealFlowCoverage = criticalStructuralRealFlowCoverage,
  legacyBaselineIds = legacyProcessorBaselineIds,
  legacyCoverage = legacyProcessorRetirementCoverage,
  currentLegacyIds = legacyProcessorBaselineIds,
} = {}) {
  const errors = [];
  const scenarioIds = new Set();
  const modules = new Set();

  for (const scenario of scenarios) {
    if (!scenario.id || typeof scenario.id !== "string") {
      errors.push("Scenario without id.");
    }
    if (!scenario.module || typeof scenario.module !== "string") {
      errors.push(`Scenario ${scenario.id ?? "<unknown>"} without module.`);
    }
    if (scenarioIds.has(scenario.id)) {
      errors.push(`Duplicate scenario id: ${scenario.id}.`);
    }
    if (modules.has(scenario.module)) {
      errors.push(`Duplicate scenario module: ${scenario.module}.`);
    }
    scenarioIds.add(scenario.id);
    modules.add(scenario.module);
    if (!Array.isArray(scenario.coverage) || scenario.coverage.length === 0) {
      errors.push(`Scenario ${scenario.id} has no coverage records.`);
    }
  }

  let executions = [];
  try {
    executions = buildVisualScenarioExecutions(scenarios);
  } catch (error) {
    errors.push(`Could not build one-record visual executions: ${serializeError(error)}.`);
  }

  for (const execution of executions) {
    if (!Array.isArray(execution.coverage) || execution.coverage.length !== 1) {
      errors.push(`Execution ${execution.id} is not bound to exactly one coverage record.`);
    }
    const interaction = execution.coverage?.[0]?.interaction;
    const usesFocusedOverride =
      execution.sourceModule && execution.sourceModule !== execution.module;
    if (
      usesFocusedOverride &&
      SEMANTIC_BINDING_INTERACTIONS.has(interaction) &&
      execution.requiredAssertions.length === 0
    ) {
      errors.push(
        `Execution ${execution.id} declares high-risk interaction ${interaction} without semantic assertions.`,
      );
    }
  }

  let records = [];
  try {
    records = flattenCoverageRecords(scenarios);
  } catch (error) {
    errors.push(`Could not flatten coverage records: ${serializeError(error)}.`);
  }

  const fingerprints = new Map();
  for (const record of records) {
    for (const key of REQUIRED_COVERAGE_FIELDS) {
      if (!record[key] || typeof record[key] !== "string") {
        errors.push(`Scenario ${record.scenarioId} has invalid coverage field ${key}.`);
      }
    }

    for (const field of ["components", "requiredAssertions", "legacyProcessorIds"]) {
      if (!Array.isArray(record[field])) {
        errors.push(`Scenario ${record.scenarioId} has invalid ${field} contract.`);
      } else if (new Set(record[field]).size !== record[field].length) {
        errors.push(`Scenario ${record.scenarioId} has duplicate values in ${field}.`);
      }
    }

    const expectedBehaviorAssertions = behaviorClaimAssertionsForRecord(record);
    const missingBehaviorAssertions = expectedBehaviorAssertions.filter(
      (assertionName) => !record.requiredAssertions?.includes(assertionName),
    );
    if (missingBehaviorAssertions.length > 0) {
      errors.push(
        `Scenario ${record.scenarioId} declares behavior claims without required observed assertions: ${missingBehaviorAssertions.join(", ")}.`,
      );
    }

    const previous = fingerprints.get(record.fingerprint);
    if (previous) {
      errors.push(
        `Equivalent visual fingerprint duplicated by ${previous.scenarioId} and ${record.scenarioId}: ${record.route} / ${record.state} / ${record.layout} / ${record.interaction} / ${record.dataProfile}.`,
      );
    } else {
      fingerprints.set(record.fingerprint, record);
    }
  }

  for (const component of criticalComponents) {
    const covered = records.some((record) => {
      return record.realBrowser === true && record.components?.includes(component);
    });
    if (!covered) {
      errors.push(`Critical foundation component lacks real-browser coverage: ${component}.`);
    }
  }

  const criticalComponentSet = new Set(criticalComponents);
  for (const component of criticalRealFlowComponents) {
    if (!criticalComponentSet.has(component)) {
      errors.push(`Real-flow structural component is not registered as critical: ${component}.`);
      continue;
    }

    const mappedScenarioIds = criticalRealFlowCoverage[component];
    if (!Array.isArray(mappedScenarioIds) || mappedScenarioIds.length === 0) {
      errors.push(
        `Critical structural component lacks real application-flow mapping: ${component}.`,
      );
      continue;
    }

    const requiredAssertion = `behavior:component:${component}`;
    const coveredByRealFlow = mappedScenarioIds.some((scenarioId) => {
      if (!scenarioIds.has(scenarioId)) return false;
      return records.some(
        (record) =>
          record.scenarioId === scenarioId &&
          record.realBrowser === true &&
          isRealApplicationFlowRoute(record.route) &&
          record.components?.includes(component) &&
          record.requiredAssertions?.includes(requiredAssertion),
      );
    });

    if (!coveredByRealFlow) {
      errors.push(
        `Critical structural component lacks observed real application-flow evidence: ${component}. ` +
          `Mapped scenarios: ${mappedScenarioIds.join(", ")}.`,
      );
    }
  }

  for (const [component, mappedScenarioIds] of Object.entries(criticalRealFlowCoverage)) {
    if (!criticalRealFlowComponents.includes(component)) {
      errors.push(
        `Real application-flow mapping references a non-structural component: ${component}.`,
      );
    }
    if (!Array.isArray(mappedScenarioIds) || mappedScenarioIds.length === 0) continue;
    for (const scenarioId of mappedScenarioIds) {
      if (!scenarioIds.has(scenarioId)) {
        errors.push(
          `Critical structural component ${component} references unknown real-flow scenario ${scenarioId}.`,
        );
      }
    }
  }

  const hasKeyboardFocus = records.some((record) => /keyboard|focus/.test(record.interaction));
  const hasZoomReflow = records.some((record) => record.layout === "zoom-200-reflow");
  const hasLongContent = records.some((record) => {
    return record.state === "long-content" || /long-content/.test(record.dataProfile);
  });
  const hasOverflow = records.some((record) => /overflow/.test(record.interaction));

  if (!hasKeyboardFocus) errors.push("Representative keyboard/focus coverage is missing.");
  if (!hasZoomReflow) errors.push("Representative 200% zoom/reflow coverage is missing.");
  if (!hasLongContent) errors.push("Representative long-content coverage is missing.");
  if (!hasOverflow) errors.push("Representative overflow coverage is missing.");

  for (const pilot of pilots) {
    const routeRecords = records.filter((record) => record.route === pilot.route);
    if (!routeRecords.some((record) => record.state === "normal")) {
      errors.push(`Pilot route lacks normal-state coverage: ${pilot.route}.`);
    }
    if (!routeRecords.some((record) => /mobile/.test(record.layout))) {
      errors.push(`Pilot route lacks mobile coverage: ${pilot.route}.`);
    }

    const hasRouteAlternative = routeRecords.some((record) => ALTERNATIVE_STATES.has(record.state));
    if (!hasRouteAlternative) {
      errors.push(
        `Pilot route requires route-specific empty/error/alternate coverage: ${pilot.route}.`,
      );
    }
  }

  const requiredLegacyIds = new Set([...legacyBaselineIds, ...currentLegacyIds]);
  for (const id of requiredLegacyIds) {
    const mappedScenarioIds = legacyCoverage[id];
    if (!Array.isArray(mappedScenarioIds) || mappedScenarioIds.length === 0) {
      errors.push(`Legacy processor has no preserved visual retirement coverage: ${id}.`);
      continue;
    }
    for (const scenarioId of mappedScenarioIds) {
      if (!scenarioIds.has(scenarioId)) {
        errors.push(`Legacy processor ${id} references unknown visual scenario ${scenarioId}.`);
        continue;
      }
      const requiredAssertion = `behavior:legacy:${id}`;
      const hasObservedResponsibility = records.some(
        (record) =>
          record.scenarioId === scenarioId &&
          record.legacyProcessorIds?.includes(id) &&
          record.requiredAssertions?.includes(requiredAssertion),
      );
      if (!hasObservedResponsibility) {
        errors.push(
          `Legacy processor ${id} mapped scenario ${scenarioId} lacks an observed equivalent-responsibility assertion.`,
        );
      }
    }
  }

  return { errors, records, scenarios, executions };
}

export async function validateRepositoryCoverageContract({ root = process.cwd() } = {}) {
  const legacySourcePath = `${root}/apps/web/src/dev-server/legacy-html-post-processors.ts`;
  const legacySource = await readFile(legacySourcePath, "utf8");
  const currentLegacyIds = [...legacySource.matchAll(/\bid:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  const scenarios = getVisualScenarioModules(visualScenarioModules);
  const result = validateCoverageContract({ scenarios, currentLegacyIds });

  const modulePaths = new Set([
    ...scenarios.map((scenario) => scenario.module),
    ...result.executions.map((execution) => execution.module),
    "scripts/statement-visual/issue-606-behavior-claims.mjs",
  ]);
  for (const modulePath of modulePaths) {
    try {
      await access(`${root}/${modulePath}`, fsConstants.R_OK);
    } catch {
      result.errors.push(`Registered visual execution module does not exist: ${modulePath}.`);
    }
  }

  if (result.errors.length > 0) {
    const error = new Error(`Visual coverage contract failed:\n- ${result.errors.join("\n- ")}`);
    error.validationErrors = result.errors;
    throw error;
  }
  return result;
}

export function runBehaviorClaimMutationControls() {
  const canonical = getVisualScenarioModules(visualScenarioModules);

  const componentMutation = structuredClone(canonical);
  const corePages = componentMutation.find((scenario) => scenario.id === "core-pages");
  const coreRecord = corePages?.coverage?.[0];
  if (!coreRecord) throw new Error("Behavior mutation control could not find core-pages record 0.");
  coreRecord.requiredAssertions = coreRecord.requiredAssertions.filter(
    (assertionName) => assertionName !== "behavior:component:PageContainer",
  );
  const componentResult = validateCoverageContract({
    scenarios: componentMutation,
    pilots: [],
    criticalComponents: ["PageContainer"],
    criticalRealFlowComponents: ["PageContainer"],
    criticalRealFlowCoverage: { PageContainer: ["core-pages"] },
    legacyBaselineIds: [],
    legacyCoverage: {},
    currentLegacyIds: [],
  });
  requireMutationFailure(
    componentResult.errors,
    "behavior:component:PageContainer",
    "Component metadata survived without observed behavior assertion.",
  );

  const legacyMutation = structuredClone(canonical);
  const cards = legacyMutation.find((scenario) => scenario.id === "cards-interface");
  const cardsRecord = cards?.coverage?.[0];
  if (!cardsRecord) {
    throw new Error("Behavior mutation control could not find cards-interface record 0.");
  }
  cardsRecord.requiredAssertions = cardsRecord.requiredAssertions.filter(
    (assertionName) => assertionName !== "behavior:legacy:card-list-sorting",
  );
  const legacyResult = validateCoverageContract({
    scenarios: legacyMutation,
    pilots: [],
    criticalComponents: [],
    criticalRealFlowComponents: [],
    criticalRealFlowCoverage: {},
    legacyBaselineIds: ["card-list-sorting"],
    legacyCoverage: { "card-list-sorting": ["cards-interface"] },
    currentLegacyIds: [],
  });
  requireMutationFailure(
    legacyResult.errors,
    "behavior:legacy:card-list-sorting",
    "Legacy responsibility metadata survived without observed behavior assertion.",
  );

  const layoutMutation = structuredClone(canonical);
  const layoutCore = layoutMutation.find((scenario) => scenario.id === "core-pages");
  const layoutRecord = layoutCore?.coverage?.[0];
  if (!layoutRecord) throw new Error("Behavior mutation control could not find layout record.");
  layoutRecord.requiredAssertions = layoutRecord.requiredAssertions.filter(
    (assertionName) => assertionName !== "behavior:layout:mobile",
  );
  const layoutResult = validateCoverageContract({
    scenarios: layoutMutation,
    pilots: [],
    criticalComponents: [],
    criticalRealFlowComponents: [],
    criticalRealFlowCoverage: {},
    legacyBaselineIds: [],
    legacyCoverage: {},
    currentLegacyIds: [],
  });
  requireMutationFailure(
    layoutResult.errors,
    "behavior:layout:mobile",
    "desktop-mobile metadata survived without mobile behavior assertion.",
  );

  const proofExecution = {
    id: "behavior-proof-mutation",
    sourceScenarioId: "behavior-proof-mutation",
    requiredAssertions: ["behavior:legacy:card-list-sorting"],
    coverage: [{ route: "/cartoes", state: "normal" }],
  };
  const proofValidation = validateSemanticProof(proofExecution, {
    schemaVersion: 1,
    scenarioId: proofExecution.id,
    sourceScenarioId: proofExecution.sourceScenarioId,
    route: "/cartoes",
    state: "normal",
    assertions: [],
  });
  requireMutationFailure(
    proofValidation.errors,
    "behavior:legacy:card-list-sorting",
    "Behavior metadata survived while the observed proof omitted the capability.",
  );
}

function requireMutationFailure(errors, expectedFragment, message) {
  if (!errors.some((error) => error.includes(expectedFragment))) {
    throw new Error(`${message} Expected an error containing ${expectedFragment}.`);
  }
}

function serializeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  runBehaviorClaimMutationControls();
  const result = await validateRepositoryCoverageContract();
  console.log(
    `Visual coverage contract passed: ${result.scenarios.length} modules, ` +
      `${result.executions.length} one-record executions, ${result.records.length} coverage fingerprints, ` +
      `${pilotRoutes.length} pilot routes.`,
  );
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  return import.meta.url === pathToFileURL(entrypoint).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
