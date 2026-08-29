import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFilters, type AccountRecord } from "./transactions-statement.js";

const accounts: AccountRecord[] = [
  {
    id: "brl-account",
    name: "Conta BRL",
    kind: "checking",
    status: "active",
    openingBalanceMinor: 0,
    currency: "BRL",
  },
  {
    id: "usd-account",
    name: "Conta USD",
    kind: "checking",
    status: "active",
    openingBalanceMinor: 0,
    currency: "USD",
  },
];

describe("dashboard currency drilldown", () => {
  it("selects evidence from an account in the requested dashboard currency", () => {
    const filters = resolveFilters(
      new URL("http://solverfin.test/lancamentos?currency=usd&month=2026-08"),
      accounts,
    );

    assert.deepEqual(filters, {
      accountId: "usd-account",
      currency: "USD",
      month: "2026-08",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
    });
  });

  it("does not silently fall back to another currency when no matching account exists", () => {
    const filters = resolveFilters(
      new URL("http://solverfin.test/lancamentos?currency=EUR&month=2026-08"),
      accounts,
    );

    assert.equal(filters.currency, "EUR");
    assert.equal(filters.accountId, undefined);
  });
});
