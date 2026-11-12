import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SUPPORTED_MONEY_MINOR, MIN_SUPPORTED_MONEY_MINOR } from "@solverfin/domain/money";

import { parsePostgresBigIntAsSafeNumber } from "./db-safe-integer.js";

test("postgres bigint parser preserves the supported money boundaries exactly", () => {
  assert.equal(
    parsePostgresBigIntAsSafeNumber(String(MAX_SUPPORTED_MONEY_MINOR)),
    MAX_SUPPORTED_MONEY_MINOR,
  );
  assert.equal(
    parsePostgresBigIntAsSafeNumber(String(MIN_SUPPORTED_MONEY_MINOR)),
    MIN_SUPPORTED_MONEY_MINOR,
  );
});

test("postgres bigint parser rejects values that would lose JSON number precision", () => {
  assert.throws(() => parsePostgresBigIntAsSafeNumber("9007199254740992"));
  assert.throws(() => parsePostgresBigIntAsSafeNumber("-9007199254740992"));
});
