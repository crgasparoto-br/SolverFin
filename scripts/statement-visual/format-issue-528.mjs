import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { format } from "prettier";

const executeFile = promisify(execFile);
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const files = [
  "apps/web/src/dev-server/account-remuneration-disclosure-enhancement.ts",
  "apps/web/src/dev-server/transaction-group-pending-fixes.ts",
  "apps/web/src/dev-server/transaction-group-pending-fixes.test.ts",
  "scripts/run-statement-visual.mjs",
  "scripts/run-statement-visual-validation.mjs",
  "scripts/statement-visual/transaction-group-pending-fixes.mjs",
  "scripts/statement-visual/format-issue-528.mjs",
];

await mkdir(outputDir, { recursive: true });
for (const file of files) {
  const source = await readFile(file, "utf8");
  const formatted = await format(source, { filepath: file });
  await writeFile(join(outputDir, `${basename(file)}.formatted`), formatted);
}

let prettierOutput = "";
try {
  const result = await executeFile("node_modules/.bin/prettier", [
    ".",
    "--list-different",
  ]);
  prettierOutput = `${result.stdout}${result.stderr}`;
} catch (error) {
  prettierOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}
await writeFile(
  join(outputDir, "prettier-list-different.txt"),
  prettierOutput || "No differences.\n",
);
