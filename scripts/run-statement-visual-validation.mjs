import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";

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
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(join(outputDir, "fatal-error.log"), `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
