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
  isBehaviorAssertion,
} from "./statement-visual/issue-606-remediation-contract.mjs";
import {
  readSemanticProof,
  validateSemanticProof,
} from "./statement-visual/semantic-proof.mjs";
import { validateRepositoryCoverageContract } from "./validate-statement-visual-coverage.mjs";

const BEHAVIOR_CLAIM_MODULE =
  "scripts/statement-visual/issue-606-behavior-claims.mjs";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const semanticProofDir = join(outputDir, "semantic-proofs");
const candidateCommit =
  process.env.STATEMENT_VISUAL_CANDIDATE_SHA ??
  process.env.GITHUB_SHA ??
  "local";

await mkdir(outputDir, { recursive: true });
await mkdir(semanticProofDir, { recursive: true });

const registeredScenarios = getVisualScenarioModules(visualScenarioModules);
const executionScenarios = buildVisualScenarioExecutions(registeredScenarios);
const results = [];
const failures = [];
let contractValidation;

try {
  contractValidation = await validateRepositoryCoverageContract();
} catch (error) {
  failures.push({
    scenarioId: "coverage-contract",
    sourceScenarioId: "coverage-contract",
    module: "scripts/validate-statement-visual-coverage.mjs",
    coverageIndex: 0,
    route: "contract://visual-gate",
    state: "contract",
    layout: "n/a",
    interaction: "static-validation",
    message: serializeError(error),
  });
  await finalize();
  process.exitCode = 1;
}

if (failures.length === 0) {
  for (const scenario of executionScenarios) {
    const startedAt = new Date().toISOString();
    const result = await runScenario(scenario);
    results.push({
      ...result,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    if (result.result === "failed") failures.push(result);
  }

  await finalize();
  if (failures.length > 0) process.exitCode = 1;
}

async function runScenario(scenario) {
  const context = formatExecutionContext(scenario);
  console.log(`[visual-gate] START ${context}`);

  const behaviorAssertions =
    scenario.requiredAssertions.filter(isBehaviorAssertion);
  const primaryAssertions = scenario.requiredAssertions.filter(
    (assertionName) => !isBehaviorAssertion(assertionName),
  );
  const primaryProofPath = join(semanticProofDir, `${slug(scenario.id)}.json`);
  const behaviorProofPath = join(
    semanticProofDir,
    `${slug(scenario.id)}-behavior.json`,
  );

  const primaryEnvironment = buildExecutionEnvironment(scenario);
  if (primaryAssertions.length > 0) {
    primaryEnvironment.STATEMENT_VISUAL_PROOF_FILE = primaryProofPath;
  }
  const primaryOutcome = await runChild(scenario.module, primaryEnvironment);

  const proofParts = [];
  if (
    !primaryOutcome.error &&
    primaryOutcome.code === 0 &&
    primaryAssertions.length > 0
  ) {
    proofParts.push(
      await readAndValidateProof(
        { ...scenario, requiredAssertions: primaryAssertions },
        primaryProofPath,
        "primary",
      ),
    );
  } else if (primaryAssertions.length > 0) {
    proofParts.push(
      notObservedProof(primaryAssertions, primaryProofPath, "primary"),
    );
  }

  let behaviorOutcome = { code: 0, signal: null, error: null };
  if (
    !primaryOutcome.error &&
    primaryOutcome.code === 0 &&
    behaviorAssertions.length > 0
  ) {
    behaviorOutcome = await runChild(BEHAVIOR_CLAIM_MODULE, {
      ...buildExecutionEnvironment(scenario),
      STATEMENT_VISUAL_REQUIRED_ASSERTIONS: JSON.stringify(behaviorAssertions),
      STATEMENT_VISUAL_PROOF_FILE: behaviorProofPath,
    });

    if (!behaviorOutcome.error && behaviorOutcome.code === 0) {
      proofParts.push(
        await readAndValidateProof(
          { ...scenario, requiredAssertions: behaviorAssertions },
          behaviorProofPath,
          "behavior",
        ),
      );
    } else {
      proofParts.push(
        notObservedProof(behaviorAssertions, behaviorProofPath, "behavior"),
      );
    }
  } else if (behaviorAssertions.length > 0) {
    proofParts.push(
      notObservedProof(behaviorAssertions, behaviorProofPath, "behavior"),
    );
  }

  const semanticProof = combineProofParts(
    scenario.requiredAssertions,
    proofParts,
  );
  const semanticOk =
    semanticProof.status === "not-required" ||
    semanticProof.status === "passed";
  const outcome = chooseOutcome(primaryOutcome, behaviorOutcome);
  const failed = Boolean(outcome.error) || outcome.code !== 0 || !semanticOk;
  const message = failed
    ? buildFailureMessage(outcome, semanticProof)
    : undefined;
  const result = buildExecutionResult(
    scenario,
    { ...outcome, semanticOk },
    message,
  );
  result.coverage = scenario.coverage.map(toEvidenceCoverage);
  result.semanticProof = semanticProof;

  if (failed) console.error(`[visual-gate] FAIL ${context} :: ${message}`);
  else console.log(`[visual-gate] PASS ${context}`);
  return result;
}

async function runChild(modulePath, env) {
  const child = spawn(process.execPath, [modulePath], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.once("error", (error) =>
      resolve({ code: null, signal: null, error }),
    );
    child.once("exit", (code, signal) =>
      resolve({ code, signal, error: null }),
    );
  });
}

async function readAndValidateProof(execution, proofPath, kind) {
  try {
    const proof = await readSemanticProof(proofPath);
    const validation = validateSemanticProof(execution, proof);
    return {
      kind,
      status: validation.errors.length === 0 ? "passed" : "failed",
      ...validation,
      proofPath,
    };
  } catch (error) {
    return {
      kind,
      status: "failed",
      requiredAssertions: execution.requiredAssertions,
      observedAssertions: [],
      errors: [
        `Could not read ${kind} semantic proof: ${serializeError(error)}`,
      ],
      proofPath,
    };
  }
}

function notObservedProof(requiredAssertions, proofPath, kind) {
  return {
    kind,
    status: "not-observed",
    requiredAssertions,
    observedAssertions: [],
    errors: [],
    proofPath,
  };
}

function combineProofParts(requiredAssertions, proofParts) {
  if (requiredAssertions.length === 0) {
    return {
      status: "not-required",
      requiredAssertions: [],
      observedAssertions: [],
      errors: [],
      parts: [],
    };
  }

  const observedAssertions = [
    ...new Set(proofParts.flatMap((part) => part.observedAssertions ?? [])),
  ].sort();
  const errors = proofParts.flatMap((part) => part.errors ?? []);
  const missing = requiredAssertions.filter(
    (assertionName) => !observedAssertions.includes(assertionName),
  );
  if (missing.length > 0) {
    errors.push(
      `Combined semantic proof did not observe required assertions: ${missing.join(", ")}.`,
    );
  }
  return {
    status: errors.length === 0 ? "passed" : "failed",
    requiredAssertions,
    observedAssertions,
    errors,
    parts: proofParts,
  };
}

function chooseOutcome(primaryOutcome, behaviorOutcome) {
  if (primaryOutcome.error || primaryOutcome.code !== 0) return primaryOutcome;
  if (behaviorOutcome.error || behaviorOutcome.code !== 0)
    return behaviorOutcome;
  return primaryOutcome;
}

function buildFailureMessage(outcome, semanticProof) {
  if (outcome.error) return serializeError(outcome.error);
  if (outcome.code !== 0) {
    return `exit=${outcome.code ?? "null"}${outcome.signal ? ` signal=${outcome.signal}` : ""}`;
  }
  return semanticProof.errors.join("; ");
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
    requiredAssertions: record.requiredAssertions,
    legacyProcessorIds: record.legacyProcessorIds,
    fingerprint: flattened.fingerprint,
  };
}

async function finalize() {
  const index = {
    schemaVersion: 4,
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

  await writeFile(
    join(outputDir, "visual-gate-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  await writeFile(join(outputDir, "VISUAL-GATE.md"), renderMarkdown(index));

  if (failures.length > 0) {
    const fatal = failures
      .map(
        (failure) =>
          `[${failure.scenarioId}] sourceScenario=${failure.sourceScenarioId} ` +
          `route=${failure.route} state=${failure.state} layout=${failure.layout} ` +
          `interaction=${failure.interaction} :: ${failure.message}`,
      )
      .join("\n");
    await writeFile(join(outputDir, "fatal-error.log"), `${fatal}\n`);
    console.error(
      `[visual-gate] ${failures.length} coverage scenario(s) failed. ` +
        `See ${outputDir}/visual-gate-index.json.`,
    );
  } else {
    console.log(
      `[visual-gate] ${results.length} registered coverage executions passed.`,
    );
  }
}

function renderMarkdown(index) {
  const rows = index.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenarioId} | ${scenario.sourceScenarioId} | ${scenario.route} | ` +
        `${scenario.state} | ${scenario.layout} | ${scenario.interaction} | ` +
        `${scenario.semanticProof.status} | ${scenario.result} |`,
    )
    .join("\n");
  return `# Visual gate evidence

- Commit: \`${index.commit}\`
- Artifact: \`${index.artifactName}\`
- Registered modules: ${index.contract.modules}
- Execution units: ${index.contract.executionUnits}
- Coverage fingerprints: ${index.contract.coverageFingerprints}
- Failures: ${index.failures.length}

| Scenario | Source scenario | Route | State | Layout | Interaction | Semantic proof | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}
`;
}

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

function serializeError(error) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
