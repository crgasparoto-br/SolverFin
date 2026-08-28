import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const VISUAL_SEMANTIC_PROOF_VERSION = 1;

export function normalizeAssertions(assertions = []) {
  if (!Array.isArray(assertions)) return [];
  return [
    ...new Set(
      assertions.filter(
        (value) => typeof value === "string" && value.length > 0,
      ),
    ),
  ].sort();
}

export async function writeSemanticProof(assertions, details = {}) {
  const proofPath = process.env.STATEMENT_VISUAL_PROOF_FILE;
  if (!proofPath) {
    throw new Error(
      "STATEMENT_VISUAL_PROOF_FILE is required for semantic visual proof.",
    );
  }

  const proof = {
    schemaVersion: VISUAL_SEMANTIC_PROOF_VERSION,
    scenarioId: process.env.STATEMENT_VISUAL_SCENARIO_ID ?? "",
    sourceScenarioId: process.env.STATEMENT_VISUAL_SOURCE_SCENARIO_ID ?? "",
    route: process.env.STATEMENT_VISUAL_ROUTE ?? "",
    state: process.env.STATEMENT_VISUAL_STATE ?? "",
    assertions: normalizeAssertions(assertions),
    details,
  };

  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  return proof;
}

export async function readSemanticProof(proofPath) {
  return JSON.parse(await readFile(proofPath, "utf8"));
}

export function validateSemanticProof(execution, proof) {
  const errors = [];
  const requiredAssertions = normalizeAssertions(execution.requiredAssertions ?? []);
  if (requiredAssertions.length === 0) {
    return { errors, requiredAssertions, observedAssertions: [] };
  }

  if (!proof || proof.schemaVersion !== VISUAL_SEMANTIC_PROOF_VERSION) {
    errors.push(
      `Execution ${execution.id} did not emit semantic proof version ${VISUAL_SEMANTIC_PROOF_VERSION}.`,
    );
    return { errors, requiredAssertions, observedAssertions: [] };
  }

  const expectedIdentity = {
    scenarioId: execution.id,
    sourceScenarioId: execution.sourceScenarioId ?? execution.id,
    route: execution.coverage?.[0]?.route,
    state: execution.coverage?.[0]?.state,
  };
  for (const [key, expected] of Object.entries(expectedIdentity)) {
    if (proof[key] !== expected) {
      errors.push(
        `Execution ${execution.id} semantic proof identity mismatch for ${key}: expected ${expected}, observed ${proof[key]}.`,
      );
    }
  }

  const observedAssertions = normalizeAssertions(proof.assertions);
  const missing = requiredAssertions.filter(
    (assertion) => !observedAssertions.includes(assertion),
  );
  if (missing.length > 0) {
    errors.push(
      `Execution ${execution.id} did not prove required semantic assertions: ${missing.join(", ")}.`,
    );
  }

  return { errors, requiredAssertions, observedAssertions };
}
