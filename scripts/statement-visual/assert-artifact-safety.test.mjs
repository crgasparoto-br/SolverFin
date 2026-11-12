import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loginExpression } from "./fixtures.mjs";
import { assertArtifactDirectorySafe, findSensitiveEvidence } from "./assert-artifact-safety.mjs";

test("login helper never exposes the raw authentication response", () => {
  const expression = loginExpression();
  assert.doesNotMatch(expression, /response\.text\(\)/);
  assert.match(expression, /body:\s*"\[redacted\]"/);
});

test("clean and explicitly redacted evidence is accepted", async () => {
  await withArtifacts(async (directory) => {
    await writeFile(
      join(directory, "diagnostic.json"),
      JSON.stringify({ login: { ok: true, status: 200, body: "[redacted]" } }),
    );
    await assert.doesNotReject(assertArtifactDirectorySafe(directory));
  });
});

test("literal session-token leak is rejected without echoing the secret", () => {
  const secret = "sf_exampleSessionToken_123456789";
  const findings = findSensitiveEvidence(JSON.stringify({ body: secret }), "diagnostic.json");
  assert.deepEqual(findings, [{ file: "diagnostic.json", line: 1, rule: "SESSION_TOKEN" }]);
  assert.equal(JSON.stringify(findings).includes(secret), false);
});

test("authorization header sibling is rejected", () => {
  const findings = findSensitiveEvidence(
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    "server.log",
  );
  assert.ok(findings.some((finding) => finding.rule === "BEARER_TOKEN"));
});

test("session cookie sibling is rejected", () => {
  const findings = findSensitiveEvidence(
    "Set-Cookie: session=abcdefghijklmnop1234567890; Path=/; HttpOnly",
    "server.log",
  );
  assert.ok(findings.some((finding) => finding.rule === "SENSITIVE_FIELD"));
});

test("raw auth payload sibling is rejected", () => {
  const findings = findSensitiveEvidence(
    JSON.stringify({ access_token: "abcdefghijklmnop1234567890" }),
    "response.json",
  );
  assert.ok(findings.some((finding) => finding.rule === "SENSITIVE_FIELD"));
});

async function withArtifacts(run) {
  const directory = await mkdtemp(join(tmpdir(), "solverfin-artifact-safety-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
