import assert from "node:assert/strict";

import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  dayToPeriod,
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
dayFilterUsesSelectedDateWithinMonth();
dayFilterSupportsMonthBoundaries();
invalidOrDifferentMonthDayFallsBackToFullMonth();
transactionQueryKeepsPreviousBalanceWindow();
dayFilterKeepsOpeningBalanceAndDailyRows();
statementTransactionFilterKeepsAccountOrAccountOnlyRecords();
statementCalculationsIgnoreVoidedAndPendingOpeningEntries();
projectedBalancesIncludePlannedEntriesAndTransfers();
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
  assert.deepEqual(dayToPeriod("2026-02-14"), {
    startsOn: "2026-02-14",
    endsOn: "2026-02-14",
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

function dayFilterUsesSelectedDateWithinMonth(): void {
  assert.deepEqual(
    resolveFilters(
      new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06&day=2026-06-15"),
      [account],
    ),
    {
      accountId: "account-1",
      month: "2026-06",
      day: "2026-06-15",
      startsOn: "2026-06-15",
      endsOn: "2026-06-15",
    },
  );
}

function dayFilterSupportsMonthBoundaries(): void {
  for (const day of ["2026-06-01", "2026-06-30"]) {
    const filters = resolveFilters(
      new URL(`http://solverfin.test/lancamentos?month=2026-06&day=${day}`),
      [account],
    );

    assert.equal(filters.day, day);
    assert.equal(filters.startsOn, day);
    assert.equal(filters.endsOn, day);
  }
}

function invalidOrDifferentMonthDayFallsBackToFullMonth(): void {
  for (const day of ["2026-06-31", "2026-07-01", "invalid"]) {
    assert.deepEqual(
      resolveFilters(new URL(`http://solverfin.test/lancamentos?month=2026-06&day=${day}`), [
        account,
      ]),
      {
        accountId: "account-1",
        month: "2026-06",
        startsOn: "2026-06-01",
        endsOn: "2026-06-30",
      },
    );
  }
}

function transactionQueryKeepsPreviousBalanceWindow(): void {
  const monthlyFilters = resolveFilters(
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06"),
    [account],
  );
  const monthlyQuery = new URLSearchParams(buildTransactionQuery(monthlyFilters));

  assert.equal(monthlyQuery.get("status"), "all");
  assert.equal(monthlyQuery.get("accountId"), "account-1");
  assert.equal(monthlyQuery.get("occurredFrom"), null);
  assert.equal(monthlyQuery.get("occurredTo"), "2026-06-30");
  assert.equal(monthlyQuery.get("plannedTo"), null);

  const dailyFilters = resolveFilters(
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06&day=2026-06-15"),
    [account],
  );
  const dailyQuery = new URLSearchParams(buildTransactionQuery(dailyFilters));

  assert.equal(dailyQuery.get("occurredFrom"), null);
  assert.equal(dailyQuery.get("occurredTo"), "2026-06-15");
  assert.equal(dailyQuery.get("plannedTo"), null);
}

function dayFilterKeepsOpeningBalanceAndDailyRows(): void {
  const transactions: TransactionRecord[] = [
    transaction("previous-month-income", "income", "posted", 10000, "2026-05-31"),
    transaction("same-month-before-day-expense", "expense", "posted", 5000, "2026-06-14"),
    transaction("selected-day-income", "income", "posted", 2000, "2026-06-15"),
    transaction("effective-selected-day-planned-later", "income", "posted", 3000, "2026-06-15", {
      plannedOn: "2026-06-20",
    }),
    pendingTransaction("selected-day-pending-expense", "expense", 500, "2026-06-15"),
    transaction("effective-after-day-planned-before", "income", "posted", 4000, "2026-06-16", {
      plannedOn: "2026-06-14",
    }),
  ];
  const filters = resolveFilters(
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-06&day=2026-06-15"),
    [account],
  );

  const openingMinor = calculateOpeningBalance(transactions, account, filters.startsOn);
  assert.equal(openingMinor, 55000);

  const rows = buildRows(
    filterStatementPeriodTransactions(transactions, filters),
    account,
    openingMinor,
  );
  assert.deepEqual(
    rows.map((row) => row.transaction.id),
    [
      "selected-day-income",
      "effective-selected-day-planned-later",
      "selected-day-pending-expense",
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.balanceAfterMinor),
    [57000, 60000, 59500],
  );
  assert.deepEqual(summarize(rows, openingMinor), {
    openingMinor: 55000,
    incomeMinor: 5000,
    expenseMinor: 500,
    plannedBalanceMinor: 59500,
    effectiveBalanceMinor: 60000,
    reconciledMinor: 0,
    unreconciledMinor: 5000,
    pendingMinor: 500,
    pendingCount: 1,
    reconciledCount: 0,
    unreconciledCount: 2,
  });
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
    [125000, 135000, 175000],
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

function projectedBalancesIncludePlannedEntriesAndTransfers(): void {
  const plannedExpense = pendingTransaction("planned-expense", "expense", 15000, "2026-06-01");
  const plannedIncome = pendingTransaction("planned-income", "income", 5000, "2026-06-02");
  const outboundTransfer = pendingTransaction(
    "planned-transfer-out",
    "transfer",
    25000,
    "2026-06-03",
    { destinationAccountId: "account-2" },
  );
  const inboundTransfer = pendingTransaction(
    "planned-transfer-in",
    "transfer",
    30000,
    "2026-06-04",
    { accountId: "account-2", destinationAccountId: "account-1" },
  );

  const originRows = buildRows(
    [plannedExpense, plannedIncome, outboundTransfer, inboundTransfer],
    { ...account, openingBalanceMinor: 10000 },
    10000,
  );

  assert.deepEqual(
    originRows.map((row) => row.balanceAfterMinor),
    [-5000, 0, -25000, 5000],
  );

  const destinationRows = buildRows([outboundTransfer], destinationAccount, 0);
  assert.deepEqual(
    destinationRows.map((row) => row.balanceAfterMinor),
    [25000],
  );
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
  overrides: Partial<TransactionRecord> = {},
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
    ...overrides,
  };
}
