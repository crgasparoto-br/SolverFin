import assert from "node:assert/strict";

import { buildImportStatementUrl } from "./import-statement-navigation.js";

persistedTransactionWinsOverReviewedPayload();
visualDateUsesStatementPrecedence();
bulkResultsKeepIndependentNavigation();
transferUsesReferenceAccount();
fallbacksRemainDeterministic();

function persistedTransactionWinsOverReviewedPayload(): void {
  const url = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "persisted-account",
        occurredOn: "2026-05-31",
        plannedOn: "2026-06-01",
        effectiveOn: "2026-07-02",
      },
      payload: { accountId: "stale-payload-account", occurredOn: "2026-04-15" },
    }),
    "http://solverfin.test",
  );

  assert.equal(url.pathname, "/lancamentos");
  assert.equal(url.searchParams.get("accountId"), "persisted-account");
  assert.equal(url.searchParams.get("month"), "2026-07");
}

function visualDateUsesStatementPrecedence(): void {
  const planned = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "planned-account",
        occurredOn: "2026-05-31",
        plannedOn: "2026-06-01",
      },
    }),
    "http://solverfin.test",
  );
  assert.equal(planned.searchParams.get("month"), "2026-06");

  const occurred = new URL(
    buildImportStatementUrl({
      transaction: { accountId: "occurred-account", occurredOn: "2026-08-31" },
    }),
    "http://solverfin.test",
  );
  assert.equal(occurred.searchParams.get("month"), "2026-08");
}

function bulkResultsKeepIndependentNavigation(): void {
  const first = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "account-a",
        occurredOn: "2026-06-30",
        effectiveOn: "2026-07-01",
      },
    }),
    "http://solverfin.test",
  );
  const second = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "account-b",
        occurredOn: "2026-08-01",
        effectiveOn: "2026-08-01",
      },
    }),
    "http://solverfin.test",
  );

  assert.deepEqual(
    [
      [first.searchParams.get("accountId"), first.searchParams.get("month")],
      [second.searchParams.get("accountId"), second.searchParams.get("month")],
    ],
    [
      ["account-a", "2026-07"],
      ["account-b", "2026-08"],
    ],
  );
}

function transferUsesReferenceAccount(): void {
  const url = new URL(
    buildImportStatementUrl({
      transaction: {
        accountId: "canonical-source",
        destinationAccountId: "reference-account",
        occurredOn: "2026-07-21",
      },
      payload: {
        kind: "transfer",
        direction: "inflow",
        accountId: "reference-account",
        occurredOn: "2026-07-21",
      },
    }),
    "http://solverfin.test",
  );

  assert.equal(url.searchParams.get("accountId"), "reference-account");
  assert.equal(url.searchParams.get("month"), "2026-07");
}

function fallbacksRemainDeterministic(): void {
  const payload = new URL(
    buildImportStatementUrl({
      payload: { accountId: "payload-account", occurredOn: "2026-09-10" },
    }),
    "http://solverfin.test",
  );
  assert.equal(payload.searchParams.get("accountId"), "payload-account");
  assert.equal(payload.searchParams.get("month"), "2026-09");

  assert.equal(
    buildImportStatementUrl(undefined, "fallback-account"),
    "/lancamentos?accountId=fallback-account",
  );
}
