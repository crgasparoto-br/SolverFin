import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";

try {
  await import("./statement-visual/main.mjs");
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(join(outputDir, "fatal-error.log"), `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
