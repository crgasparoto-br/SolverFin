import assert from "node:assert/strict";

import {
  resolveTransactionGroupCloneTemporalFields,
  resolveTransactionGroupUpdateTemporalFields,
} from "./transaction-group-temporal-fields.js";

const update = resolveTransactionGroupUpdateTemporalFields;
const clone = resolveTransactionGroupCloneTemporalFields;

const posted = {
  status: "POSTED",
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-20",
};

assert.deepEqual(update(posted, { plannedOn: "2034-02-22" }), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-22",
  effectiveOn: "2034-03-20",
});
assert.deepEqual(update(posted, { effectiveOn: "2034-03-25" }), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-25",
});
assert.deepEqual(update(posted, { date: "2034-03-27" }), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-27",
});

const planned = {
  status: "PLANNED",
  occurredOn: "2034-01-11",
  plannedOn: "2034-02-16",
  effectiveOn: null,
};
assert.deepEqual(update(planned, { date: "2034-02-23" }), {
  occurredOn: "2034-01-11",
  plannedOn: "2034-02-23",
  effectiveOn: null,
});

assert.deepEqual(clone(posted, {}), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-20",
});
assert.deepEqual(clone(posted, { date: "2035-04-05" }), {
  occurredOn: "2035-04-05",
  plannedOn: "2035-04-05",
  effectiveOn: "2035-04-05",
});
