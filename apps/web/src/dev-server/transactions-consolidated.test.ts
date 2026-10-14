import assert from "node:assert/strict";
import test from "node:test";

import { buildConsolidatedStatement } from "./transactions-consolidated.js";
import type { AccountRecord, TransactionRecord } from "./transactions-statement.js";

const accounts: AccountRecord[] = [
  {
    id: "a",
    name: "C6",
    kind: "checking",
    status: "active",
    openingBalanceMinor: 10000,
    currency: "BRL",
  },
  {
    id: "b",
    name: "Itaú",
    kind: "checking",
    status: "active",
    openingBalanceMinor: 20000,
    currency: "BRL",
  },
  {
    id: "c",
    name: "Wise",
    kind: "checking",
    status: "active",
    openingBalanceMinor: 50000,
    currency: "USD",
  },
];
const tx = (
  id: string,
  kind: string,
  amountMinor: number,
  accountId: string,
  on: string,
  extra: Partial<TransactionRecord> = {},
): TransactionRecord => ({
  id,
  kind,
  amountMinor,
  accountId,
  description: id,
  status: "posted",
  occurredOn: on,
  plannedOn: on,
  effectiveOn: on,
  ...extra,
});
const period = { startsOn: "2026-10-01", endsOn: "2026-10-31" };

test("BRL consolidation keeps internal transfers zero-net and balance by effective movement", () => {
  const planned = tx("planned", "expense", 900, "b", "2026-10-06", { status: "planned" });
  delete planned.effectiveOn;
  const transactions = [
    tx("before", "income", 1000, "a", "2026-09-30"),
    tx("income", "income", 8000, "a", "2026-10-01"),
    tx("internal", "transfer", 3000, "a", "2026-10-02", { destinationAccountId: "b" }),
    tx("out-fx", "transfer", 5000, "a", "2026-10-03", {
      destinationAccountId: "c",
      destinationAmountMinor: 900,
    }),
    tx("from-fx", "transfer", 200, "c", "2026-10-04", {
      destinationAccountId: "b",
      destinationAmountMinor: 1200,
    }),
    tx("expense", "expense", 1200, "b", "2026-10-05"),
    planned,
    tx("card", "expense", 9999, "a", "2026-10-07", { cardId: "card" }),
    tx("voided", "income", 9999, "a", "2026-10-08", { status: "voided" }),
  ];
  const result = buildConsolidatedStatement(accounts, transactions, "BRL", period);
  assert.deepEqual(
    result.rows.map((row) => [row.transaction.id, row.amountMinor]),
    [
      ["income", 8000],
      ["internal", 0],
      ["out-fx", -5000],
      ["from-fx", 1200],
      ["expense", -1200],
      ["planned", -900],
    ],
  );
  assert.equal(result.accountCount, 2);
  assert.equal(result.summary.openingMinor, 31000);
  assert.equal(result.summary.effectiveBalanceMinor, 34000);
  assert.equal(
    result.rows.at(-1)?.balanceAfterMinor,
    34000,
    "planned does not change effective running balance",
  );
  assert.equal(result.summary.incomeMinor, 8000);
  assert.equal(result.summary.expenseMinor, 2100);
  assert.equal(result.summary.pendingMinor, 900);
  assert.equal(result.summary.plannedBalanceMinor, 33100);
});

test("USD consolidation uses the destination amount of a cross-currency transfer", () => {
  const rows = buildConsolidatedStatement(
    accounts,
    [
      tx("fx", "transfer", 5000, "a", "2026-10-03", {
        destinationAccountId: "c",
        destinationAmountMinor: 900,
      }),
    ],
    "USD",
    period,
  );
  assert.equal(rows.summary.openingMinor, 50000);
  assert.equal(rows.summary.effectiveBalanceMinor, 50900);
  assert.equal(rows.rows[0]?.amountMinor, 900);
});

test("missing currency returns no invented total; accounts outside the currency are excluded", () => {
  const rows = buildConsolidatedStatement(
    accounts,
    [tx("income", "income", 1500, "a", "2026-10-01")],
    "EUR",
    period,
  );
  assert.equal(rows.accountCount, 0);
  assert.equal(rows.rows.length, 0);
  assert.equal(rows.summary.effectiveBalanceMinor, 0);
});
