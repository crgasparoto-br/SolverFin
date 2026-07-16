import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { operationFormsScript } from "./admin-financial-indexes-page.js";

interface SubmitEventLike {
  preventDefault(): void;
}

type SubmitListener = (event: SubmitEventLike) => Promise<void>;

const status = { className: "", textContent: "" };
const submit = { disabled: false };
let listener: SubmitListener | undefined;
let payloadEntries: Array<[string, string]> = [
  ["startsOn", "2026-07-17"],
  ["endsOn", "2026-07-16"],
];
let fetchCalls = 0;

const form = {
  dataset: { path: "/api/admin/financial-indexes/cdi/import" },
  querySelector(selector: string): typeof status | typeof submit | null {
    if (selector === "[data-form-status]") return status;
    if (selector === 'button[type="submit"]') return submit;
    return null;
  },
  addEventListener(eventName: string, callback: SubmitListener): void {
    if (eventName === "submit") listener = callback;
  },
};

class FakeFormData {
  entries(): IterableIterator<[string, string]> {
    return payloadEntries.values();
  }
}

runInNewContext(operationFormsScript(), {
  document: {
    querySelectorAll: () => [form],
  },
  FormData: FakeFormData,
  fetch: async () => {
    fetchCalls += 1;
    throw new Error("network unavailable");
  },
  window: {
    setTimeout: () => undefined,
    location: { reload: () => undefined },
  },
  Object,
  JSON,
});

assert.ok(listener);
const event = { preventDefault: () => undefined };

await listener(event);
assert.equal(fetchCalls, 0);
assert.equal(submit.disabled, false);
assert.equal(status.className, "form-status error");
assert.match(status.textContent, /data inicial não pode ser posterior/i);

payloadEntries = [
  ["startsOn", "2026-07-16"],
  ["endsOn", "2026-07-16"],
];
await listener(event);
assert.equal(fetchCalls, 1);
assert.equal(submit.disabled, false);
assert.equal(status.className, "form-status error");
assert.match(status.textContent, /tente novamente/i);
