import {
  statementDate,
  type AccountRecord,
  type StatementFilters,
  type StatementRow,
  type StatementSummary,
  type TransactionRecord,
} from "./transactions-statement.js";

/**
 * Read-only, single-currency consolidation. Never convert currencies or double
 * count internal transfers: each transaction is projected once to the net
 * movement across the accounts in the selected currency.
 */
export function buildConsolidatedStatement(
  accounts: readonly AccountRecord[],
  transactions: readonly TransactionRecord[],
  currency: string,
  filters: Pick<StatementFilters, "startsOn" | "endsOn" | "kind" | "evidence">,
): { rows: StatementRow[]; summary: StatementSummary; accountCount: number } {
  const selected = accounts.filter(
    (account) =>
      account.status === "active" && (account.currency ?? "BRL").toUpperCase() === currency,
  );
  const ids = new Set(selected.map((account) => account.id));
  const movement = (transaction: TransactionRecord): number | undefined => {
    const source = Boolean(transaction.accountId && ids.has(transaction.accountId));
    const destination = Boolean(
      transaction.destinationAccountId && ids.has(transaction.destinationAccountId),
    );
    if (!source && !destination) return undefined;
    if (transaction.kind === "transfer") {
      return (
        (destination ? (transaction.destinationAmountMinor ?? transaction.amountMinor) : 0) -
        (source ? transaction.amountMinor : 0)
      );
    }
    if (!source) return¶»§q«^