import { spawnSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const formattedDir = join(outputDir, "repository-formatted");
const finalRunnerPath = "scripts/run-statement-visual-validation.final.mjs";
const finalRunner = `import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";

try {
  await import("./statement-visual/main.mjs");
  await import("./statement-visual/transaction-group-layout.mjs");
  await import("./statement-visual/transaction-group-modal.mjs");
  await import("./statement-visual/transaction-group-pending-fixes.mjs");
  await import("./statement-visual/transaction-bulk-selection.mjs");
  await import("./statement-visual/transaction-bulk-selection-keyboard.mjs");
  await import("./statement-visual/transaction-bulk-selection-clearance.mjs");
  await import("./statement-visual/inbox-category-hierarchy.mjs");
  await import("./statement-visual/inbox-status-control.mjs");
  await import("./statement-visual/inbox-date-filter.mjs");
  await import("./statement-visual/accounts-cards-interface.mjs");
  await import("./statement-visual/issue-537-hover-states.mjs");
  await import("./statement-visual/issue-539-operational-installments.mjs");
  await import("./statement-visual/issue-539-operational-installments-keyboard.mjs");
  await import("./statement-visual/issue-539-installment-grouping-guard.mjs");
  await import("./statement-visual/reports-category-evolution.mjs");
  await import("./statement-visual/reports-installments-regression.mjs");
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(join(outputDir, "fatal-error.log"), \`\${message}\\n\`);
  console.error(message);
  process.exitCode = 1;
}
`;

await mkdir(formattedDir, { recursive: true });
await writeFile(finalRunnerPath, finalRunner);
const formatResult = spawnSync("npm", ["run", "format"], {
  encoding: "utf8",
});
const paths = [
  "apps/api/src/category-evolution-report-router.integration.test.ts",
  "apps/api/src/reports-router.ts",
  "apps/web/src/dev-server/reports-installments-view.ts",
  "apps/web/src/dev-server/reports-route-page.test.ts",
  "scripts/statement-visual/reports-installments-regression.mjs",
  finalRunnerPath,
];
for (const path of paths) {
  const target = join(formattedDir, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(path, target);
}
await writeFile(
  join(outputDir, "format-export.json"),
  `${JSON.stringify(
    {
      status: formatResult.status,
      stdout: formatResult.stdout,
      stderr: formatResult.stderr,
      paths,
    },
    null,
    2,
  )}\n`,
);
console.error("Repository-formatted files exported for remediation.");
process.exitCode = 1;
