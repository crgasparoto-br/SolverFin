import assert from "node:assert/strict";
import test from "node:test";

import { assertGroupFormGeometry, formRowCounts } from "./form-geometry.mjs";

const field = (name, top, left) => ({ name, top, left });
const geometry = (fields) => ({
  fields,
  labelOverflow: [],
  labelCollisions: [],
  moneyClipping: [],
  currencyFields: 1,
  money: [{}, {}, {}],
});
const valid = [
  field("Amount", 0, 0),
  field("Description", 50, 0),
  field("Date", 100, 0),
  field("Status", 100, 260),
  field("Account", 150, 0),
  field("Kind", 200, 0),
  field("Moeda", 200, 260),
];

test("full-width fields coexist with actual pairs, independent of DOM order", () => {
  const counts = formRowCounts(valid).map((row) => row.count);
  assert.deepEqual(counts, [1, 1, 2, 1, 2]);
  assertGroupFormGeometry(geometry([...valid].reverse()), 2);
});

test("3+1 is not two columns, even though the old average says two", () => {
  const uneven = [field("A", 0, 0), field("B", 0, 120), field("C", 0, 240), field("D", 50, 0)];
  assert.equal(uneven.length / new Set(uneven.map((item) => item.top)).size, 2);
  const counts = formRowCounts(uneven).map((row) => row.count);
  assert.deepEqual(counts, [3, 1]);
  const wrong = geometry([...uneven, field("E", 100, 0), field("F", 100, 120)]);
  assert.throws(() => assertGroupFormGeometry(wrong, 2), /columns/);
});

test("a late DOM field placed on an earlier row cannot escape the measurement", () => {
  const wrong = geometry([...valid, field("Late", 100, 500)]);
  assert.throws(() => assertGroupFormGeometry(wrong, 2), /columns/);
});

test("all mobile fields must form one column", () => {
  const mobile = valid.map((item, index) => ({ ...item, top: index * 60, left: 0 }));
  assertGroupFormGeometry(geometry(mobile), 1);
  assert.throws(() => assertGroupFormGeometry(geometry(valid), 1), /columns/);
});

test("label overflow, collision, cropped money and duplicate currency fail independently", () => {
  const cases = [
    ["labelOverflow", ["Date"]],
    ["labelCollisions", [["Date", "Status"]]],
    ["moneyClipping", [{ value: "123456789,00" }]],
    ["currencyFields", 2],
  ];
  for (const [key, value] of cases) {
    assert.throws(() => assertGroupFormGeometry({ ...geometry(valid), [key]: value }, 2));
  }
});
