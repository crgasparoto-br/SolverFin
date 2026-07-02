import assert from "node:assert/strict";

import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  filterStatementPeriodTransactions,
  isAccountStatementTransaction,
  monthToPeriod,
  resolveFilters,
  signedAmount,
  summarize,
  type AccountRecord,
  type TransactionRecord,
} from "./transactions-statement.js";

const account: AccountRecord = {
  id: "account-1",
  name: "Conta principal",
  kind: "checking",
  status: "active",
  openingBalanceMinor: 50000,
};

const destinationAccount: AccountRecord = {
  id: "account-2",
  name: "Reserva",
  kind: "savings",
  status: "active",
  openingBalanceMinor: 0,
};

periodHelpersResolveMonthBoundaries();
filtersKeepCurrentAndLegacyFallbacks();
transactionQueryKeepsPreviousBalanceWindow();
statementTransactionFilterKeepsAccountOrAccountOnlyRecords();
statementCalculationsIgnoreVoidedAndPendingOpeningEntries();
transferSignedAmountDependsOnSelectedAccount();

function periodHelpersResolveMonthBoundaries(): void {
  assert.deepEqual(monthToPeriod("2026-02"), {
    startsOn: "2026-02-01",
    endsOn: "2026-02-28",
  });
  assert.deepEqual(monthToPeriod("2024-02"), {
    startsOn: "2024-02-01",
    endsOn: "2024-02-29",
  });
}

function filtersKeepCurrentAndLegacyFallbacks(): void {
  assert.deepEqual(
    resolveFilters(new URL("http://solverfin.test/lancamentos?accountId=account-2&month=2026-06"), [
      account,
      destinationAccount,
    ]),
    {
      accountId: "account-2",
      month: "2026-06",
      startsOn: "2026-06-01",
      endsOn: "2026-06-30",
    },
  );

  assert.equal(
    resolveFilters(
      new URL("http://solverfin.test/lancamentos?startsOn=2026-05-15"),
      [account],
      "2026-01",
    ).month,
    "2026-05",
  );

  assert.equal(
    resolveFilters(new URL("http://solverfin.test/lancamentos?month=2026-13"), [account], "2026-07")
      .month,
    "2026-07",
  );
}

function transactionQueryKeepsPreviousBalanceWindow(): void {
  const filters = resolveFilters(
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06"),
    [account],
  );
  const query = new URLSearchParams(buildTransactionQuery(filters));

  assert.equal(query.get("status"), "all");
  assert.equal(query.get("accountId"), "account-1");
  assert.equal(query.get("plannedFrom"), null);
  assert.equal(query.get("plannedTo"), "2026-06-30");
}

function statementTransactionFilterKeepsAccountOrAccountOnlyRecords(): void {
  assert.equal(
    isAccountStatementTransaction(
      transaction("account-income", "income", "posted", 1000, "2026-06-01"),
    ),
    true,
  );
  assert.equal(
    isAccountStatementTransaction({
      id: "card-expense",
      description: "card-expense",
      kind: "expense",
      status: "posted",
      amountMinor: 1000,
      occurredOn: "2026-06-01",
      plannedOn: "2026-06-01",
      effectiveOn: "2026-06-01",
      cardId: "card-1",
      invoiceId: "invoice-1",
    }),
    false,
  );
}

function statementCalculationsIgnoreVoidedAndPendingOpeningEntries(): void {
  const transactions: TransactionRecord[] = [
    transaction("previous-effective-income", "income", "posted", 100000, "2026-05-20"),
    pendingTransaction("previous-planned-expense", "expense", 999999, "2026-05-25"),
    transaction("previous-voided-income", "income", "voided", 777777, "2026-05-26"),
    transaction("current-effective-expense", "expense", "posted", 25000, "2026-06-02"),
    pendingTransaction("current-pending-income", "income", 10000, "2026-06-10"),
    transaction("current-transfer-in", "transfer", "reconciled", 40000, "2026-06-11", {
      accountId: "account-2",
      destinationAccountId: "account-1",
    }),
    transaction("current-voided-income", "income", "voided", 12345, "2026-06-12"),
  ];
  const filters = resolveFilters(
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06"),
    [account],
  );

  const openingMinor = calculateOpeningBalance(transactions, account, filters.startsOn);
  assert.equal(openingMinor, 150000);

  const rows = buildRows(
    filterStatementPeriodTransactions(transactions, filters),
    account,
    openingMinor,
  );
  assert.deepEqual(
    rows.map((row) => row.transaction.id),
    ["current-effective-expense", "current-pending-income", "current-transfer-in"],
  );
  assert.deepEqual(
    rows.map((row) => row.amountMinor),
    [-25000, 10000, 40000],
  );
  assert.deepEqual(
    rows.map((row) => row.balanceAfterMinor),
    [125000, undefined, 165000],
  );

  assert.deepEqual(summarize(rows, openingMinor), {
    openingMinor: 150000,
    incomeMinor: 50000,
    expenseMinor: 25000,
    plannedBalanceMinor: 175000,
    effectiveBalanceMinor: 165000,
    reconciledMinor: 40000,
    unreconciledMinor: 25000,
    pendingMinor: 10000,
    pendingCount: 1,
    reconciledCount: 1,
    unreconciledCount: 1,
  });
}

function transferSignedAmountDependsOnSelectedAccount(): void {
  const transfer = transaction("transfer", "transfer", "posted", 25000, "2026-06-02", {
    accountId: "account-1",
    destinationAccountId: "account-2",
  });

  assert.equal(signedAmount(transfer, "account-1"), -25000);
  assert.equal(signedAmount(transfer, "account-2"), 25000);
  assert.equal(signedAmount(transfer, "account-3"), 0);
}

function transaction(
  id: string,
  kind: string,
  status: string,
  amountMinor: number,
  date: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    description: id,
    kind,
    status,
    amountMinor,
    occurredOn: date,
    plannedOn: date,
    effectiveOn: date,
    accountId: "account-1",
    ...overrides,
  };
}

function pendingTransaction(
  id: string,
  kind: string,
  amountMinor: number,
  date: string,
): TransactionRecord {
  return {
    id,
    description: id,
    kind,
    status: "planned",
    amountMinor,
    occurredOn: date,
    plannedOn: date,
    accountId: "account-1",
  };
}
