import assert from "node:assert/strict";

import { readCreateTransactionOccurredOn } from "./transaction-create-temporal-input.js";

assert.equal(
  readCreateTransactionOccurredOn({ occurredOn: "2035-01-10", plannedOn: "2035-02-15" }),
  "2035-01-10",
  "explicit economic date must be preserved",
);
assert.equal(
  readCreateTransactionOccurredOn({ plannedOn: "2035-02-15" }),
  "",
  "plannedOn must not become a creation fallback for occurredOn",
);
assert.equal(
  readCreateTransactionOccurredOn({ effectiveOn: "2035-03-20" }),
  "",
  "effectiveOn must not become a creation fallback for occurredOn",
);
assert.equal(
  readCreateTransactionOccurredOn({ plannedOn: "2035-02-15", effectiveOn: "2035-03-20" }),
  "",
  "other temporal facts must not fabricate the economic event date",
);
