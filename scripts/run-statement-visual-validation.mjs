import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  flattenCoverageRecords,
  visualScenarioModules,
} from "./statement-visual/coverage-contract.mjs";
import {
  buildExecutionEnvironment,
  buildExecutionResult,
  buildVisualScenarioExecutions,
  formatExecutionContext,
  getVisualScenarioModules,
} from "./statement-visual/issue-606-remediation-contract.mjs";
import { validateRepositoryCoverageContract } from "./validate-statement-visual-coverage.mjs";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const candidateCommit =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? "local";
await mkdir(outputDir, { recursive: true });

const registeredScenarios = getVisualScenarioModules(visualScenarioModules);
const executionScenarios = buildVisualScenarioExecutions(registeredScenarios);
const results = [];
const failures = [];
let contractValidation;

let contractReady = true;
try {
  contractValidation = await validateRepositoryCoverageContract();
} catch (error) {
  const failure = {
    scenarioId: "coverage-contract",
    sourceScenarioId: "coverage-contract",
    module: "scripts/validate-statement-visual-coverage.mjs",
    coverageIndex: 0,
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
  for (const scenario of executionScenarios) {
    const startedAt = new Date().toISOString();
    const result = await runScenario(scenario);
    results.push({ ...result, startedAt, finishedAt: new Date().toISOString() });
    if (result.result === "failed") {
      failures.push(result);
    }
  }

  await finalize();
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function runScenario(scenario) {
  const context = formatExecutionContext(scenario);
  console.log(`[visual-gate] START ${context}`);
  const child = spawn(process.execPath, [scenario.module], {
    cwd: process.cwd(),
    env: buildExecutionEnvironment(scenario),
    stdio: "inherit",
  });

  const outcome = await new Promise((resolve) => {
    child.once("error", (error) => {
      resolve({ code: null, signal: null, error });
    });
    child.once("exit", (code, signal) => {
      resolve({ code, signal, error: null });
    });
  });

  const failed = outcome.error || outcome.code !== 0;
  const message = failed
    ? outcome.error
      ? serializeError(outcome.error)
      : `exit=${outcome.code ?? "null"}${outcome.signal ? ` signal=${outcome.signal}` : ""}`
    : undefined;
  const result = buildExecutionResult(scenario, outcome, message);
  result.coverage = scenario.coverage.map(toEvidenceCoverage);

  if (failed) {
    console.error(`[visual-gate] FAIL ${context} :: ${message}`);
  } else {
    console.log(`[visual-gate] PASS ${context}`);
  }
  return result;
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

async function finalize() {
  const index = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    commit: candidateCommit,
    artifactName:
      candidateCommit !== "local"
        ? `statement-visual-evidence-${candidateCommit}`
        : "statement-visual-evidence-local",
    contract: {
      modules: registeredScenarios.length,
      executionUnits: executionScenarios.length,
      coverageFingerprints: contractValidation?.records.length ?? 0,
    },
    failures: failures.map((failure) => ({
      scenarioId: failure.scenarioId,
      sourceScenarioId: failure.sourceScenarioId,
      module: failure.module,
      coverageIndex: failure.coverageIndex,
      route: failure.route,
      state: failure.state,
      layout: failure.layout,
      interaction: failure.interaction,
      message: failure.message,
    })),
    scenarios: results,
  };

  const indexPath = join(outputDir, "visual-gate-index.json");
  const indexContents = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(indexPath, indexContents);
  await writeFile(join(outputDir, "VISUAL-GATE.md"), renderMarkdown(index));

  if (failures.length > 0) {
    await writeFile(
      join(outputDir, "fatal-error.log"),
      `${failures
        .map(
          (failure) =>
            `[${failure.scenarioId}] sourceScenario=${failure.sourceScenarioId} route=${failure.route} state=${failure.state} layout=${failure.layout} interaction=${failure.interaction} :: ${failure.message}`,
        )
        .join("\n")}\n`,
    );
  }

  if (failures.length > 0) {
    const failureSummary =
      `[visual-gate] ${failures.length} coverage scenario(s) failed. ` +
      `See ${outputDir}/visual-gate-index.json.`;
    console.error(failureSummary);
  } else {
    console.log(`[visual-gate] ${results.length} registered coverage executions passed.`);
  }
}

function renderMarkdown(index) {
  const rows = index.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${scenario.sourceScenarioId} | ${scenario.route} | ${scenario.state} | ${scenario.layout} | ${scenario.interaction} | ${scenario.result} |`,
    )
    .join("\n");
  return `# Visual gate evidence\n\n- Commit: \`${index.commit}\`\n- Artifact: \`${index.artifactName}\`\n- Registered modules: ${index.contract.modules}\n- Execution units: ${index.contract.executionUnits}\n- Coverage fingerprints: ${index.contract.coverageFingerprints}\n- Failures: ${index.failures.length}\n\n| Scenario | Source scenario | Route | State | Layout | Interaction | Result |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows}\n`;
}

function serializeError(error) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
