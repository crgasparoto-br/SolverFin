import assert from "node:assert/strict";

import {
  buildRows,
  buildTransactionQuery,
  calculateOpeningBalance,
  filterStatementPeriodTransactions,
  projectTransactionGroups,
  resolveFilters,
  statementDate,
  summarize,
  type AccountRecord,
  type TransactionGroupRecord,
  type TransactionRecord,
} from "./transactions-statement.js";

const account: AccountRecord = {
  id: "account-import",
  name: "Conta importada",
  kind: "checking",
  status: "active",
  openingBalanceMinor: 10_000,
};

const previous = transaction("previous-income", "income", 2_000, "2026-05-31");
const importedIncome = transaction(
  "import-income",
  "income",
  12_345,
  "2026-06-10",
  {
    source: "import",
  },
);
const importedExpense = transaction(
  "import-expense",
  "expense",
  2_345,
  "2026-06-11",
  {
    source: "import",
  },
);

importedTransactionsRemainVisibleAndAffectBalances();
importedTransactionsAreNotRemovedByUnrelatedGroups();

function importedTransactionsRemainVisibleAndAffectBalances(): void {
  const filters = resolveFilters(
    new URL(
      "http://solverfin.test/lancamentos?accountId=account-import&month=2026-06",
    ),
    [account],
  );
  const query = new URLSearchParams(buildTransactionQuery(filters));

  assert.equal(query.get("status"), "all");
  assert.equal(query.get("accountId"), account.id);
  assert.equal(query.get("occurredTo"), "2026-06-30");
  assert.equal(statementDate(importedIncome), "2026-06-10");
  assert.equal(statementDate(importedExpense), "2026-06-11");

  const projected = projectTransactionGroups(
    [previous, importedIncome, importedExpense],
    [],
  );
  assert.equal(
    projected.filter((item) => item.id === importedIncome.id).length,
    1,
  );
  assert.equal(
    projected.filter((item) => item.id === importedExpense.id).length,
    1,
  );

  const openingMinor = calculateOpeningBalance(
    projected,
    account,
    filters.startsOn,
  );
  assert.equal(openingMinor, 12_000);

  const rows = buildRows(
    filterStatementPeriodTransactions(projected, filters),
    account,
    openingMinor,
  );
  assert.deepEqual(
    rows.map((row) => row.transaction.id),
    [importedIncome.id, importedExpense.id],
  );
  assert.deepEqual(
    rows.map((row) => row.amountMinor),
    [12_345, -2_345],
  );
  assert.deepEqual(
    rows.map((row) => row.balanceAfterMinor),
    [24_345, 22_000],
  );
  assert.deepEqual(summarize(rows, openingMinor), {
    openingMinor: 12_000,
    incomeMinor: 12_345,
    expenseMinor: 2_345,
    plannedBalanceMinor: 22_000,
    effectiveBalanceMinor: 22_000,
    reconciledMinor: 0,
    unreconciledMinor: 14_690,
    pendingMinor: 0,
    pendingCount: 0,
    reconciledCount: 0,
    unreconciledCount: 2,
  });
}

function importedTransactionsAreNotRemovedByUnrelatedGroups(): void {
  const groupedA = transaction("grouped-a", "expense", 300, "2026-06-12", {
    transactionGroupId: "group-1",
  });
  const groupedB = transaction("grouped-b", "expense", 700, "2026-06-13", {
    transactionGroupId: "group-1",
  });
  const group: TransactionGroupRecord = {
    id: "group-1",
    accountId: account.id,
    description: "Grupo independente",
    displayOn: "2026-06-13",
    kind: "expense",
    status: "posted",
    currency: "BRL",
    totalAmountMinor: 1_000,
    members: [groupedA, groupedB],
  };

  const projected = projectTransactionGroups(
    [importedIncome, importedExpense, groupedA, groupedB],
    [group],
  );

  assert.deepEqual(
    projected
      .filter((item) => item.source === "import")
      .map((item) => item.id)
      .sort(),
    [importedExpense.id, importedIncome.id].sort(),
  );
  assert.equal(
    projected.filter((item) => item.id === `group:${group.id}`).length,
    1,
  );
  assert.equal(
    projected.some((item) => item.id === groupedA.id),
    false,
  );
  assert.equal(
    projected.some((item) => item.id === groupedB.id),
    false,
  );
}

function transaction(
  id: string,
  kind: "income" | "expense",
  amountMinor: number,
  date: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    description: id,
    kind,
    status: "posted",
    source: "manual",
    amountMinor,
    currency: "BRL",
    occurredOn: date,
    plannedOn: date,
    effectiveOn: date,
    accountId: account.id,
    ...overrides,
  };
}
