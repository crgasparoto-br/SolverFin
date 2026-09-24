import assert from "node:assert/strict";

import type {
  CashFlowProjection,
  CashFlowProjectionMovement,
  CashFlowProjectionPoint,
} from "./cash-flow-projection.js";
import { buildFreeToSpendSummary } from "./free-to-spend.js";

preservesCashWhenTrajectoryStaysPositive();
detectsIntermediateDeficitBeforeLaterIncome();
keepsReferenceDateOnTiedMinimum();
keepsCurrenciesIndependentAcrossCrossCurrencyTransfer();
marksIncompleteProjectionUnavailableWithoutSyntheticNumbers();
marksMissingRequestedCurrencyUnavailable();

function preservesCashWhenTrajectoryStaysPositive(): void {
  const result = indicator(
    projection([
      block("BRL", 500_000, [point("2037-12-02", 180_000)]),
    ]),
    "BRL",
  );

  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.minimumProjectedBalanceMinor, 180_000);
  assert.equal(result.freeToSpendMinor, 180_000);
  assert.equal(result.projectedDeficitMinor, 0);
  assert.equal(result.minimumBalanceOn, "2037-12-02");
}

function detectsIntermediateDeficitBeforeLaterIncome(): void {
  const result = indicator(
    projection([
      block("BRL", 100_000, [
        point("2037-12-05", -20_000, [movement("expense", -120_000, "BRL", "2037-12-05")]),
        point("2037-12-20", 300_000, [movement("income", 320_000, "BRL", "2037-12-20")]),
      ]),
    ]),
    "BRL",
  );

  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.minimumProjectedBalanceMinor, -20_000);
  assert.equal(result.freeToSpendMinor, 0);
  assert.equal(result.projectedDeficitMinor, 20_000);
  assert.equal(result.minimumBalanceOn, "2037-12-05");
  assert.equal(result.limitingPoint.movements[0]?.commitmentId, "expense");
}

function keepsReferenceDateOnTiedMinimum(): void {
  const result = indicator(
    projection([
      block("BRL", 100_000, [
        point("2037-12-01", 100_000),
        point("2037-12-02", 120_000),
      ]),
    ]),
    "BRL",
  );

  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.minimumProjectedBalanceMinor, 100_000);
  assert.equal(result.minimumBalanceOn, "2037-11-30");
  assert.equal(result.limitingPoint.position, "opening");
  assert.deepEqual(result.limitingPoint.movements, []);
}

function keepsCurrenciesIndependentAcrossCrossCurrencyTransfer(): void {
  const result = buildFreeToSpendSummary(
    projection([
      block("BRL", 100_000, [
        point("2037-12-02", 46_168, [movement("transfer", -53_832, "BRL", "2037-12-02")]),
      ]),
      block("USD", 20_000, [
        point("2037-12-02", 30_000, [movement("transfer", 10_000, "USD", "2037-12-02")]),
      ]),
    ]),
  );

  const brl = result.currencyBlocks.find((item) => item.currency === "BRL");
  const usd = result.currencyBlocks.find((item) => item.currency === "USD");
  assert.equal(brl?.status, "available");
  assert.equal(usd?.status, "available");
  if (brl?.status !== "available" || usd?.status !== "available") return;
  assert.equal(brl.freeToSpendMinor, 46_168);
  assert.equal(usd.freeToSpendMinor, 20_000);
  assert.equal(brl.limitingPoint.movements[0]?.commitmentId, "transfer");
  assert.equal(usd.minimumBalanceOn, "2037-11-30");
}

function marksIncompleteProjectionUnavailableWithoutSyntheticNumbers(): void {
  const source = projection([block("BRL", 50_000, [])]);
  source.currencyBlocks[0]!.points.pop();
  const result = indicator(source, "BRL");

  assert.deepEqual(result, {
    currency: "BRL",
    status: "unavailable",
    reason: "projection-incomplete",
  });
  assert.equal("freeToSpendMinor" in result, false);
  assert.equal("projectedDeficitMinor" in result, false);
}

function marksMissingRequestedCurrencyUnavailable(): void {
  const source = projection([block("BRL", 50_000, [])]);
  source.currency = "USD";
  source.currencyBlocks = [];
  const result = indicator(source, "USD");

  assert.deepEqual(result, {
    currency: "USD",
    status: "unavailable",
    reason: "projection-unavailable",
  });
}

function indicator(projectionValue: CashFlowProjection, currency: string) {
  const result = buildFreeToSpendSummary(projectionValue).currencyBlocks.find(
    (item) => item.currency === currency,
  );
  assert.ok(result, `expected free-to-spend block ${currency}`);
  return result;
}

function projection(currencyBlocks: CashFlowProjection["currencyBlocks"]): CashFlowProjection {
  return {
    referenceDate: "2037-11-30",
    horizonDays: 30,
    from: "2037-12-01",
    to: "2037-12-30",
    currencyBlocks,
  };
}

function block(
  currency: string,
  openingBalanceMinor: number,
  overrides: CashFlowProjectionPoint[],
): CashFlowProjection["currencyBlocks"][number] {
  const byDate = new Map(overrides.map((item) => [item.date, item]));
  let previous = openingBalanceMinor;
  const points = Array.from({ length: 30 }, (_, index) => {
    const date = addDays("2037-11-30", index + 1);
    const override = byDate.get(date);
    if (override) {
      previous = override.closingBalanceMinor;
      return override;
    }
    return point(date, previous);
  });
  return {
    currency,
    openingBalanceMinor,
    closingBalanceMinor: points.at(-1)?.closingBalanceMinor ?? openingBalanceMinor,
    points,
  };
}

function point(
  date: string,
  closingBalanceMinor: number,
  movements: CashFlowProjectionMovement[] = [],
): CashFlowProjectionPoint {
  return {
    date,
    netMovementMinor: movements.reduce((sum, item) => sum + item.amountMinor, 0),
    closingBalanceMinor,
    movements,
  };
}

function movement(
  commitmentId: string,
  amountMinor: number,
  currency: string,
  plannedOn: string,
): CashFlowProjectionMovement {
  return {
    commitmentId,
    effectId: `${commitmentId}-${currency}`,
    plannedOn,
    description: commitmentId,
    source: { kind: "transaction", id: commitmentId, transactionId: commitmentId },
    role: amountMinor < 0 ? "source_account" : "destination_account",
    amountMinor,
    currency,
  };
}

function addDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
