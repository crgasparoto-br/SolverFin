import assert from "node:assert/strict";
import test from "node:test";

import { shouldRunDailyTask } from "./account-remuneration-scheduler.js";

test("runs once per UTC date after the configured hour", () => {
  const now = new Date("2026-07-14T10:15:00.000Z");

  assert.equal(shouldRunDailyTask(now, 10, undefined), true);
  assert.equal(shouldRunDailyTask(now, 10, "2026-07-14"), false);
});

test("does not run before the configured UTC hour", () => {
  const now = new Date("2026-07-14T09:59:59.000Z");

  assert.equal(shouldRunDailyTask(now, 10, undefined), false);
});
