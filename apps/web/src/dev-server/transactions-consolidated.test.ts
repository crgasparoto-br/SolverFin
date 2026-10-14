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
    name: "ItaÃº",
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
    tx("internal", "transfer", 3000, "a", "2026-10-02", { destinationAccoun¶»§q«^