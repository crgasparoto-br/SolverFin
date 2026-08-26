import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  criticalStructuralComponents,
  flattenCoverageRecords,
  legacyProcessorBaselineIds,
  legacyProcessorRetirementCoverage,
  pilotRoutes,
  visualScenarioModules,
} from "./statement-visual/coverage-contract.mjs";

const ALTERNATIVE_STATES = new Set([
  "alternate",
  "empty",
  "error",
  "recoverable-error",
  "permission",
  "unavailable",
]);

export function validateCoverageContract({
  scenarios = visualScenarioModules,
  pilots = pilotRoutes,
  criticalComponents = criticalStructuralComponents,
  legacyBaselineIds = legacyProcessorBaselineIds,
  legacyCoverage = legacyProcessorRetirementCoverage,
  currentLegacyIds = legacyProcessorBaselineIds,
} = {}) {
  const errors = [];
  const scenarioIds = new Set();
  const modules = new Set();

  for (const scenario of scenarios) {
    if (!scenario.id || typeof scenario.id !== "string")
      errors.push("Scenario without id.");
    if (!scenario.module || typeof scenario.module !== "string") {
      errors.push(`Scenario ${scenario.id ?? "<unknown>"} without module.`);
    }
    if (scenarioIds.has(scenario.id))
      errors.push(`Duplicate scenario id: ${scenario.id}.`);
    if (modules.has(scenario.module))
      errors.push(`Duplicate scenario module: ${scenario.module}.`);
    scenarioIds.add(scenario.id);
    modules.add(scenario.module);
    if (!Array.isArray(scenario.coverage) || scenario.coverage.length === 0) {
      errors.push(`Scenario ${scenario.id} has no coverage records.`);
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
    for (const key of [
      "route",
      "audience",
      "state",
      "layout",
      "interaction",
      "dataProfile",
    ]) {
      if (!record[key] || typeof record[key] !== "string") {
        errors.push(
          `Scenario ${record.scenarioId} has invalid coverage field ${key}.`,
        );
      }
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
    const covered = records.some(
      (record) => record.realBrowser === true && record.components?.includes(component),
    );
    if (!covered)
      errors.push(
        `Critical structural component lacks real-browser coverage: ${component}.`,
      );
  }

  const hasKeyboardFocus = records.some((record) =>
    /keyboard|focus/.test(record.interaction),
  );
  const hasZoomReflow = records.some(
    (record) => record.layout === "zoom-200-reflow",
  );
  const hasLongContent = records.some(
    (record) => record.state === "long-content" || /long-content/.test(record.dataProfile),
  );
  const hasOverflow = records.some((record) =>
    /overflow/.test(record.interaction),
  );
  if (!hasKeyboardFocus)
    errors.push("Representative keyboard/focus coverage is missing.");
  if (!hasZoomReflow)
    errors.push("Representative 200% zoom/reflow coverage is missing.");
  if (!hasLongContent)
    errors.push("Representative long-content coverage is missing.");
  if (!hasOverflow)
    errors.push("Representative overflow coverage is missing.");

  for (const pilot of pilots) {
    const routeRecords = records.filter((record) => record.route === pilot.route);
    if (!routeRecords.some((record) => record.state === "normal")) {
      errors.push(`Pilot route lacks normal-state coverage: ${pilot.route}.`);
    }
    if (!routeRecords.some((record) => /mobile/.test(record.layout))) {
      errors.push(`Pilot route lacks mobile coverage: ${pilot.route}.`);
    }

    const hasRouteAlternative = routeRecords.some((record) =>
      ALTERNATIVE_STATES.has(record.state),
    );
    const hasFoundationAlternative = records.some(
      (record) =>
        record.realBrowser === true &&
        ALTERNATIVE_STATES.has(record.state) &&
        record.archetypeSupport?.includes(pilot.archetype),
    );

    if (pilot.adoption === "migrated") {
      if (!hasRouteAlternative) {
        errors.push(
          `Migrated pilot route requires route-specific empty/error/alternate coverage: ${pilot.route}.`,
        );
      }
    } else if (!hasRouteAlternative && !hasFoundationAlternative) {
      errors.push(
        `Pilot route ${pilot.route} lacks route or foundation alternate-state coverage for ${pilot.archetype}.`,
      );
    }
  }

  const requiredLegacyIds = new Set([...legacyBaselineIds, ...currentLegacyIds]);
  for (const id of requiredLegacyIds) {
    const mappedScenarioIds = legacyCoverage[id];
    if (!Array.isArray(mappedScenarioIds) || mappedScenarioIds.length === 0) {
      errors.push(
        `Legacy processor has no preserved visual retirement coverage: ${id}.`,
      );
      continue;
    }
    for (const scenarioId of mappedScenarioIds) {
      if (!scenarioIds.has(scenarioId)) {
        errors.push(
          `Legacy processor ${id} references unknown visual scenario ${scenarioId}.`,
        );
      }
    }
  }

  return { errors, records };
}

export async function validateRepositoryCoverageContract({ root = process.cwd() } = {}) {
  const legacySourcePath = `${root}/apps/web/src/dev-server/legacy-html-post-processors.ts`;
  const legacySource = await readFile(legacySourcePath, "utf8");
  const currentLegacyIds = [...legacySource.matchAll(/\bid:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  const result = validateCoverageContract({ currentLegacyIds });

  for (const scenario of visualScenarioModules) {
    try {
      await access(`${root}/${scenario.module}`, fsConstants.R_OK);
    } catch {
      result.errors.push(
        `Registered visual scenario module does not exist: ${scenario.module}.`,
      );
    }
  }

  if (result.errors.length > 0) {
    const error = new Error(
      `Visual coverage contract failed:\n- ${result.errors.join("\n- ")}`,
    );
    error.validationErrors = result.errors;
    throw error;
  }
  return result;
}

function serializeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const result = await validateRepositoryCoverageContract();
  console.log(
    `Visual coverage contract passed: ${visualScenarioModules.length} modules, ${result.records.length} coverage fingerprints, ${pilotRoutes.length} pilot routes.`,
  );
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
