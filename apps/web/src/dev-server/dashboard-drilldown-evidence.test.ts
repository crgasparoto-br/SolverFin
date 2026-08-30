import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterStatementPeriodTransactions,
  resolveFilters,
  type AccountRecord,
  type TransactionRecord,
} from "./transactions-statement.js";

const account: AccountRecord = {
  id: "usd-account",
  name: "Conta USD",
  kind: "checking",
  status: "active",
  openingBalanceMinor: 0,
  currency: "USD",
};

describe("dashboard KPI evidence drilldown", () => {
  it("reproduces the Dashboard posted-income month predicate", () => {
    const filters = resolveFilters(
      new URL(
        "http://solverfin.test/lancamentos?currency=USD&kind=income&evidence=posted&month=2026-08",
      ),
      [account],
    );

    assert.equal(filters.kind, "income");
    assert.equal(filters.evidence, "posted");
    assert.deepEqual(
      filterStatementPeriodTransactions(transactions(), filters).map((item) => item.id),
      ["posted-income", "reconciled-income"],
    );
  });

  it("reproduces the Dashboard monthly variation evidence without collapsing income and expense", () => {
    const filters = resolveFilters(
      new URL("http://solverfin.test/lancamentos?currency=USD&evidence=posted&month=2026-08"),
      [account],
    );

    assert.equal(filters.kind, undefined);
    assert.equal(filters.evidence, "posted");
    assert.deepEqual(
      filterStatementPeriodTransactions(transactions(), filters).map((item) => item.id),
      ["posted-income", "reconciled-income", "posted-expense"],
    );
  });

  it("reproduces the Dashboard posted-expense month predicate", () => {
    const filters = resolveFilters(
      new URL(
        "http://solverfin.test/lancamentos?currency=USD&kind=expense&evidence=posted&month=2026-08",
      ),
      [account],
    );

    assert.deepEqual(
      filterStatementPeriodTransactions(transactions(), filters).map((item) => item.id),
      ["posted-expense"],
    );
  });

  it("keeps only planned expenses for the commitments KPI", () => {
    const filters = resolveFilters(
      new URL(
        "http://solverfin.test/lancamentos?currency=USD&kind=expense&evidence=planned&month=2026-08",
      ),
      [account],
    );

    assert.equal(filters.kind, "expense");
    assert.equal(filters.evidence, "planned");
    assert.deepEqual(
      filterStatementPeriodTransactions(transactions(), filters).map((item) => item.id),
      ["planned-expense", "suggested-expense"],
    );
  });

  it("ignores unsupported drilldown filter values instead of broadening them into another meaning", () => {
    const filters = resolveFilters(
      new URL(
        "http://solverfin.test/lancamentos?currency=USD&kind=transfer&evidence=unknown&month=2026-08",
      ),
      [account],
    );

    assert.equal(filters.kind, undefined);
    assert.equal(filters.evidence, undefined);
  });
});

function transactions(): TransactionRecord[] {
  return [
    transaction("posted-income", "income", "posted", true),
    transaction("reconciled-income", "income", "reconciled", false),
    transaction("invoice-payment-income", "income", "posted", true, "invoice-1"),
    transaction("planned-income", "income", "planned", false),
    transaction("posted-expense", "expense", "posted", true),
    transaction("planned-expense", "expense", "planned", false),
    transaction("suggested-expense", "expense", "suggested", false),
  ];
}

function transaction(
  id: string,
  kind: "income" | "expense",
  status: "posted" | "reconciled" | "planned" | "suggested",
  effective: boolean,
  invoiceId?: string,
): TransactionRecord {
  return {
    id,
    description: id,
    kind,
    status,
    amountMinor: 1000,
    currency: "USD",
    occurredOn: "2026-08-10",
    plannedOn: "2026-08-10",
    ...(effective ? { effectiveOn: "2026-08-10" } : {}),
    ...(invoiceId ? { invoiceId } : {}),
    accountId: account.id,
  };
}
