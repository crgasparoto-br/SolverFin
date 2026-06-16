import { transactionMockDataSet } from "./mock-data.js";
import {
  archiveTransaction,
  buildTransactionViewModel,
  validateTransactionForm,
} from "./validation.js";

export const transactionReadyExample = buildTransactionViewModel(transactionMockDataSet);
export const transactionLoadingExample = buildTransactionViewModel(undefined, "loading");
export const transactionErrorExample = buildTransactionViewModel(undefined, "error");
export const transactionSuccessExample = buildTransactionViewModel(
  transactionMockDataSet,
  "success",
);
export const transactionEmptyExample = buildTransactionViewModel({
  context: transactionMockDataSet.context,
  filters: {},
  transactions: [],
});
export const transactionExpenseFilterExample = buildTransactionViewModel({
  ...transactionMockDataSet,
  filters: {
    ...transactionMockDataSet.filters,
    type: "expense",
  },
});

export const invalidTransactionExample = validateTransactionForm({
  date: "16/06/2026",
  description: "",
  type: "expense",
  amountInCents: 0,
});

export const validExpenseExample = validateTransactionForm({
  date: "2026-06-16",
  description: "Compra demo",
  type: "expense",
  amountInCents: 4500,
  accountId: "account-checking-demo",
  categoryId: "category-food-demo",
});

export const invalidTransferExample = validateTransactionForm({
  date: "2026-06-16",
  description: "Transferencia demo",
  type: "transfer",
  amountInCents: 5000,
  accountId: "account-checking-demo",
  destinationAccountId: "account-checking-demo",
});

export const archivedTransactionExample = archiveTransaction(
  transactionMockDataSet.transactions[1],
);

export const transactionExpectedTotals = {
  filteredCount: 5,
  incomeInCents: 620000,
  expenseInCents: 157750,
  transferInCents: 50000,
  resultInCents: 462250,
  expenseFilterCount: 3,
} as const;

export function isTransactionMockConsistent(): boolean {
  return (
    transactionReadyExample.transactions.length === transactionExpectedTotals.filteredCount &&
    transactionReadyExample.summary.incomeInCents === transactionExpectedTotals.incomeInCents &&
    transactionReadyExample.summary.expenseInCents === transactionExpectedTotals.expenseInCents &&
    transactionReadyExample.summary.transferInCents === transactionExpectedTotals.transferInCents &&
    transactionReadyExample.summary.resultInCents === transactionExpectedTotals.resultInCents &&
    transactionExpenseFilterExample.transactions.length ===
      transactionExpectedTotals.expenseFilterCount &&
    invalidTransactionExample.valid === false &&
    validExpenseExample.valid === true &&
    invalidTransferExample.valid === false &&
    archivedTransactionExample.status === "archived"
  );
}
