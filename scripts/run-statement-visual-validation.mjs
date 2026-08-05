import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { format } from "prettier";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const formatDiagnosticFiles = [
  "apps/api/src/bank-message-inbox-payload-roundtrip.integration.test.ts",
  "apps/api/src/repositories/bank-message-inbox.ts",
];

await mkdir(join(outputDir, "format-diagnostic"), { recursive: true });
for (const file of formatDiagnosticFiles) {
  const source = await readFile(file, "utf8");
  const formatted = await format(source, { filepath: file });
  await writeFile(join(outputDir, "format-diagnostic", basename(file)), formatted);
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
  await import("./statement-visual/issue-548-inbox-ofx-review.mjs");
  await import("./statement-visual/inbox-status-control.mjs");
  await import("./statement-visual/inbox-date-filter.mjs");
  await import("./statement-visual/accounts-cards-interface.mjs");
  await import("./statement-visual/issue-537-hover-states.mjs");
  await import("./statement-visual/issue-539-operational-installments.mjs");
  await import("./statement-visual/issue-539-operational-installments-keyboard.mjs");
  await import("./statement-visual/issue-539-installment-grouping-guard.mjs");
  // The first issue 553 scenario validates ordinary retry and form behavior.
  await import("./statement-visual/issue-553-manual-installments-v2.mjs");
  // A canonical transfer must expose installment metadata in both account statements.
  await import("./statement-visual/issue-553-transfer-destination-visibility.mjs");
  // This scenario lets the backend commit, masks the response as 504, and proves exact recovery.
  await import("./statement-visual/issue-553-ambiguous-recovery.mjs");
  // The close action must remain focusable and usable while the form is locked for recovery.
  await import("./statement-visual/issue-553-ambiguous-close.mjs");
  // Non-idempotent producers must not present a blind retry after a committed-but-masked response.
  await import("./statement-visual/issue-553-non-idempotent-ambiguity.mjs");
  await import("./statement-visual/reports-category-evolution.mjs");
  await import("./statement-visual/issue-546-reports-category-controls.mjs");
  await import("./statement-visual/issue-546-selected-view-navigation.mjs");
  await import("./statement-visual/reports-installments-regression.mjs");
  await import("./statement-visual/settings-interface.mjs");
  await import("./statement-visual/settings-interface-reservations.mjs");
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(join(outputDir, "fatal-error.log"), `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
