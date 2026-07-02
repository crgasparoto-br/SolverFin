import assert from "node:assert/strict";

import {
  buildRows,
  filterStatementPeriodTransactions,
  isAccountStatementTransaction,
  resolveFilters,
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

invoicePaymentAppearsInSelectedAccountStatement();

function invoicePaymentAppearsInSelectedAccountStatement(): void {
  const payment: TransactionRecord = {
    id: "invoice-payment",
    description: "Pagamento da fatura 20/06/2026",
    kind: "expense",
    status: "posted",
    amountMinor: 17345,
    occurredOn: "2026-07-10",
    plannedOn: "2026-07-10",
    effectiveOn: "2026-07-10",
    accountId: "account-1",
    cardId: "card-1",
    invoiceId: "invoice-1",
  };
  const filters = resolveFilters(
    new URL("http://solverfin.test/lancamentos?accountId=account-1&month=2026-07"),
    [account],
  );
  const rows = buildRows(
    filterStatementPeriodTransactions([payment], filters),
    account,
    account.openingBalanceMinor,
  );

  assert.equal(isAccountStatementTransaction(payment), true);
  assert.deepEqual(
    rows.map((row) => ({
      id: row.transaction.id,
      amountMinor: row.amountMinor,
      balanceAfterMinor: row.balanceAfterMinor,
    })),
    [
      {
        id: "invoice-payment",
        amountMinor: -17345,
        balanceAfterMinor: 32655,
      },
    ],
  );
}
