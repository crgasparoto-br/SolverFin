import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialIndexError,
  calculateAccountRemuneration,
  parseBcbSgsCdiResponse,
  validateRemunerationPercentage,
} from "./financial-indexes.js";

test("parses BCB SGS CDI entries and normalizes dates and factors", () => {
  const rates = parseBcbSgsCdiResponse([
    { data: "13/07/2026", valor: "0,055131" },
    { data: "10/07/2026", valor: "0,055131" },
  ]);

  assert.deepEqual(
    rates.map((rate) => ({
      referenceOn: rate.referenceOn,
      dailyRatePercent: rate.dailyRatePercent,
      dailyFactor: rate.dailyFactor,
      source: rate.source,
    })),
    [
      {
        referenceOn: "2026-07-10",
        dailyRatePercent: 0.055131,
        dailyFactor: 1.00055131,
        source: "BCB_SGS_12",
      },
      {
        referenceOn: "2026-07-13",
        dailyRatePercent: 0.055131,
        dailyFactor: 1.00055131,
        source: "BCB_SGS_12",
      },
    ],
  );
});

test("rejects duplicate or malformed CDI entries", () => {
  assert.throws(
    () =>
      parseBcbSgsCdiResponse([
        { data: "13/07/2026", valor: "0,055131" },
        { data: "13/07/2026", valor: "0,055131" },
      ]),
    (error: unknown) =>
      error instanceof FinancialIndexError && error.code === "FINANCIAL_INDEX_RESPONSE_INVALID",
  );

  assert.throws(
    () => parseBcbSgsCdiResponse([{ data: "31/02/2026", valor: "0,055131" }]),
    (error: unknown) =>
      error instanceof FinancialIndexError && error.code === "FINANCIAL_INDEX_DATE_INVALID",
  );
});

test("calculates account remuneration using CDI rate and configured percentage", () => {
  const result = calculateAccountRemuneration({
    balanceMinor: 1_000_000,
    dailyRatePercent: 0.055131,
    remunerationPercent: 100,
  });

  assert.equal(result.appliedDailyRatePercent, 0.055131);
  assert.equal(result.amountMinor, 551);
});

test("does not generate remuneration for zero or negative balances", () => {
  assert.equal(
    calculateAccountRemuneration({
      balanceMinor: 0,
      dailyRatePercent: 0.055131,
      remunerationPercent: 100,
    }).amountMinor,
    0,
  );
  assert.equal(
    calculateAccountRemuneration({
      balanceMinor: -100,
      dailyRatePercent: 0.055131,
      remunerationPercent: 100,
    }).amountMinor,
    0,
  );
});

test("validates account remuneration percentage", () => {
  assert.equal(validateRemunerationPercentage(100), 100);
  assert.throws(
    () => validateRemunerationPercentage(0),
    (error: unknown) =>
      error instanceof FinancialIndexError && error.code === "ACCOUNT_REMUNERATION_PERCENT_INVALID",
  );
});
