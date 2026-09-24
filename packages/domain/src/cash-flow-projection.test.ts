import assert from "node:assert/strict";

import {
  buildCashFlowProjection,
  CashFlowProjectionError,
  resolveCashFlowProjectionWindow,
} from "./cash-flow-projection.js";
import type { FutureCommitment } from "./future-commitments.js";

exactThirtyDayWindowAndContinuousSeries();
supportsSixtyAndNinetyAcrossCalendarBoundaries();
keepsReferenceDateOutOfFutureMovements();
separatesCurrenciesAndPreservesCrossCurrencyEvidence();
groupsSameDayMovementsWithoutCrossCurrencyAggregation();
filtersOneCurrencyWithoutInventingConversion();
rejectsInvalidReferenceDateAndHorizon();

function exactThirtyDayWindowAndContinuousSeries(): void {
  const projection = project(30, [
    commitment("rent", "2037-12-03", [effect("rent-brl", -20_000, "BRL", "source_account")]),
  ]);

  const brl = block(projection, "BRL");
  assert.equal(projection.from, "2037-12-01");
  assert.equal(projection.to, "2037-12-30");
  assert.equal(brl.points.length, 30);
  assert.equal(brl.points[0]?.date, "2037-12-01");
  assert.equal(brl.points[29]?.date, "2037-12-30");
  assert.equal(brl.points[0]?.closingBalanceMinor, 100_000);
  assert.equal(brl.points[1]?.closingBalanceMinor, 100_000);
  assert.equal(brl.points[2]?.netMovementMinor, -20_000);
  assert.equal(brl.points[2]?.closingBalanceMinor, 80_000);
  assert.equal(brl.points[3]?.closingBalanceMinor, 80_000);
  assert.equal(brl.closingBalanceMinor, 80_000);
}

function supportsSixtyAndNinetyAcrossCalendarBoundaries(): void {
  const sixty = project(60, []);
  const ninety = project(90, []);
  assert.equal(sixty.currencyBlocks[0]?.points.length, 60);
  assert.equal(sixty.to, "2038-01-29");
  assert.equal(ninety.currencyBlocks[0]?.points.length, 90);
  assert.equal(ninety.to, "2038-02-28");
}

function keepsReferenceDateOutOfFutureMovements(): void {
  const projection = project(30, [
    commitment("already-open", "2037-11-30", [
      effect("already-open-brl", -5_000, "BRL", "source_account"),
    ]),
    commitment("future", "2037-12-01", [effect("future-brl", -7_000, "BRL", "source_account")]),
  ]);

  const first = block(projection, "BRL").points[0];
  assert.equal(first?.netMovementMinor, -7_000);
  assert.deepEqual(
    first?.movements.map((movement) => movement.commitmentId),
    ["future"],
  );
}

function separatesCurrenciesAndPreservesCrossCurrencyEvidence(): void {
  const projection = project(30, [
    commitment("transaction:transfer-1", "2037-12-02", [
      effect("transfer-source", -53_832, "BRL", "source_account"),
      effect("transfer-destination", 10_000, "USD", "destination_account"),
    ]),
  ]);
  const brl = block(projection, "BRL");
  const usd = block(projection, "USD");
  const brlMovement = brl.points[1]?.movements[0];
  const usdMovement = usd.points[1]?.movements[0];

  assert.equal(brl.points[1]?.netMovementMinor, -53_832);
  assert.equal(usd.points[1]?.netMovementMinor, 10_000);
  assert.equal(brlMovement?.commitmentId, "transaction:transfer-1");
  assert.equal(usdMovement?.commitmentId, "transaction:transfer-1");
  assert.notEqual(brlMovement?.effectId, usdMovement?.effectId);
  assert.equal(brl.points[1]?.closingBalanceMinor, 46_168);
  assert.equal(usd.points[1]?.closingBalanceMinor, 30_000);
}

function groupsSameDayMovementsWithoutCrossCurrencyAggregation(): void {
  const projection = project(30, [
    commitment("income", "2037-12-04", [effect("income-brl", 30_000, "BRL", "source_account")]),
    commitment("expense", "2037-12-04", [effect("expense-brl", -12_000, "BRL", "source_account")]),
    commitment("usd-expense", "2037-12-04", [
      effect("expense-usd", -5_000, "USD", "source_account"),
    ]),
  ]);

  assert.equal(block(projection, "BRL").points[3]?.netMovementMinor, 18_000);
  assert.equal(block(projection, "USD").points[3]?.netMovementMinor, -5_000);
}

function filtersOneCurrencyWithoutInventingConversion(): void {
  const projection = buildCashFlowProjection({
    window: resolveCashFlowProjectionWindow("2037-11-30", 30),
    openingBalances: [
      { currency: "BRL", amountMinor: 100_000 },
      { currency: "USD", amountMinor: 20_000 },
    ],
    commitments: [
      commitment("transaction:transfer-filter", "2037-12-02", [
        effect("filter-source", -53_832, "BRL", "source_account"),
        effect("filter-destination", 10_000, "USD", "destination_account"),
      ]),
    ],
    currency: "usd",
  });

  assert.equal(projection.currency, "USD");
  assert.deepEqual(
    projection.currencyBlocks.map((item) => item.currency),
    ["USD"],
  );
  assert.equal(projection.currencyBlocks[0]?.points[1]?.netMovementMinor, 10_000);
}

function rejectsInvalidReferenceDateAndHorizon(): void {
  assert.throws(
    () => resolveCashFlowProjectionWindow("2037-02-30", 30),
    (error: unknown) =>
      error instanceof CashFlowProjectionError &&
      error.code === "CASH_FLOW_PROJECTION_REFERENCE_DATE_INVALID",
  );
  assert.throws(
    () => resolveCashFlowProjectionWindow("2037-11-30", 45),
    (error: unknown) =>
      error instanceof CashFlowProjectionError &&
      error.code === "CASH_FLOW_PROJECTION_HORIZON_INVALID",
  );
}

function project(horizonDays: 30 | 60 | 90, commitments: FutureCommitment[]) {
  return buildCashFlowProjection({
    window: resolveCashFlowProjectionWindow("2037-11-30", horizonDays),
    openingBalances: [
      { currency: "BRL", amountMinor: 100_000 },
      { currency: "USD", amountMinor: 20_000 },
    ],
    commitments,
  });
}

function block(projection: ReturnType<typeof buildCashFlowProjection>, currency: string) {
  const result = projection.currencyBlocks.find((item) => item.currency === currency);
  assert.ok(result, `expected projection block ${currency}`);
  return result;
}

function commitment(
  id: string,
  plannedOn: string,
  monetaryEffects: FutureCommitment["monetaryEffects"],
): FutureCommitment {
  return {
    id,
    plannedOn,
    description: id,
    source: { kind: "transaction", id, transactionId: id },
    monetaryEffects,
  };
}

function effect(
  id: string,
  amountMinor: number,
  currency: string,
  role: "source_account" | "destination_account",
): FutureCommitment["monetaryEffects"][number] {
  return {
    id,
    role,
    amountMinor,
    currency,
    accountId: role === "source_account" ? `source-${currency}` : `destination-${currency}`,
  };
}
