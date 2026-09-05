import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const outputFiles = [
  "artifacts/statement-visual/inbox-date-filter.json",
  "artifacts/statement-visual/issue-473-account-edit.json",
  "artifacts/statement-visual/issue-480-sidebar.json",
  "artifacts/statement-visual/issue-490-account-remuneration.json",
  "artifacts/statement-visual/issue-525-inbox-interface-refinement.json",
  "artifacts/statement-visual/issue-535-accounts-cards.json",
  "artifacts/statement-visual/issue-539-operational-installments.json",
  "artifacts/statement-visual/issue-551-productive-auth.json",
  "artifacts/statement-visual/ISSUE-551.md",
  "artifacts/statement-visual/issue-553-non-idempotent-ambiguity.json",
  "artifacts/statement-visual/issue-553-transfer-destination-visibility.json",
  "artifacts/statement-visual/issue-565-ai-review-queue.json",
  "artifacts/statement-visual/issue-601-ui-primitives-fixture.html",
  "artifacts/statement-visual/issue-606-foundation-states.json",
  "artifacts/statement-visual/issue-606-semantic-cards-interface.json",
  "artifacts/statement-visual/reports-installments-regression.json",
  "artifacts/statement-visual/semantic-proofs/account-remuneration-behavior.json",
  "artifacts/statement-visual/semantic-proofs/account-remuneration-mobile-behavior.json",
  "artifacts/statement-visual/semantic-proofs/accounts-cards-empty-state-behavior.json",
  "artifacts/statement-visual/semantic-proofs/accounts-cards-interface-behavior.json",
  "artifacts/statement-visual/semantic-proofs/bank-message-ai-inbox-behavior.json",
  "artifacts/statement-visual/semantic-proofs/budgets-empty-state-behavior.json",
  "artifacts/statement-visual/semantic-proofs/budgets-pilot-baseline-behavior.json",
  "artifacts/statement-visual/semantic-proofs/cards-interface-0-cartoes-normal-behavior.json",
  "artifacts/statement-visual/semantic-proofs/cards-interface-0-cartoes-normal.json",
  "artifacts/statement-visual/semantic-proofs/cards-interface-adversarial-behavior.json",
  "artifacts/statement-visual/semantic-proofs/categories-interface-behavior.json",
  "artifacts/statement-visual/semantic-proofs/core-pages-0-lancamentos-normal-behavior.json",
  "artifacts/statement-visual/semantic-proofs/core-pages-0-lancamentos-normal.json",
  "artifacts/statement-visual/semantic-proofs/core-pages-1-dashboard-normal-behavior.json",
  "artifacts/statement-visual/semantic-proofs/core-pages-2-cartoes-normal-behavior.json",
  "artifacts/statement-visual/semantic-proofs/core-pages-3-contas-normal-behavior.json",
  "artifacts/statement-visual/semantic-proofs/dashboard-empty-state-behavior.json",
  "artifacts/statement-visual/semantic-proofs/financial-assistant-behavior.json",
  "artifacts/statement-visual/semantic-proofs/financial-insights-behavior.json",
  "artifacts/statement-visual/semantic-proofs/inbox-interface-accessibility-behavior.json",
  "artifacts/statement-visual/semantic-proofs/inbox-interface-refinement-behavior.json",
  "artifacts/statement-visual/semantic-proofs/reports-category-evolution-0-relatorios-normal-behavior.json",
  "artifacts/statement-visual/semantic-proofs/reports-category-evolution-0-relatorios-normal.json",
  "artifacts/statement-visual/semantic-proofs/settings-interface-behavior.json",
  "artifacts/statement-visual/semantic-proofs/sidebar-navigation-behavior.json",
  "artifacts/statement-visual/semantic-proofs/statement-profile-keyboard-behavior.json",
  "artifacts/statement-visual/visual-gate-index.json",
  "artifacts/statement-visual/VISUAL-GATE.md",
];

execFileSync("node_modules/.bin/prettier", [...outputFiles, "--write"], { stdio: "inherit" });

for (const path of outputFiles) {
  const encoded = readFileSync(path).toString("base64");
  console.log(`FORMATTED_FILE_B64 ${path} ${encoded}`);
}

process.exitCode = 1;
