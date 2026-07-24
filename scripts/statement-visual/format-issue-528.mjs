import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { format } from "prettier";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const files = [
  "apps/web/src/dev-server/account-remuneration-disclosure-enhancement.ts",
  "apps/web/src/dev-server/transaction-group-pending-fixes.ts",
  "apps/web/src/dev-server/transaction-group-pending-fixes.test.ts",
  "scripts/run-statement-visual.mjs",
  "scripts/statement-visual/transaction-group-pending-fixes.mjs",
];

await mkdir(outputDir, { recursive: true });
for (const file of files) {
  const source = await readFile(file, "utf8");
  const formatted = await format(source, { filepath: file });
  await writeFile(join(outputDir, `${basename(file)}.formatted`), formatted);
}
