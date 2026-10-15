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
    (account) => account.status === "active" && account.currency?.toUpperCase() === currency,
  );
  const ids = new Set(selected.map((account) => account.id));
  // Account currency is authoritative; transaction currencies cover transfers
  // whose counterparty account is not part of the returned account catalog.
  const currencyByAccount = new Map(
    accounts.map((account) => [account.id, account.currency?.trim().toUpperCase()]),
  );
  const isCurrencyExchange = (transaction: TransactionRecord): boolean => {
    const sourceCurrency =
      currencyByAccount.get(transaction.accountId ?? "") ?? transaction.currency?.toUpperCase();
    const destinationCurrency =
      currencyByAccount.get(transaction.destinationAccountId ?? "") ??
      transaction.destinationCurrency?.toUpperCase();
    return Boolean(
      sourceCurrency && destinationCurrency && sourceCurrency !== destinationCurrency,
    );
  };
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
    if (!source) return undefined;
    if (transaction.kind === "income") return transaction.amountMinor;
    if (transaction.kind === "expense") return -transaction.amountMinor;
    return undefined;
  };
  const candidates = transactions
    .filter(
      (transaction) =>
        !transaction.cardId && !transaction.invoiceId && transaction.status !== "voided",
    )
    .map((transaction) => ({ transaction, amount: movement(transaction) }))
    .filter(
      (row): row is { transaction: TransactionRecord; amount: number } => row.amount !== undefined,
    )
    .sort((a, b) => statementDate(a.transaction).localeCompare(statementDate(b.transaction)));

  let openingMinor = selected.reduce((sum, account) => sum + account.openingBalanceMinor, 0);
  for (const { transaction, amount } of candidates) {
    if (statementDate(transaction) < filters.startsOn && transaction.effectiveOn !== undefined) {
      openingMinor += amount;
    }
  }

  const summary: StatementSummary = {
    openingMinor,
    incomeMinor: 0,
    expenseMinor: 0,
    plannedBalanceMinor: openingMinor,
    effectiveBalanceMinor: openingMinor,
    reconciledMinor: 0,
    unreconciledMinor: 0,
    pendingMinor: 0,
    reconciledCount: 0,
    unreconciledCount: 0,
    pendingCount: 0,
  };
  const rows: StatementRow[] = [];
  let effectiveRunning = openingMinor;
  for (const { transaction, amount } of candidates) {
    const date =
      filters.evidence === "posted"
        ? transaction.occurredOn
        : filters.evidence === "planned"
          ? transaction.plannedOn
          : statementDate(transaction);
    if (date < filters.startsOn || date > filters.endsOn) continue;
    if (filters.kind && transaction.kind !== filters.kind) continue;
    if (
      filters.evidence === "posted" &&
      transaction.status !== "posted" &&
      transaction.status !== "reconciled"
    )
      continue;
    if (filters.evidence === "planned" && transaction.status !== "planned") continue;

    // In All accounts, same-currency transfers do not inflate inflows/outflows.
    // A cross-currency transfer represents an actual inflow/outflow in the
    // selected currency, using the projected destination amount when received.
    // Financial balances always retain the net movement of both kinds.
    if (transaction.kind !== "transfer" || isCurrencyExchange(transaction)) {
      if (amount > 0) summary.incomeMinor += amount;
      if (amount < 0) summary.expenseMinor -= amount;
    }
    summary.plannedBalanceMinor += amount;
    if (transaction.effectiveOn === undefined) {
      summary.pendingMinor += Math.abs(amount);
      summary.pendingCount++;
    } else {
      effectiveRunning += amount;
      summary.effectiveBalanceMinor += amount;
      if (transaction.status === "reconciled") {
        summary.reconciledMinor += Math.abs(amount);
        summary.reconciledCount++;
      } else {
        summary.unreconciledMinor += Math.abs(amount);
        summary.unreconciledCount++;
      }
    }
    rows.push({ transaction, amountMinor: amount, balanceAfterMinor: effectiveRunning });
  }
  return { rows, summary, accountCount: selected.length };
}
