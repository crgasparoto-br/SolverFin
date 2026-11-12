import { fileURLToPath } from "node:url";

export function verifyGate(results) {
  const {
    RISK_PROFILE,
    CLASSIFY_RESULT,
    MERGE_PREVIEW_RESULT,
    FAST_RESULT,
    STANDARD_RESULT,
    CRITICAL_RESULT,
  } = results;
  if (CLASSIFY_RESULT !== "success") throw new Error("risk classification did not succeed");
  if (MERGE_PREVIEW_RESULT !== "success") throw new Error("merge preview did not succeed");
  const allowed = ["fast", "standard", "critical"];
  if (!allowed.includes(RISK_PROFILE)) throw new Error(`invalid risk profile: ${RISK_PROFILE}`);
  for (const profile of allowed) {
    const actual = results[`${profile.toUpperCase()}_RESULT`];
    const expected = profile === RISK_PROFILE ? "success" : "skipped";
    if (actual !== expected)
      throw new Error(`${profile} validation must be ${expected}, got ${actual}`);
  }
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    verifyGate(process.env);
    process.stdout.write("CI risk gate passed\n");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
