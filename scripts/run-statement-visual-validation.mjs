import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";

await mkdir(outputDir, { recursive: true });
const prettierCheck = spawnSync(
  "pnpm exec prettier . --check",
  { encoding: "utf8", shell: true },
);
const diagnostic = {
  status: prettierCheck.status,
  signal: prettierCheck.signal,
  error:
    prettierCheck.error instanceof Error
      ? {
          name: prettierCheck.error.name,
          message: prettierCheck.error.message,
          stack: prettierCheck.error.stack,
        }
      : prettierCheck.error,
  stdout: prettierCheck.stdout,
  stderr: prettierCheck.stderr,
  output: prettierCheck.output,
};
await writeFile(
  join(outputDir, "prettier-check.json"),
  `${JSON.stringify(diagnostic, null, 2)}\n`,
);
console.error(JSON.stringify(diagnostic));
process.exitCode = 1;
