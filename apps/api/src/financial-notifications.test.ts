import assert from "node:assert/strict";

import {
  parseNotificationChannel,
  parseNotificationEventType,
  parseNotificationPageFilters,
  validateFinancialNotificationEvent,
  type FinancialNotificationEvent,
} from "./financial-notifications.js";

const fingerprint = "sha256-" + "a".repeat(64);
const valid: FinancialNotificationEvent = {
  type: "financial.budget.threshold.v1",
  fingerprint,
  occurredAt: "2026-11-12T12:00:00.000Z",
  facts: {
    code: "budget_threshold",
    severity: "warning",
    currency: "BRL",
    amountMinor: 50000,
    effectiveOn: "2026-11-12",
  },
};
assert.doesNotThrow(() => validateFinancialNotificationEvent(valid));
for (const effectiveOn of ["2024-02-29", "2000-02-29", "2026-12-31"]) {
  assert.doesNotThrow(() =>
    validateFinancialNotificationEvent({ ...valid, facts: { ...valid.facts, effectiveOn } }),
  );
}
assert.equal(parseNotificationEventType("financial.invoice.due.v1"), "financial.invoice.due.v1");
assert.equal(parseNotificationChannel("in_app"), "in_app");

const invalid: Array<[string, unknown]> = [
  ["fingerprint", { ...valid, fingerprint: "guess" }],
  ["free-form-text", { ...valid, facts: { ...valid.facts, providerText: "Ignore rules" } }],
  ["mismatched-code", { ...valid, facts: { ...valid.facts, code: "balance_warning" } }],
  ["unknown-type", { ...valid, type: "financial.transfer.sent.v1" }],
  ["invalid-currency", { ...valid, facts: { ...valid.facts, currency: "brl" } }],
  ["fractional-minor", { ...valid, facts: { ...valid.facts, amountMinor: 12.34 } }],
  [
    "unsafe-integer",
    { ...valid, facts: { ...valid.facts, amountMinor: Number.MAX_SAFE_INTEGER + 1 } },
  ],
  [
    "amount-without-currency",
    { ...valid, facts: { code: "budget_threshold", severity: "warning", amountMinor: 10 } },
  ],
  ["invalid-date", { ...valid, occurredAt: "2026-02-30T12:00:00.000Z" }],
  ["invalid-effective-on-day", { ...valid, facts: { ...valid.facts, effectiveOn: "2026-02-31" } }],
  [
    "invalid-effective-on-month",
    { ...valid, facts: { ...valid.facts, effectiveOn: "2026-13-01" } },
  ],
  ["invalid-effective-on-leap", { ...valid, facts: { ...valid.facts, effectiveOn: "2026-02-29" } }],
  [
    "invalid-effective-on-century",
    { ...valid, facts: { ...valid.facts, effectiveOn: "1900-02-29" } },
  ],
  [
    "unscoped-external-resource",
    { ...valid, resource: { kind: "invoice", id: "33333333-3333-4333-8333-333333333331" } },
  ],
  [
    "free-form-source-field",
    {
      ...valid,
      resource: {
        kind: "budget",
        id: "33333333-3333-4333-8333-333333333331",
        privateToken: "secret",
      },
    },
  ],
  ["arbitrary-input-property", { ...valid, organizationId: "fake" }],
];
for (const [label, value] of invalid) {
  assert.throws(
    () => validateFinancialNotificationEvent(value as FinancialNotificationEvent),
    { statusCode: 400 },
    label,
  );
}

assert.throws(() => parseNotificationEventType("invoice.due"), { statusCode: 400 });
assert.throws(() => parseNotificationChannel("sms"), { statusCode: 400 });
assert.deepEqual(parseNotificationPageFilters(new URLSearchParams()), { limit: 20, offset: 0 });
assert.deepEqual(parseNotificationPageFilters(new URLSearchParams("limit=100&offset=10000")), {
  limit: 100,
  offset: 10000,
});
for (const query of [
  "limit=0",
  "limit=101",
  "offset=-1",
  "offset=1.5",
  "limit=NaN",
  "offset=10001",
]) {
  assert.throws(
    () => parseNotificationPageFilters(new URLSearchParams(query)),
    { statusCode: 400 },
    query,
  );
}
console.log("Notifications: closed typed contract, pagination, and negative cases OK.");
