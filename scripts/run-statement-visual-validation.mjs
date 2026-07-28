import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { format } from "prettier";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const formatSnapshotDir = join(outputDir, "format-snapshot");
const formatSnapshotFiles = [
  "apps/api/src/reports-router.ts",
  "apps/api/src/category-evolution-report-router.integration.test.ts",
  "apps/web/src/dev-server/reports-installments-view.ts",
  "apps/web/src/dev-server/reports-route-page-styles.ts",
  "apps/web/src/dev-server/reports-route-page.test.ts",
  "docs/REPORTS.md",
  "scripts/statement-visual/reports-installments-regression.mjs",
  "scripts/run-statement-visual-validation.mjs",
];

await mkdir(formatSnapshotDir, { recursive: true });
for (const filepath of formatSnapshotFiles) {
  const source = await readFile(filepath, "utf8");
  const formatted = await format(source, { filepath });
  const target = join(formatSnapshotDir, filepath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, formatted);
}

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
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(join(outputDir, "fatal-error.log"), `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
