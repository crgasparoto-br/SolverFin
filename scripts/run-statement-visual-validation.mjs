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
  await import("./statement-visual/issue-564-category-learning.mjs");
  await import("./statement-visual/issue-565-ai-review-queue.mjs");
  await import("./statement-visual/issue-565-ai-review-queue-states.mjs");
  await import("./statement-visual/issue-567-financial-insights.mjs");
  await import("./statement-visual/issue-568-financial-assistant.mjs");
  await import("./statement-visual/issue-568-financial-assistant-zoom-200-reflow.mjs");
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(join(outputDir, "fatal-error.log"), `${message}\n`);
  console.error(message);
  process.exitCode = 1;
}
