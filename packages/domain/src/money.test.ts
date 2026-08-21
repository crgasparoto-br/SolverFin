import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SUPPORTED_MONEY_MINOR,
  MIN_SUPPORTED_MONEY_MINOR,
  MoneyRangeError,
  addSafeMoneyMinor,
  assertSafeMoneyMinor,
  parseSafeMoneyMinor,
} from "./money.js";

test("accepts the complete safe JSON integer boundary", () => {
  assert.equal(
    assertSafeMoneyMinor(MAX_SUPPORTED_MONEY_MINOR),
    MAX_SUPPORTED_MONEY_MINOR,
  );
  assert.equal(
    assertSafeMoneyMinor(MIN_SUPPORTED_MONEY_MINOR),
    MIN_SUPPORTED_MONEY_MINOR,
  );
  assert.equal(
    parseSafeMoneyMinor(String(MAX_SUPPORTED_MONEY_MINOR)),
    MAX_SUPPORTED_MONEY_MINOR,
  );
  assert.equal(
    parseSafeMoneyMinor(String(MIN_SUPPORTED_MONEY_MINOR)),
    MIN_SUPPORTED_MONEY_MINOR,
  );
});

test("rejects values outside the exact JSON number range", () => {
  const above = BigInt(MAX_SUPPORTED_MONEY_MINOR) + 1n;
  const below = BigInt(MIN_SUPPORTED_MONEY_MINOR) - 1n;

  assert.throws(() => parseSafeMoneyMinor(above), MoneyRangeError);
  assert.throws(() => parseSafeMoneyMinor(below), MoneyRangeError);
  assert.throws(
    () => assertSafeMoneyMinor(Number.MAX_SAFE_INTEGER + 1),
    MoneyRangeError,
  );
  assert.throws(() => parseSafeMoneyMinor("1.5"), MoneyRangeError);
});

test("large aggregates remain exact and fail closed on overflow", () => {
  assert.equal(
    addSafeMoneyMinor([
      3_000_000_000_000_000,
      3_000_000_000_000_000,
      3_000_000_000_000_000,
    ]),
    9_000_000_000_000_000,
  );

  assert.throws(
    () => addSafeMoneyMinor([MAX_SUPPORTED_MONEY_MINOR, 1]),
    MoneyRangeError,
  );
});
