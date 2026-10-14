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
  assert.equal(result.summary.incomeMinor, 8000, "only operational income");
  assert.equal(result.summary.expenseMinor, 1200, "only operational expenses");
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
  assert.equal(rows.summary.incomeMinor, 0, "FX transfer excluded from consolidated Entradas");
  assert.equal(rows.summary.expenseMinor, 0);
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

test("consolidation never invents BRL for an account without currency", () => {
  const unknownCurrencyAccount: AccountRecord = {
    id: "unknown",
    name: "Conta sem moeda",
    kind: "checking",
    status: "active",
    openingBalanceMinor: 900000,
  };
  const result = buildConsolidatedStatement(
    [...accounts, unknownCurrencyAccount],
    [
      tx("known-brl", "income", 300, "a", "2026-10-08"),
      tx("unknown", "income", 8000, "unknown", "2026-10-08"),
    ],
    "BRL",
    period,
  );
  assert.equal(result.accountCount, 2);
  assert.equal(result.summary.openingMinor, 30000);
  assert.equal(result.summary.effectiveBalanceMinor, 30300);
  assert.deepEqual(
    result.rows.map((row) => row.transaction.id),
    ["known-brl"],
  );
});

test("September USD consolidated view excludes incoming US$ 100 FX from Entradas but preserves balance", () => {
  const result = buildConsolidatedStatement(
    [
      {
        id: "brl",
        name: "C6 BRL",
        kind: "checking",
        status: "active",
        currency: "BRL",
        openingBalanceMinor: 0,
      },
      {
        id: "usd",
        name: "C6 USD",
        kind: "checking",
        status: "active",
        currency: "USD",
        openingBalanceMinor: 62973,
      },
    ],
    [
      tx("received-usd", "transfer", 54000, "brl", "2026-09-15", {
        destinationAccountId: "usd",
        destinationAmountMinor: 10000,
      }),
    ],
    "USD",
    { startsOn: "2026-09-01", endsOn: "2026-09-30" },
  );
  assert.equal(result.accountCount, 1);
  assert.equal(result.summary.openingMinor, 62973);
  assert.equal(result.summary.incomeMinor, 0);
  assert.equal(result.summary.expenseMinor, 0);
  assert.equal(result.summary.effectiveBalanceMinor, 72973);
  assert.equal(result.rows[0]?.amountMinor, 10000);
});

test("same-currency transfers never inflate Entradas or Saídas", () => {
  const result = buildConsolidatedStatement(
    accounts,
    [
      tx("internal", "transfer", 3000, "a", "2026-10-05", { destinationAccountId: "b" }),
      tx("cash-in", "income", 2000, "a", "2026-10-06"),
      tx("cash-out", "expense", 700, "b", "2026-10-07"),
    ],
    "BRL",
    period,
  );
  assert.equal(result.summary.incomeMinor, 2000);
  assert.equal(result.summary.expenseMinor, 700);
  assert.equal(result.summary.effectiveBalanceMinor, 31300);
  assert.equal(result.rows[0]?.amountMinor, 0);
});

test("cross-currency transfers change consolidated balances without inflating either card", () => {
  const transaction = tx("sent-brl", "transfer", 54000, "a", "2026-10-11", {
    destinationAccountId: "c",
    destinationAmountMinor: 10000,
  });
  const brl = buildConsolidatedStatement(accounts, [transaction], "BRL", period);
  const usd = buildConsolidatedStatement(accounts, [transaction], "USD", period);
  assert.equal(brl.summary.incomeMinor, 0);
  assert.equal(brl.summary.expenseMinor, 0);
  assert.equal(brl.summary.effectiveBalanceMinor, 30000 - 54000);
  assert.equal(usd.summary.incomeMinor, 0);
  assert.equal(usd.summary.expenseMinor, 0);
  assert.equal(usd.summary.effectiveBalanceMinor, 50000 + 10000);
});
