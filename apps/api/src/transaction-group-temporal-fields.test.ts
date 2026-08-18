import assert from "node:assert/strict";

import {
  resolveTransactionGroupCloneTemporalFields,
  resolveTransactionGroupUpdateTemporalFields,
} from "./transaction-group-temporal-fields.js";

const posted = {
  status: "POSTED",
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-20",
};

assert.deepEqual(resolveTransactionGroupUpdateTemporalFields(posted, { plannedOn: "2034-02-22" }), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-22",
  effectiveOn: "2034-03-20",
});
assert.deepEqual(resolveTransactionGroupUpdateTemporalFields(posted, { effectiveOn: "2034-03-25" }), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-25",
});
assert.deepEqual(resolveTransactionGroupUpdateTemporalFields(posted, { date: "2034-03-27" }), {
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
assert.deepEqual(resolveTransactionGroupUpdateTemporalFields(planned, { date: "2034-02-23" }), {
  occurredOn: "2034-01-11",
  plannedOn: "2034-02-23",
  effectiveOn: null,
});

assert.deepEqual(resolveTransactionGroupCloneTemporalFields(posted, {}), {
  occurredOn: "2034-01-10",
  plannedOn: "2034-02-15",
  effectiveOn: "2034-03-20",
});
assert.deepEqual(resolveTransactionGroupCloneTemporalFields(posted, { date: "2035-04-05" }), {
  occurredOn: "2035-04-05",
  plannedOn: "2035-04-05",
  effectiveOn: "2035-04-05",
});
