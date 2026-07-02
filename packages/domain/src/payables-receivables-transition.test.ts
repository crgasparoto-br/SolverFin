import type { PayableReceivable, Transaction } from "./index.js";
import { buildPayableReceivableTransitionPlan } from "./payables-receivables-transition.js";

const baseLegacy = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  amountMinor: 12345,
  currency: "BRL",
  dueOn: "2026-07-10",
  description: "Compromisso legado",
  accountId: "account-main",
  categoryId: "category-main",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
} satisfies Omit<PayableReceivable, "id" | "kind" | "status">;

const baseTransaction = {
  organizationId: "org-a",
  financialProfileId: "profile-a",
  source: "manual",
  amountMinor: 12345,
  currency: "BRL",
  occurredOn: "2026-07-10",
  plannedOn: "2026-07-10",
  description: "Compromisso consolidado",
  accountId: "account-main",
  categoryId: "category-main",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
} satisfies Omit<Transaction, "id" | "kind" | "status">;

runPlansPendingLegacyAsPlannedTransaction();
runKeepsDuplicatePendingAsLegacyReference();
runPreservesSettledSettlementReference();
runLinksSettledLegacyToEquivalentPostedTransaction();
runKeepsCancelledRecordsAsHistory();
runRequiresManualReviewWhenPendingHasNoAccount();

function runPlansPendingLegacyAsPlannedTransaction(): void {
  const payable = createLegacy("legacy-pending", "payable", "pending");
  const plan = buildPayableReceivableTransitionPlan({
    payablesReceivables: [payable],
    transactions: [],
  });
  const item = plan.items[0];

  assertEqual(item?.disposition, "create_planned_transaction", "pending legacy should migrate");
  assertEqual(item?.plannedTransactionDraft?.kind, "expense", "payable should become expense");
  assertEqual(item?.plannedTransactionDraft?.status, "planned", "pending should become planned");
  assertEqual(item?.plannedTransactionDraft?.plannedOn, payable.dueOn, "due date should be plannedOn");
  assertEqual(item?.plannedTransactionDraft?.accountId, payable.accountId, "account should be copied");
  assertEqual(plan.summary.create_planned_transaction, 1, "summary should count migration draft");
}

function runKeepsDuplicatePendingAsLegacyReference(): void {
  const receivable = createLegacy("legacy-duplicate", "receivable", "pending");
  const transaction = createTransaction("transaction-duplicate", "income", "planned");
  const plan = buildPayableReceivableTransitionPlan({
    payablesReceivables: [receivable],
    transactions: [transaction],
  });
  const item = plan.items[0];

  assertEqual(
    item?.disposition,
    "keep_legacy_duplicate_reference",
    "duplicate pending should not create another transaction",
  );
  assertEqual(item?.transactionId, transaction.id, "duplicate should reference existing transaction");
}

function runPreservesSettledSettlementReference(): void {
  const payable = {
    ...createLegacy("legacy-settled-linked", "payable", "settled"),
    settlementTransactionId: "transaction-settlement",
    settledAt: "2026-07-10T12:00:00.000Z",
  } satisfies PayableReceivable;
  const transaction = createTransaction("transaction-settlement", "expense", "posted");
  const plan = buildPayableReceivableTransitionPlan({
    payablesReceivables: [payable],
    transactions: [transaction],
  });
  const item = plan.items[0];

  assertEqual(
    item?.disposition,
    "keep_legacy_settlement_reference",
    "settled linked legacy should stay compatible",
  );
  assertEqual(item?.transactionId, transaction.id, "settlement transaction should be preserved");
}

function runLinksSettledLegacyToEquivalentPostedTransaction(): void {
  const receivable = {
    ...createLegacy("legacy-settled-unlinked", "receivable", "settled"),
    settledAt: "2026-07-10T12:00:00.000Z",
  } satisfies PayableReceivable;
  const transaction = createTransaction("transaction-equivalent", "income", "reconciled");
  const plan = buildPayableReceivableTransitionPlan({
    payablesReceivables: [receivable],
    transactions: [transaction],
  });
  const item = plan.items[0];

  assertEqual(
    item?.disposition,
    "link_existing_settlement_transaction",
    "settled legacy without link should link equivalent transaction",
  );
  assertEqual(item?.transactionId, transaction.id, "equivalent transaction should be referenced");
}

function runKeepsCancelledRecordsAsHistory(): void {
  const cancelled = {
    ...createLegacy("legacy-cancelled", "payable", "cancelled"),
    cancelledAt: "2026-07-10T12:00:00.000Z",
  } satisfies PayableReceivable;
  const plan = buildPayableReceivableTransitionPlan({
    payablesReceivables: [cancelled],
    transactions: [],
  });

  assertEqual(
    plan.items[0]?.disposition,
    "keep_legacy_cancelled_history",
    "cancelled records should be historical only",
  );
}

function runRequiresManualReviewWhenPendingHasNoAccount(): void {
  const payable = createLegacy("legacy-no-account", "payable", "pending");
  const { accountId: _accountId, ...withoutAccount } = payable;
  const plan = buildPayableReceivableTransitionPlan({
    payablesReceivables: [withoutAccount],
    transactions: [],
  });

  assertEqual(
    plan.items[0]?.disposition,
    "manual_review",
    "pending legacy without account cannot become Transaction automatically",
  );
}

function createLegacy(
  id: string,
  kind: PayableReceivable["kind"],
  status: PayableReceivable["status"],
): PayableReceivable {
  return {
    ...baseLegacy,
    id,
    kind,
    status,
  };
}

function createTransaction(
  id: string,
  kind: Transaction["kind"],
  status: Transaction["status"],
): Transaction {
  return {
    ...baseTransaction,
    id,
    kind,
    status,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
