import assert from "node:assert/strict";
import test from "node:test";

import {
  addMonthsAnchored,
  allocateInstallmentAmount,
} from "./repositories/manual-installments.js";

test("preserva a ancora mensal apos fevereiro", () => {
  assert.equal(addMonthsAnchored("2026-01-31", 0), "2026-01-31");
  assert.equal(addMonthsAnchored("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsAnchored("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonthsAnchored("2028-01-31", 1), "2028-02-29");
});

test("distribui o resto nas ultimas sequencias do total original", () => {
  assert.deepEqual(
    [1, 2, 3].map((sequence) => allocateInstallmentAmount(10_000, "total", 3, sequence)),
    [3333, 3333, 3334],
  );
  assert.equal(allocateInstallmentAmount(2500, "per_installment", 12, 7), 2500);
});
