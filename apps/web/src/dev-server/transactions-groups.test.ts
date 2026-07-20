import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRows,
  projectTransactionGroups,
  type TransactionRecord,
} from "./transactions-statement.js";

const member = (id: string, amountMinor: number): TransactionRecord => ({
  id,
  accountId: "account",
  description: id,
  kind: "expense",
  status: "posted",
  amountMinor,
  currency: "BRL",
  occurredOn: "2026-07-01",
  plannedOn: "2026-07-01",
  effectiveOn: "2026-07-01",
  transactionGroupId: "group",
});

test("projects a group once and preserves the final statement balance", () => {
  const members = [member("one", 100), member("two", 250)];
  const projected = projectTransactionGroups(members, [
    {
      id: "group",
      accountId: "account",
      description: "Compras",
      displayOn: "2026-07-05",
      kind: "expense",
      status: "posted",
      currency: "BRL",
      totalAmountMinor: 350,
      members,
    },
  ]);
  assert.equal(projected.length, 1);
  assert.equal(projected[0]?.group?.members.length, 2);
  assert.equal(
    buildRows(
      projected,
      {
        id: "account",
        name: "Conta",
        kind: "checking",
        status: "active",
        openingBalanceMinor: 1000,
      },
      1000,
    )[0]?.balanceAfterMinor,
    650,
  );
});

test("ignores invalid legacy groups and restores individual members", () => {
  const members = [member("one", 100)];
  const projected = projectTransactionGroups(members, [
    {
      id: "group",
      accountId: "account",
      description: "Inválido",
      displayOn: "2026-07-05",
      kind: "expense",
      status: "posted",
      currency: "BRL",
      totalAmountMinor: 100,
      members,
    },
  ]);
  assert.deepEqual(
    projected.map((item) => item.id),
    ["one"],
  );
});
