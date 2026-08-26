import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  flattenCoverageRecords,
  visualScenarioModules,
} from "./statement-visual/coverage-contract.mjs";
import { validateRepositoryCoverageContract } from "./validate-statement-visual-coverage.mjs";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
await mkdir(outputDir, { recursive: true });

const results = [];
const failures = [];
let contractValidation;

let contractReady = true;
try {
  contractValidation = await validateRepositoryCoverageContract();
} catch (error) {
  const failure = {
    scenarioId: "coverage-contract",
    module: "scripts/validate-statement-visual-coverage.mjs",
    route: "contract://visual-gate",
    state: "contract",
    layout: "n/a",
    interaction: "static-validation",
    message: serializeError(error),
  };
  failures.push(failure);
  await finalize();
  process.exitCode = 1;
  contractReady = false;
}
if (contractReady) {
  for (const scenario of visualScenarioModules) {
    const startedAt = new Date().toISOString();
    const result = await runScenario(scenario);
    results.push({ ...result, startedAt, finishedAt: new Date().toISOString() });
    if (result.result === "failed") failures.push(result);
  }

  await finalize();
  if (failures.length > 0) process.exitCode = 1;
}

async function runScenario(scenario) {
  const primary = scenario.coverage[0];
  const context = formatContext(scenario, primary);
  console.log(`[visual-gate] START ${context}`);
  const child = spawn(process.execPath, [scenario.module], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const outcome = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, error }));
    child.once("exit", (code, signal) => resolve({ code, signal, error: null }));
  });

  if (outcome.error || outcome.code !== 0) {
    const message = outcome.error
      ? serializeError(outcome.error)
      : `exit=${outcome.code ?? "null"}${outcome.signal ? ` signal=${outcome.signal}` : ""}`;
    console.error(`[visual-gate] FAIL ${context} :: ${message}`);
    return {
      scenarioId: scenario.id,
      module: scenario.module,
      route: primary.route,
      state: primary.state,
      layout: primary.layout,
      interaction: primary.interaction,
      result: "failed",
      message,
      coverage: scenario.coverage.map(toEvidenceCoverage),
    };
  }

  console.log(`[visual-gate] PASS ${context}`);
  return {
    scenarioId: scenario.id,
    module: scenario.module,
    route: primary.route,
    state: primary.state,
    layout: primary.layout,
    interaction: primary.interaction,
    result: "passed",
    coverage: scenario.coverage.map(toEvidenceCoverage),
  };
}

function toEvidenceCoverage(record) {
  const flattened = flattenCoverageRecords([
    { id: "evidence", module: "evidence", coverage: [record] },
  ])[0];
  return {
    route: record.route,
    archetype: record.archetype,
    audience: record.audience,
    state: record.state,
    layout: record.layout,
    interaction: record.interaction,
    dataProfile: record.dataProfile,
    components: record.components,
    fingerprint: flattened.fingerprint,
  };
}

function formatContext(scenario, coverage) {
  return `scenario=${scenario.id} route=${coverage.route} state=${coverage.state} layout=${coverage.layout} interaction=${coverage.interaction}`;
}

async function finalize() {
  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? "local",
    artifactName:
      process.env.GITHUB_SHA && process.env.GITHUB_SHA !== "local"
        ? `statement-visual-evidence-${process.env.GITHUB_SHA}`
        : "statement-visual-evidence-local",
    contract: {
      modules: visualScenarioModules.length,
      coverageFingerprints: contractValidation?.records.length ?? 0,
    },
    failures: failures.map((failure) => ({
      scenarioId: failure.scenarioId,
      module: failure.module,
      route: failure.route,
      state: failure.state,
      layout: failure.layout,
      interaction: failure.interaction,
      message: failure.message,
    })),
    scenarios: results,
  };

  await writeFile(
    join(outputDir, "visual-gate-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  await writeFile(join(outputDir, "VISUAL-GATE.md"), renderMarkdown(index));
  if (failures.length > 0) {
    await writeFile(
      join(outputDir, "fatal-error.log"),
      `${failures
        .map(
          (failure) =>
            `[${failure.scenarioId}] route=${failure.route} state=${failure.state} layout=${failure.layout} interaction=${failure.interaction} :: ${failure.message}`,
        )
        .join("\n")}\n`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `[visual-gate] ${failures.length} scenario(s) failed. See ${outputDir}/visual-gate-index.json.`,
    );
  } else {
    console.log(`[visual-gate] ${results.length} registered scenario modules passed.`);
  }
}

function renderMarkdown(index) {
  const rows = index.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${scenario.route} | ${scenario.state} | ${scenario.layout} | ${scenario.interaction} | ${scenario.result} |`,
    )
    .join("\n");
  return `# Visual gate evidence\n\n- Commit: \`${index.commit}\`\n- Artifact: \`${index.artifactName}\`\n- Registered modules: ${index.contract.modules}\n- Coverage fingerprints: ${index.contract.coverageFingerprints}\n- Failures: ${index.failures.length}\n\n| Scenario | Route | State | Layout | Interaction | Result |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n`;
}

function serializeError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
