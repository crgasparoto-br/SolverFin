import { execFileSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const formatDiagnosticDir = join(outputDir, "format-cli");
const formatDiagnosticFiles = [
  "apps/api/src/bank-message-inbox-payload-roundtrip.integration.test.ts",
  "apps/api/src/repositories/bank-message-inbox.ts",
];
const formatDiagnosticTargets = formatDiagnosticFiles.map((file) =>
  join(formatDiagnosticDir, file),
);

for (let index = 0; index < formatDiagnosticFiles.length; index += 1) {
  const source = formatDiagnosticFiles[index];
  const target = formatDiagnosticTargets[index];
  if (source === undefined || target === undefined) continue;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
execFileSync(
  process.execPath,
  ["node_modules/prettier/bin/prettier.cjs", "--write", ...formatDiagnosticTargets],
  { stdio: "inherit" },
);

throw new Error("FORMAT_CLI_DIAGNOSTIC_COMPLETE");
